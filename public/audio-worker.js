/**
 * Motor de audio — corre en un Web Worker para no congelar la interfaz.
 *
 * Es el puerto directo de audio.py, con los números que salieron de medir en
 * la fase 0. Vive en public/ y no pasa por el build de Vite a propósito:
 * `importScripts` necesita archivos servidos tal cual, y así el motor queda
 * independiente del framework de la UI.
 *
 * Protocolo:
 *   ← { tipo: "cargar",  voiceId }
 *   ← { tipo: "generar", ejercicios: [{ nombre, seg, cambioLado, instrucciones }], velocidad }
 *   ← { tipo: "probar",  texto, velocidad }
 *   → { tipo: "estado",   fase, detalle }
 *   → { tipo: "descarga", cargado, total }
 *   → { tipo: "progreso", hecho, total, nombre }
 *   → { tipo: "voz",      voiceId, bytes, sampleRate, techo, hilos }
 *   → { tipo: "muestra",  mp3, velocidad }
 *   → { tipo: "listo",    mp3, duracionMs, bytes, msGeneracion }
 *   → { tipo: "error",    mensaje }
 */

/* eslint-disable no-undef */
"use strict";

const ORT_BASE = "https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.18.0/";
const LAME_URL = "https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.0/lame.min.js";
const PHON_BASE =
  "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize";
const CACHE = "voces-piper-v2";

/**
 * De dónde sale el modelo de voz.
 *
 * Estuvo apuntando a huggingface.co y un día dejó de funcionar desde el
 * navegador: la descarga moría con "Failed to fetch" en Chrome y
 * "NetworkError" en Firefox, aunque el mismo link abierto a mano bajara el
 * archivo sin problema. La URL `/resolve/` no devuelve el archivo: devuelve
 * una redirección a una URL firmada, y esa redirección no sobrevive a un
 * `fetch` con CORS desde otro origen. Una navegación del navegador sí la
 * sigue; de ahí que pareciera que el link "andaba".
 *
 * La lección del episodio, que vale más que el arreglo: el archivo sin el
 * cual la aplicación entera no hace nada no puede vivir en un dominio ajeno
 * cuyo comportamiento no controlamos ni nos avisan cuando cambia.
 *
 * Ahora sale de un repositorio propio servido por raw.githubusercontent.com,
 * que responde `access-control-allow-origin: *`, no redirige a ningún lado y
 * —verificado— funciona tanto con cross-origin isolation como sin ella.
 */
const VOZ_BASE = "https://raw.githubusercontent.com/agustingodoyc/voces-piper/main";

/* Los archivos están planos en el repositorio: `<id>.onnx` y `<id>.onnx.json`.
   La estructura de carpetas por idioma que usa Piper no aporta nada cuando el
   repositorio tiene dos voces. Sumar una es agregar una línea acá y otra en
   src/tipos.ts, que es la lista que se ve en pantalla. */
const VOCES = {
  "es_MX-claude-high": "es_MX-claude-high.onnx",
  "es_ES-carlfm-x_low": "es_ES-carlfm-x_low.onnx",
};

/* ── Constantes del armado ─────────────────────────────────────────────
   Cajas fijas como en audio.py: primero se acelera para entrar y sólo si
   ni acelerada entra, la caja cede. Nunca se corta una palabra.          */
const MS_CAJA_ANUNCIO = 2000;
const MS_CAJA_AVISO = 2000;
const MS_CAJA_PREPARACION = 3000;
const MS_COLCHON_MIN = 200;
const MS_PASO_BLOQUE = 100;
const MS_FADE_EJECUCION = 500;
const MAX_ACELERACION_NATURAL = 1.6; // más que esto, un anuncio suena atropellado
const MARGEN_ACELERACION = 0.05; // acelerar lo justo deja la frase al borde
/* La velocidad a la que se leen las instrucciones ahora la elige quien usa la
   página; esto es sólo el punto de partida. 1,25× salió de probarlo entrenando:
   a 2× y a 1,5× las instrucciones eran imposibles de seguir en movimiento. */
const VELOCIDAD_POR_DEFECTO = 1.25;
const MAX_PEDIDO = 4.0;
const KBPS = 96;

const TEXTO_CAMBIO_LADO = "Cambio de lado.";
const TEXTO_FINAL = "Rutina finalizada. Excelente entrenamiento.";
const TEXTO_CALIBRACION = "Próximo ejercicio. Elevación lateral de hombros.";

const anunciar = (nombre) => `Ahora, ${nombre}.`;
const preparar = (siguiente) => `Próximo ejercicio. ${siguiente}.`;

const enviar = (msg, transfer) => self.postMessage(msg, transfer || []);
const estado = (fase, detalle) => enviar({ tipo: "estado", fase, detalle });

/* ════════════════════════════════════════════════════════════════════
   Carga de librerías y del modelo
   ════════════════════════════════════════════════════════════════════ */

let librerias = false;

function cargarLibrerias() {
  if (librerias) return;
  importScripts(ORT_BASE + "ort.min.js", LAME_URL);
  librerias = true;
}

async function traer(url, onProgreso) {
  const cache = await caches.open(CACHE);
  const guardado = await cache.match(url);
  if (guardado) return guardado;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo bajar la voz (HTTP ${res.status}).`);

  const total = Number(res.headers.get("content-length")) || 0;
  const lector = res.body.getReader();
  const partes = [];
  let cargado = 0;

  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    partes.push(value);
    cargado += value.length;
    onProgreso?.(cargado, total);
  }

  await cache.put(url, new Response(new Blob(partes)));
  return (await cache.match(url)) ?? new Response(new Blob(partes));
}

const modelo = {
  sesion: null,
  cfg: null,
  voiceId: null,
  rate: 22050,
  base: 1,
  ruido: 0.667,
  ruidoW: 0.8,
};

async function cargarVoz(voiceId) {
  if (modelo.voiceId === voiceId && modelo.sesion) return;

  const ruta = VOCES[voiceId];
  if (!ruta) throw new Error(`Voz desconocida: ${voiceId}`);

  cargarLibrerias();

  estado("configuracion");
  const cfg = JSON.parse(await (await traer(`${VOZ_BASE}/${ruta}.json`)).text());

  estado("modelo");
  const res = await traer(`${VOZ_BASE}/${ruta}`, (cargado, total) =>
    enviar({ tipo: "descarga", cargado, total })
  );
  const buffer = await res.arrayBuffer();

  ort.env.wasm.wasmPaths = ORT_BASE;
  /* Varios hilos sólo si el navegador los habilita. SharedArrayBuffer existe
     únicamente en páginas con cross-origin isolation, y hoy esos headers están
     apagados porque rompían la bajada del modelo (ver public/_headers). Pedir
     hilos igual haría que ONNX intente y falle en vez de caer parado en su
     versión de un hilo. */
  const hilos = self.crossOriginIsolated
    ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1))
    : 1;
  ort.env.wasm.numThreads = hilos;
  ort.env.logLevel = "error";

  estado("sesion");
  modelo.sesion = await ort.InferenceSession.create(buffer);
  modelo.cfg = cfg;
  modelo.voiceId = voiceId;
  modelo.rate = cfg.audio.sample_rate;
  modelo.base = cfg.inference.length_scale;
  modelo.ruido = cfg.inference.noise_scale;
  modelo.ruidoW = cfg.inference.noise_w;
  calibracion = null; // cada voz tiene su propia curva

  enviar({
    tipo: "voz",
    voiceId,
    bytes: buffer.byteLength,
    sampleRate: modelo.rate,
    /* Se informa cuántos hilos consiguió de verdad, no cuántos se pidieron.
       Es la única forma de notar desde afuera que los headers de aislamiento
       se cayeron: la app seguiría andando, sólo que varias veces más lenta, y
       sin este número nadie se enteraría hasta medirlo con un cronómetro. */
    hilos,
  });

  /* Calibrar acá y no al generar. Cuesta cuatro síntesis cortas —un par de
     segundos— sobre una carga que ya tardó bastante, y a cambio la interfaz
     sabe desde el principio hasta qué velocidad llega esta voz. Sin eso, el
     selector ofrecería 2× en una voz cuyo techo real es 1,7× y entregaría
     algo distinto de lo que dice: una interfaz que miente. */
  await calibrar();
}

/* ════════════════════════════════════════════════════════════════════
   Fonemización y síntesis
   ════════════════════════════════════════════════════════════════════ */

let fonemizador = null;
let salidaFonemas = [];

async function construirFonemizador() {
  if (typeof createPiperPhonemize === "undefined") {
    estado("fonemizador");
    importScripts(PHON_BASE + ".js");
  }
  return createPiperPhonemize({
    noExitRuntime: true,
    print: (linea) => salidaFonemas.push(linea),
    printErr: () => {},
    locateFile: (url) =>
      url.endsWith(".wasm") ? PHON_BASE + ".wasm" : url.endsWith(".data") ? PHON_BASE + ".data" : url,
  });
}

/**
 * Devuelve una secuencia de phoneme ids por oración.
 * Piper sintetiza oración por oración y concatena el audio; hacer otra cosa
 * (quedarse con la primera, por ejemplo) trunca los textos largos.
 */
async function fonemizar(texto) {
  const correr = (mod) => {
    salidaFonemas = [];
    mod.callMain([
      "-l",
      modelo.cfg.espeak.voice,
      "--input",
      JSON.stringify([{ text: texto.trim() }]),
      "--espeak_data",
      "/espeak-ng-data",
    ]);
    return salidaFonemas.map((l) => JSON.parse(l).phoneme_ids);
  };

  fonemizador = fonemizador ?? (await construirFonemizador());
  try {
    return correr(fonemizador);
  } catch {
    fonemizador = await construirFonemizador();
    return correr(fonemizador);
  }
}

/** Cache de frases: un ejercicio repetido en dos rutinas no se sintetiza dos veces. */
const cacheFrases = new Map();

/**
 * `velocidad` es lo que se le PIDE al modelo, no lo que entrega.
 * length_scale no es lineal — ver la calibración más abajo.
 *
 * noise_w va en cero a propósito: con el ruido del modelo la misma frase dura
 * distinto en cada síntesis, y encajar bloques se vuelve una lotería.
 */
async function sintetizar(texto, velocidad = 1) {
  const clave = `${velocidad.toFixed(3)}|${texto}`;
  const guardado = cacheFrases.get(clave);
  if (guardado) return guardado;

  const oraciones = await fonemizar(texto);
  if (!oraciones.length) throw new Error(`El fonemizador no devolvió nada para: ${texto}`);

  const lengthScale = modelo.base / velocidad;
  const partes = [];

  for (const ids of oraciones) {
    const feeds = {
      input: new ort.Tensor("int64", BigInt64Array.from(ids, BigInt), [1, ids.length]),
      input_lengths: new ort.Tensor("int64", BigInt64Array.from([BigInt(ids.length)])),
      scales: new ort.Tensor("float32", Float32Array.from([modelo.ruido, lengthScale, 0])),
    };
    if (Object.keys(modelo.cfg.speaker_id_map ?? {}).length) {
      feeds.sid = new ort.Tensor("int64", BigInt64Array.from([0n]));
    }
    const salida = await modelo.sesion.run(feeds);
    partes.push(salida.output.data);
  }

  const audio = unir(partes);
  cacheFrases.set(clave, audio);
  return audio;
}

/* ════════════════════════════════════════════════════════════════════
   Calibración de velocidad
   ────────────────────────────────────────────────────────────────────
   Piper redondea la duración de cada fonema a frames enteros con un mínimo
   de uno, así que pedir 2× no devuelve 2×: la curva satura. Se mide una vez
   por voz y después se invierte.
   ════════════════════════════════════════════════════════════════════ */

let calibracion = null;

function pedidaPara(deseado) {
  const c = calibracion;
  if (!c || c.length < 2) return Math.min(deseado, MAX_PEDIDO);
  if (deseado <= c[0].real) return c[0].pedida;
  for (let i = 1; i < c.length; i++) {
    if (deseado <= c[i].real) {
      const tramo = c[i].real - c[i - 1].real || 1;
      const t = (deseado - c[i - 1].real) / tramo;
      return c[i - 1].pedida + t * (c[i].pedida - c[i - 1].pedida);
    }
  }
  return c[c.length - 1].pedida; // pedir más no acelera más
}

async function calibrar() {
  if (calibracion) return;
  estado("calibrando");

  const base = duracionMs(await sintetizar(TEXTO_CALIBRACION, 1));
  const filas = [];
  for (const pedida of [1, 1.5, 2, 3]) {
    const ms = pedida === 1 ? base : duracionMs(await sintetizar(TEXTO_CALIBRACION, pedida));
    filas.push({ pedida, real: base / ms });
  }

  // La curva satura: sólo sirve el tramo estrictamente creciente.
  calibracion = [];
  for (const f of filas) {
    if (!calibracion.length || f.real > calibracion[calibracion.length - 1].real + 0.01) {
      calibracion.push(f);
    }
  }
  enviar({ tipo: "voz", voiceId: modelo.voiceId, techo: calibracion[calibracion.length - 1].real });
}

/* ════════════════════════════════════════════════════════════════════
   Armado de la pista — puerto directo de audio.py
   ════════════════════════════════════════════════════════════════════ */

const msAMuestras = (ms) => Math.round((ms * modelo.rate) / 1000);
const duracionMs = (buf) => (buf.length / modelo.rate) * 1000;

/** _concatenar: una sola pasada, sin el coste cuadrático de `+=`. */
function unir(partes) {
  const total = partes.reduce((a, p) => a + p.length, 0);
  const salida = new Float32Array(total);
  let off = 0;
  for (const p of partes) {
    salida.set(p, off);
    off += p.length;
  }
  return salida;
}

/** _encajar: duración exacta al nivel de la muestra. */
function encajar(buf, n) {
  if (buf.length === n) return buf;
  if (buf.length > n) return buf.subarray(0, n);
  const salida = new Float32Array(n);
  salida.set(buf);
  return salida;
}

/** fade_out sobre las últimas `ms`, in place. */
function fundir(buf, ms) {
  const n = Math.min(msAMuestras(ms), buf.length);
  const desde = buf.length - n;
  for (let i = 0; i < n; i++) buf[desde + i] *= 1 - (i + 1) / n;
  return buf;
}

/**
 * Bloque hablado, en tres intentos: entrar tal cual, acelerar hasta donde
 * siga sonando natural, y recién entonces agrandar la caja. El tercer paso
 * casi nunca se usa; está para que un nombre larguísimo cargado por un
 * usuario no termine cortado a mitad de palabra.
 */
async function bloqueHablado(texto, msCaja) {
  const nCaja = msAMuestras(msCaja);
  const colchon = msAMuestras(MS_COLCHON_MIN);

  let voz = await sintetizar(texto, 1);
  if (voz.length + colchon <= nCaja) return encajar(voz, nCaja);

  const necesario = (voz.length + colchon) / nCaja;
  const objetivo = Math.min(necesario * (1 + MARGEN_ACELERACION), MAX_ACELERACION_NATURAL);
  voz = await sintetizar(texto, Math.min(pedidaPara(objetivo), MAX_PEDIDO));
  if (voz.length + colchon <= nCaja) return encajar(voz, nCaja);

  const paso = msAMuestras(MS_PASO_BLOQUE);
  return encajar(voz, Math.ceil((voz.length + colchon) / paso) * paso);
}

/** _bloque_ejecucion: loop hasta llenar el tiempo, fade, y aviso a la mitad exacta. */
function bloqueEjecucion(vozRapida, seg, cambioLado, aviso) {
  const n = msAMuestras(seg * 1000);
  let plana;

  if (vozRapida.length === 0) {
    plana = new Float32Array(n);
  } else if (vozRapida.length >= n) {
    plana = vozRapida;
  } else {
    const reps = Math.ceil(n / vozRapida.length);
    plana = unir(Array.from({ length: reps }, () => vozRapida));
  }

  plana = fundir(encajar(plana, n).slice(), MS_FADE_EJECUCION);
  if (!cambioLado) return plana;

  const mitad = Math.floor(n / 2);
  return unir([plana.subarray(0, mitad), aviso, plana.subarray(mitad)]);
}

/* ════════════════════════════════════════════════════════════════════
   Salida MP3 — se codifica por bloques y se descartan
   ════════════════════════════════════════════════════════════════════ */

function aInt16(f32) {
  const salida = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    salida[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return salida;
}

function nuevoEncoder(rate) {
  if (typeof lamejs === "undefined") throw new Error("No se pudo cargar el codificador MP3.");
  if (lamejs.Mp3Encoder) return new lamejs.Mp3Encoder(1, rate, KBPS);
  const inst = new lamejs();
  if (inst.Mp3Encoder) return new inst.Mp3Encoder(1, rate, KBPS);
  throw new Error("No encontré Mp3Encoder dentro de lamejs.");
}

/**
 * Codifica a medida que llegan los bloques y los suelta. La pista completa
 * nunca está en memoria: 20 minutos en float32 serían ~106 MB y un celular
 * de gama media no los aguanta.
 */
function sumideroMp3(rate) {
  const enc = nuevoEncoder(rate);
  const trozos = [];
  const FRAME = 1152;
  let resto = new Int16Array(0);
  let muestras = 0;

  const empujar = (datos) => {
    if (datos && datos.length) trozos.push(new Uint8Array(datos));
  };

  return {
    escribir(f32) {
      muestras += f32.length;
      const nuevo = aInt16(f32);
      const todo = new Int16Array(resto.length + nuevo.length);
      todo.set(resto);
      todo.set(nuevo, resto.length);

      let off = 0;
      for (; off + FRAME <= todo.length; off += FRAME) {
        empujar(enc.encodeBuffer(todo.subarray(off, off + FRAME)));
      }
      resto = todo.slice(off);
    },
    cerrar() {
      if (resto.length) empujar(enc.encodeBuffer(resto));
      empujar(enc.flush());
      const total = trozos.reduce((a, t) => a + t.length, 0);
      const mp3 = new Uint8Array(total);
      let off = 0;
      for (const t of trozos) {
        mp3.set(t, off);
        off += t.length;
      }
      return { mp3, muestras };
    },
  };
}

/* ════════════════════════════════════════════════════════════════════
   Generación de la rutina
   ════════════════════════════════════════════════════════════════════ */

async function generar(ejercicios, velocidad) {
  if (!modelo.sesion) throw new Error("Todavía no se cargó la voz.");
  await calibrar();

  const arranque = performance.now();

  /* Se traduce una sola vez, fuera del loop: `pedidaPara` interpola sobre la
     curva medida y el resultado es el mismo para todos los ejercicios. */
  const pedida = pedidaPara(velocidad || VELOCIDAD_POR_DEFECTO);

  const sumidero = sumideroMp3(modelo.rate);
  const hayCambioLado = ejercicios.some((e) => e.cambioLado);
  const aviso = hayCambioLado ? await bloqueHablado(TEXTO_CAMBIO_LADO, MS_CAJA_AVISO) : null;

  estado("sintetizando");

  for (let i = 0; i < ejercicios.length; i++) {
    const ej = ejercicios[i];
    enviar({ tipo: "progreso", hecho: i, total: ejercicios.length, nombre: ej.nombre });

    const anuncio = await bloqueHablado(anunciar(ej.nombre), MS_CAJA_ANUNCIO);
    /* Sólo las instrucciones: el nombre ya sonó dos veces seguidas, en la
       preparación del ejercicio anterior ("Próximo ejercicio, X") y en el
       anuncio ("Ahora, X"). Repetirlo acá lo decía una tercera vez, y encima
       en cada vuelta del loop durante todo el ejercicio. */
    const voz = await sintetizar(ej.instrucciones, pedida);
    const ejecucion = bloqueEjecucion(voz, ej.seg, ej.cambioLado, aviso);

    const siguiente = ejercicios[i + 1]?.nombre;
    const prep = await bloqueHablado(
      siguiente ? preparar(siguiente) : TEXTO_FINAL,
      MS_CAJA_PREPARACION
    );

    sumidero.escribir(anuncio);
    sumidero.escribir(ejecucion);
    sumidero.escribir(prep);
  }

  enviar({ tipo: "progreso", hecho: ejercicios.length, total: ejercicios.length });
  estado("codificando");

  const { mp3, muestras } = sumidero.cerrar();
  enviar(
    {
      tipo: "listo",
      mp3: mp3.buffer,
      duracionMs: (muestras / modelo.rate) * 1000,
      bytes: mp3.length,
      /* Cuánto tardó en generarse, para poder comparar cambios con un número
         en vez de con una impresión. */
      msGeneracion: performance.now() - arranque,
    },
    [mp3.buffer]
  );
}

/**
 * Una muestra corta para escuchar una velocidad antes de generar nada.
 *
 * Existe por un motivo de producto, no técnico: la velocidad correcta no se
 * puede elegir leyendo un número. «1,5×» no le dice nada a nadie hasta que lo
 * escucha, y descubrirlo después de esperar la generación de una rutina de
 * cinco minutos es exactamente la clase de frustración que hace que alguien
 * cierre la pestaña.
 *
 * Es barato: una frase sola contra una rutina entera. Y como `sintetizar`
 * cachea por (texto, velocidad), la frase que se probó no se vuelve a
 * sintetizar cuando después se genera el audio de verdad a esa velocidad.
 */
async function probar(texto, velocidad) {
  if (!modelo.sesion) throw new Error("Todavía no se cargó la voz.");
  await calibrar();

  estado("probando");
  const voz = await sintetizar(texto, pedidaPara(velocidad || VELOCIDAD_POR_DEFECTO));

  /* Se codifica a MP3 aunque sean tres segundos, para no tener dos caminos de
     salida distintos: el reproductor de la muestra y el del audio final son el
     mismo <audio> con una URL de blob. */
  const sumidero = sumideroMp3(modelo.rate);
  sumidero.escribir(voz);
  const { mp3 } = sumidero.cerrar();

  enviar({ tipo: "muestra", mp3: mp3.buffer, velocidad }, [mp3.buffer]);
}

/* ════════════════════════════════════════════════════════════════════
   Mensajes
   ════════════════════════════════════════════════════════════════════ */

self.onmessage = async (e) => {
  const { tipo } = e.data;
  try {
    if (tipo === "cargar") {
      await cargarVoz(e.data.voiceId);
      estado("voz-lista");
    } else if (tipo === "generar") {
      await generar(e.data.ejercicios, e.data.velocidad);
    } else if (tipo === "probar") {
      await probar(e.data.texto, e.data.velocidad);
    }
  } catch (err) {
    enviar({ tipo: "error", mensaje: err?.message ?? String(err) });
  }
};
