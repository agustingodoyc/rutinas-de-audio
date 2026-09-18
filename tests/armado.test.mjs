/**
 * Tests del armado de la pista.
 *
 * Carga public/audio-worker.js en un sandbox de node con el entorno del worker
 * stubbeado y verifica la parte que no necesita ni navegador ni modelo: las
 * duraciones exactas de cada bloque, el fundido, la inserción del aviso de
 * cambio de lado, la inversión de la curva de velocidad y la partición en
 * frames de 1152 muestras del codificador MP3.
 *
 *     npm test
 *
 * Es la lógica portada de audio.py. Si al refactorizar se corre un
 * milisegundo, se entera acá y no escuchando veinte minutos de audio.
 */

import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const motor = fs.readFileSync(
  fileURLToPath(new URL("../public/audio-worker.js", import.meta.url)),
  "utf8"
);

const sandbox = {
  self: { postMessage() {}, onmessage: null },
  navigator: { hardwareConcurrency: 4 },
  caches: {},
  importScripts() {},
  console,
  Math,
  JSON,
  BigInt,
  Number,
  String,
  Object,
  Array,
  Map,
  Blob: class {},
  Float32Array,
  Int16Array,
  Uint8Array,
  BigInt64Array,
  Response: class {},
  fetch() {},
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(motor, sandbox);

const ctx = (expr) => vm.runInContext(expr, sandbox);

let fallos = 0;
const check = (nombre, ok, extra = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${nombre}${extra ? "  (" + extra + ")" : ""}`);
  if (!ok) fallos++;
};

const RATE = 22050;
ctx(`modelo.rate = ${RATE}; modelo.base = 1;`);

/* ── Conversiones ───────────────────────────────────────────────── */

check("msAMuestras(2000) = 44100", ctx("msAMuestras(2000)") === 44100);
check("duracionMs(44100 muestras) = 2000", ctx("duracionMs(new Float32Array(44100))") === 2000);

/* ── unir / encajar / fundir ────────────────────────────────────── */

ctx("var u = unir([Float32Array.from([1,2]), Float32Array.from([3,4,5])]);");
check("unir concatena en orden", ctx('Array.from(u).join(",")') === "1,2,3,4,5");

check("encajar recorta", ctx("encajar(Float32Array.from([1,2,3,4]), 2).length") === 2);
check(
  "encajar rellena con ceros",
  ctx('Array.from(encajar(Float32Array.from([1,2]), 4)).join(",")') === "1,2,0,0"
);
check("encajar exacto no copia", ctx("var f = Float32Array.from([1,2]); encajar(f,2) === f"));

ctx(`var fo = fundir(new Float32Array(2 * ${RATE}).fill(1), 1000);`);
check("fundir deja el principio intacto", ctx("fo[0]") === 1);
check("fundir termina en cero", ctx("fo[fo.length - 1]") === 0);
check(
  "fundir a mitad de rampa vale ~0,5",
  Math.abs(ctx(`fo[fo.length - Math.floor(${RATE} / 2)]`) - 0.5) < 0.01
);

/* ── Bloque de ejecución: el único que tiene que ser exacto ─────── */

ctx(`var voz = new Float32Array(${RATE} / 2).fill(0.5);`); // medio segundo
ctx("var be = bloqueEjecucion(voz, 30, false, null);");
check("la ejecución dura exactamente 30 s", ctx("be.length") === 30 * RATE, ctx("be.length") + " muestras");

ctx(`var aviso = new Float32Array(2 * ${RATE}).fill(0.25);`);
ctx("var be2 = bloqueEjecucion(voz, 30, true, aviso);");
check("con cambio de lado: 30 s + el aviso", ctx("be2.length") === 32 * RATE);
check("el aviso queda en la mitad exacta", ctx(`be2[15 * ${RATE}] === 0.25`));
check("el ejercicio sigue después del aviso", ctx(`be2[19 * ${RATE} + 100] !== 0.25`));

ctx(`var largo = new Float32Array(40 * ${RATE}).fill(0.9);`);
check(
  "una voz más larga que el bloque se recorta, no lo estira",
  ctx("bloqueEjecucion(largo, 30, false, null).length") === 30 * RATE
);

ctx(`var original = new Float32Array(${RATE} / 2).fill(0.5); bloqueEjecucion(original, 30, false, null);`);
check("no muta la voz cacheada", ctx("original[original.length - 1]") === 0.5);

/* ── Curva de velocidad ─────────────────────────────────────────── */

ctx(`calibracion = [
  { pedida: 1,   real: 1.00 },
  { pedida: 1.5, real: 1.42 },
  { pedida: 2,   real: 1.69 },
  { pedida: 3,   real: 2.17 },
  { pedida: 4,   real: 2.38 },
];`);
check("pedidaPara en un punto exacto", ctx("pedidaPara(1.42)") === 1.5);
check(
  "pedidaPara interpola",
  ctx("pedidaPara(1.55) > 1.5 && pedidaPara(1.55) < 2"),
  "da " + ctx("pedidaPara(1.55).toFixed(3)")
);
check("pedidaPara satura en el techo medido", ctx("pedidaPara(9)") === 4);
check("pedidaPara es monótona", ctx("[1.1,1.5,1.9,2.3].map(pedidaPara).every((v,i,a) => i === 0 || v >= a[i-1])"));
ctx("var guardada = calibracion; calibracion = null;");
check("sin calibrar respeta el tope de lo que se pide", ctx("pedidaPara(99)") === ctx("MAX_PEDIDO"));
ctx("calibracion = guardada;");

/* ── Bloque hablado: los tres intentos ──────────────────────────── */

ctx(`
function realDe(pedida) {
  const c = calibracion;
  if (pedida <= c[0].pedida) return c[0].real;
  for (let i = 1; i < c.length; i++) {
    if (pedida <= c[i].pedida) {
      const t = (pedida - c[i-1].pedida) / (c[i].pedida - c[i-1].pedida);
      return c[i-1].real + t * (c[i].real - c[i-1].real);
    }
  }
  return c[c.length-1].real;
}
var msNatural = 0, llamadas = 0, pedidas = [];
sintetizar = async (texto, pedida) => {
  llamadas++; pedidas.push(pedida);
  return new Float32Array(Math.round(msAMuestras(msNatural / realDe(pedida))));
};
`);

const TEXTO = "frase de prueba";

/**
 * `msEstimado` es lo que el motor cree que va a durar el texto; `msNatural` es
 * lo que de verdad dura. Separarlos es justamente lo que permite probar qué
 * pasa cuando la estimación se equivoca. Con `msEstimado = null` se apaga la
 * estimación y queda el comportamiento de antes de tenerla.
 */
const correr = async (msNatural, caja, msEstimado = msNatural) => {
  const porCaracter = msEstimado === null ? "null" : msEstimado / TEXTO.length;
  ctx(`msNatural = ${msNatural}; llamadas = 0; pedidas = []; msPorCaracter = ${porCaracter};`);
  const buf = await vm.runInContext(`bloqueHablado(${JSON.stringify(TEXTO)}, ${caja})`, sandbox);
  return { ms: ctx("duracionMs")(buf), llamadas: ctx("llamadas"), pedidas: ctx("pedidas") };
};

{
  const r = await correr(1600, 2000);
  check("entra tal cual: la caja queda en 2000 ms", Math.abs(r.ms - 2000) < 1, r.ms.toFixed(0) + " ms");
  check("entra tal cual: una sola síntesis", r.llamadas === 1);
  check("entra tal cual: no acelera de gusto", r.pedidas[0] === 1);
}

{
  // La estimación ve que no entra, así que arranca acelerado: una sola vez.
  const r = await correr(2400, 2000);
  check("no entra: la caja queda en 2000 ms", Math.abs(r.ms - 2000) < 1, r.ms.toFixed(0) + " ms");
  check("no entra: la estimación ahorra la síntesis a 1×", r.llamadas === 1);
  check("no entra: el único intento ya viene acelerado", r.pedidas[0] > 1, "pidió " + r.pedidas[0].toFixed(2) + "×");
}

{
  // Sin estimación se comporta como antes: prueba a 1× y después acelera.
  const r = await correr(2400, 2000, null);
  check("sin estimación: la caja queda en 2000 ms", Math.abs(r.ms - 2000) < 1, r.ms.toFixed(0) + " ms");
  check("sin estimación: dos síntesis", r.llamadas === 2);
  check("sin estimación: el primer intento es a 1×", r.pedidas[0] === 1);
  check("sin estimación: el segundo pide más", r.pedidas[1] > 1, "pidió " + r.pedidas[1].toFixed(2) + "×");
}

{
  // Estimación optimista: cree que entra y no entra. Cuesta lo mismo que antes.
  const r = await correr(2400, 2000, 900);
  check("estimación optimista: igual queda en 2000 ms", Math.abs(r.ms - 2000) < 1, r.ms.toFixed(0) + " ms");
  check("estimación optimista: corrige con una segunda síntesis", r.llamadas === 2);
}

{
  const r = await correr(8000, 2000);
  const ultima = r.pedidas[r.pedidas.length - 1];
  const minimo = 8000 / ctx("MAX_ACELERACION_NATURAL");
  check("ni acelerada entra: la caja cede", r.ms > 2000, r.ms.toFixed(0) + " ms");
  check("la voz entera cabe en la caja nueva", r.ms >= minimo, r.ms.toFixed(0) + " >= " + minimo.toFixed(0));
  check("la caja se redondea a décimas de segundo", Math.abs(r.ms % 100) < 1);
  check(
    "nunca acelera más que el tope natural",
    ctx("realDe")(ultima) <= ctx("MAX_ACELERACION_NATURAL") + 0.01,
    "real " + ctx("realDe")(ultima).toFixed(2) + "×"
  );
  check(
    "ya en el tope, no repite la misma síntesis",
    r.llamadas === 1,
    r.llamadas + " síntesis"
  );
}

/* ── Codificador ────────────────────────────────────────────────── */

check("aInt16 satura en +1", ctx("aInt16(Float32Array.from([1.5]))[0]") === 32767);
check("aInt16 satura en -1", ctx("aInt16(Float32Array.from([-1.5]))[0]") === -32768);

ctx(`
var vistos = [];
globalThis.lamejs = function () {};
lamejs.Mp3Encoder = function () {
  this.encodeBuffer = (b) => { vistos.push(b.length); return new Uint8Array(0); };
  this.flush = () => new Uint8Array(0);
};
var s = sumideroMp3(${RATE});
s.escribir(new Float32Array(1000));
s.escribir(new Float32Array(1000));
s.escribir(new Float32Array(500));
var cerrado = s.cerrar();
`);
check("el sumidero cuenta todas las muestras", ctx("cerrado.muestras") === 2500);
check("codifica en frames de 1152", ctx('vistos.slice(0,2).join(",")') === "1152,1152");
check(
  "no pierde el resto al cerrar",
  ctx("vistos.reduce((a,b) => a + b, 0)") === 2500,
  ctx('vistos.join("+")')
);

console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo verde");
process.exit(fallos ? 1 : 0);
