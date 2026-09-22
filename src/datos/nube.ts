import type { Ejercicio, ItemRutina, Rutina } from "../tipos";
import { supabase } from "./supabase";

/**
 * La biblioteca en Supabase: bajar y subir.
 *
 * La lógica de fusión vive aparte, en `fusion.ts`, sin dependencias: así se
 * puede probar sin red ni navegador.
 *
 * La regla de todo este archivo: **IndexedDB manda**. La app funciona sin
 * cuenta y sin internet, así que la nube es una copia, no la fuente de verdad.
 * Cada vez que hay sesión se fusionan las dos y gana la versión más nueva.
 */

type FilaEjercicio = {
  id: string;
  nombre: string;
  grupo: string;
  cambio_lado: boolean;
  instrucciones: string;
  actualizado_en: string;
  borrado: boolean;
};

type FilaRutina = {
  id: string;
  nombre: string;
  descripcion: string;
  publica: boolean;
  actualizado_en: string;
  borrado: boolean;
};

type FilaPaso = {
  rutina_id: string;
  orden: number;
  ejercicio_id: string;
  seg: number;
};

const aMs = (iso: string) => Date.parse(iso) || 0;
const aIso = (ms?: number) => new Date(ms ?? Date.now()).toISOString();

/** Lo que tiene la nube para esta persona. Incluye las lápidas. */
export async function bajarBiblioteca(usuarioId: string): Promise<{
  ejercicios: Ejercicio[];
  rutinas: Rutina[];
}> {
  if (!supabase) return { ejercicios: [], rutinas: [] };

  /* El filtro por usuario_id no es redundante con RLS: las políticas suman
     permisos, y una de ellas deja ver las rutinas públicas de cualquiera. Sin
     este `eq` la biblioteca propia se mezclaría con las publicadas por otros. */
  const [ejercicios, rutinas, pasos] = await Promise.all([
    supabase.from("ejercicios").select("*").eq("usuario_id", usuarioId),
    supabase.from("rutinas").select("*").eq("usuario_id", usuarioId),
    supabase.from("rutina_ejercicios").select("*").eq("usuario_id", usuarioId),
  ]);

  const fallo = ejercicios.error ?? rutinas.error ?? pasos.error;
  if (fallo) throw new Error(fallo.message);

  const porRutina = new Map<string, ItemRutina[]>();
  for (const paso of ((pasos.data ?? []) as FilaPaso[]).sort((a, b) => a.orden - b.orden)) {
    const lista = porRutina.get(paso.rutina_id) ?? [];
    lista.push({ id: paso.ejercicio_id, seg: paso.seg });
    porRutina.set(paso.rutina_id, lista);
  }

  return {
    ejercicios: ((ejercicios.data ?? []) as FilaEjercicio[]).map((f) => ({
      id: f.id,
      nombre: f.nombre,
      grupo: f.grupo,
      cambioLado: f.cambio_lado,
      instrucciones: f.instrucciones,
      propio: true,
      actualizado: aMs(f.actualizado_en),
      borrado: f.borrado,
    })),
    rutinas: ((rutinas.data ?? []) as FilaRutina[]).map((f) => ({
      id: f.id,
      nombre: f.nombre,
      descripcion: f.descripcion,
      ejercicios: porRutina.get(f.id) ?? [],
      propia: true,
      publica: f.publica,
      actualizado: aMs(f.actualizado_en),
      borrado: f.borrado,
    })),
  };
}

export async function subirEjercicio(usuarioId: string, ejercicio: Ejercicio): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("ejercicios").upsert({
    usuario_id: usuarioId,
    id: ejercicio.id,
    nombre: ejercicio.nombre,
    grupo: ejercicio.grupo,
    cambio_lado: ejercicio.cambioLado ?? false,
    instrucciones: ejercicio.instrucciones,
    actualizado_en: aIso(ejercicio.actualizado),
    borrado: ejercicio.borrado ?? false,
  });
  if (error) throw new Error(error.message);
}

/**
 * Una rutina son tres operaciones (la rutina, borrar sus pasos, insertar los
 * nuevos). Van adentro de una función de Postgres para que sean una sola
 * transacción: si se corta a la mitad, no queda una rutina sin ejercicios.
 */
export async function subirRutina(usuarioId: string, rutina: Rutina): Promise<void> {
  if (!supabase) return;

  if (rutina.borrado) {
    const { error } = await supabase
      .from("rutinas")
      .update({ borrado: true, actualizado_en: aIso(rutina.actualizado) })
      .eq("usuario_id", usuarioId)
      .eq("id", rutina.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.rpc("guardar_rutina", {
    p_id: rutina.id,
    p_nombre: rutina.nombre,
    p_descripcion: rutina.descripcion,
    p_publica: rutina.publica ?? false,
    p_actualizado: aIso(rutina.actualizado),
    p_pasos: rutina.ejercicios.map((item, orden) => ({
      orden,
      ejercicio_id: item.id,
      seg: item.seg,
    })),
  });
  if (error) throw new Error(error.message);
}

/* ────────────────────────────────────────────────────────────────
   Las rutinas publicadas

   Se leen aunque no haya sesión: la política de RLS que las deja ver no pide
   usuario, sólo que la rutina esté marcada como pública. Alguien que entra por
   primera vez ve lo que publicó el resto sin crearse una cuenta.
   ──────────────────────────────────────────────────────────────── */

/**
 * Los ids se renombran al bajarlos, con el dueño adentro:
 * `mia:pecho-1` → `publica:<uuid>:mia:pecho-1`.
 *
 * No es un adorno. Los ids sólo son únicos dentro de una persona: dos usuarios
 * pueden tener los dos una rutina `mia:pecho-1`, y la tuya propia también. Sin
 * el prefijo, la rutina de otro pisaría a la tuya en la lista o, peor,
 * abrirías la tuya creyendo que mirás la de él.
 */
const idPublico = (usuarioId: string, id: string) => `publica:${usuarioId}:${id}`;

export const esDeLaComunidad = (id: string) => id.startsWith("publica:");

/* ────────────────────────────────────────────────────────────────
   Compartir una rutina con una persona

   Compartir no es copiar: la rutina sigue siendo una sola fila, del dueño, y
   lo único que se agrega es permiso de lectura para otro mail. Por eso borrar
   se propaga solo — no hay dos copias que mantener en sincronía, hay una que
   deja de ser legible.
   ──────────────────────────────────────────────────────────────── */

const idCompartida = (usuarioId: string, id: string) => `compartida:${usuarioId}:${id}`;

export const esCompartidaConmigo = (id: string) => id.startsWith("compartida:");

/** Normaliza como lo espera la base: sin espacios y en minúsculas. */
export const normalizarMail = (mail: string) => mail.trim().toLowerCase();

export async function compartirRutina(
  usuarioId: string,
  rutinaId: string,
  mail: string
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("rutinas_compartidas").upsert({
    usuario_id: usuarioId,
    rutina_id: rutinaId,
    destinatario_email: normalizarMail(mail),
  });
  if (error) throw new Error(error.message);
}

export async function dejarDeCompartir(
  usuarioId: string,
  rutinaId: string,
  mail: string
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("rutinas_compartidas")
    .delete()
    .eq("usuario_id", usuarioId)
    .eq("rutina_id", rutinaId)
    .eq("destinatario_email", normalizarMail(mail));
  if (error) throw new Error(error.message);
}

/** Con quiénes está compartida una rutina. Sólo lo ve el dueño. */
export async function listarComparticiones(
  usuarioId: string,
  rutinaId: string
): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("rutinas_compartidas")
    .select("destinatario_email")
    .eq("usuario_id", usuarioId)
    .eq("rutina_id", rutinaId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { destinatario_email: string }[]).map((f) => f.destinatario_email);
}

/**
 * Lo que otras personas compartieron conmigo.
 *
 * No se guarda en IndexedDB y no es casual: no es mía. Si se copiara al
 * navegador, seguiría estando después de que el dueño la borre, y eso es
 * exactamente lo contrario de lo que promete la función. Vive sólo mientras
 * la base la devuelva.
 */
export async function bajarCompartidasConmigo(mail: string): Promise<{
  rutinas: Rutina[];
  ejercicios: Ejercicio[];
}> {
  if (!supabase || !mail) return { rutinas: [], ejercicios: [] };

  const { data: enlaces, error: falloEnlaces } = await supabase
    .from("rutinas_compartidas")
    .select("usuario_id, rutina_id")
    .eq("destinatario_email", normalizarMail(mail));
  if (falloEnlaces) throw new Error(falloEnlaces.message);

  const claves = (enlaces ?? []) as { usuario_id: string; rutina_id: string }[];
  if (!claves.length) return { rutinas: [], ejercicios: [] };

  const duenos = [...new Set(claves.map((c) => c.usuario_id))];
  const ids = [...new Set(claves.map((c) => c.rutina_id))];

  /* Las políticas de RLS ya recortan a lo compartido conmigo; estos filtros
     son para no traer de más, no para proteger nada. La rutina borrada no
     vuelve porque la política pide `not borrado`: ahí está el borrado
     propagándose. */
  const [rutinas, pasos, perfiles] = await Promise.all([
    supabase.from("rutinas").select("*").in("usuario_id", duenos).in("id", ids),
    supabase.from("rutina_ejercicios").select("*").in("usuario_id", duenos).in("rutina_id", ids),
    supabase.from("perfiles").select("id, nombre").in("id", duenos),
  ]);

  const fallo = rutinas.error ?? pasos.error ?? perfiles.error;
  if (fallo) throw new Error(fallo.message);

  type ConDueno<T> = T & { usuario_id: string };
  const permitidas = new Set(claves.map((c) => `${c.usuario_id}|${c.rutina_id}`));
  const filas = ((rutinas.data ?? []) as ConDueno<FilaRutina>[]).filter((r) =>
    permitidas.has(`${r.usuario_id}|${r.id}`)
  );
  if (!filas.length) return { rutinas: [], ejercicios: [] };

  const pasosOrdenados = ((pasos.data ?? []) as ConDueno<FilaPaso>[])
    .filter((p) => permitidas.has(`${p.usuario_id}|${p.rutina_id}`))
    .sort((a, b) => a.orden - b.orden);

  const paresUsados = new Set(pasosOrdenados.map((p) => `${p.usuario_id}|${p.ejercicio_id}`));
  const idsUsados = [...new Set(pasosOrdenados.map((p) => p.ejercicio_id))];

  const ejercicios = idsUsados.length
    ? await supabase.from("ejercicios").select("*").in("usuario_id", duenos).in("id", idsUsados)
    : { data: [] as ConDueno<FilaEjercicio>[], error: null };
  if (ejercicios.error) throw new Error(ejercicios.error.message);

  const ejerciciosCompartidos = ((ejercicios.data ?? []) as ConDueno<FilaEjercicio>[])
    .filter((f) => paresUsados.has(`${f.usuario_id}|${f.id}`))
    .map((f) => ({
      id: idCompartida(f.usuario_id, f.id),
      nombre: f.nombre,
      grupo: f.grupo,
      cambioLado: f.cambio_lado,
      instrucciones: f.instrucciones,
      actualizado: aMs(f.actualizado_en),
    }));

  const idsVisibles = new Set(ejerciciosCompartidos.map((e) => e.id));
  const nombrePorUsuario = new Map(
    ((perfiles.data ?? []) as { id: string; nombre: string }[]).map((p) => [p.id, p.nombre])
  );

  const porRutina = new Map<string, ItemRutina[]>();
  for (const paso of pasosOrdenados) {
    const clave = idCompartida(paso.usuario_id, paso.rutina_id);
    const lista = porRutina.get(clave) ?? [];
    /* Un paso del catálogo no lleva prefijo: lo tiene todo el mundo dentro de
       la app. Sólo se renombran los ejercicios propios del dueño. */
    const candidato = idCompartida(paso.usuario_id, paso.ejercicio_id);
    lista.push({ id: idsVisibles.has(candidato) ? candidato : paso.ejercicio_id, seg: paso.seg });
    porRutina.set(clave, lista);
  }

  return {
    ejercicios: ejerciciosCompartidos,
    rutinas: filas.map((f) => ({
      id: idCompartida(f.usuario_id, f.id),
      nombre: f.nombre,
      descripcion: f.descripcion,
      ejercicios: porRutina.get(idCompartida(f.usuario_id, f.id)) ?? [],
      autor: nombrePorUsuario.get(f.usuario_id) || "Alguien",
      actualizado: aMs(f.actualizado_en),
    })),
  };
}

/* ────────────────────────────────────────────────────────────────
   Sugerencias

   Se insertan y no se pueden leer: la tabla tiene RLS encendido y política de
   insert, pero ninguna de select. En Postgres, lo que no está permitido está
   prohibido, así que ni la anon key ni una sesión iniciada pueden traer una
   fila. Los mensajes se leen desde el panel de Supabase.

   Así el buzón funciona sin publicar ninguna dirección de contacto en una
   página y un bundle que cualquiera puede leer.
   ──────────────────────────────────────────────────────────────── */

export async function enviarSugerencia(texto: string, contacto: string): Promise<void> {
  if (!supabase) throw new Error("Las sugerencias necesitan la base configurada.");

  const { data } = await supabase.auth.getSession();
  const { error } = await supabase.from("sugerencias").insert({
    texto: texto.trim(),
    contacto: contacto.trim(),
    usuario_id: data.session?.user.id ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function bajarRutinasPublicas(): Promise<{
  rutinas: Rutina[];
  ejercicios: Ejercicio[];
}> {
  if (!supabase) return { rutinas: [], ejercicios: [] };

  const [rutinas, pasos, perfiles] = await Promise.all([
    supabase.from("rutinas").select("*").eq("publica", true).eq("borrado", false),
    supabase.from("rutina_ejercicios").select("*"),
    supabase.from("perfiles").select("id, nombre"),
  ]);

  const fallo = rutinas.error ?? pasos.error ?? perfiles.error;
  if (fallo) throw new Error(fallo.message);

  type ConDueno<T> = T & { usuario_id: string };

  const filas = (rutinas.data ?? []) as ConDueno<FilaRutina>[];
  /* La consulta de pasos vuelve con lo propio mezclado —las políticas suman
     permisos— así que se filtra contra las rutinas públicas que sí pedimos. */
  const claves = new Set(filas.map((r) => `${r.usuario_id}|${r.id}`));

  const nombrePorUsuario = new Map(
    ((perfiles.data ?? []) as { id: string; nombre: string }[]).map((p) => [p.id, p.nombre])
  );

  const porRutina = new Map<string, ItemRutina[]>();
  const pasosOrdenados = ((pasos.data ?? []) as ConDueno<FilaPaso>[])
    .filter((p) => claves.has(`${p.usuario_id}|${p.rutina_id}`))
    .sort((a, b) => a.orden - b.orden);

  /* Recién ahora se sabe qué ejercicios hacen falta, así que la consulta va en
     una segunda vuelta en vez de en el Promise.all de arriba.
     Pedir la tabla entera —que es lo que se hacía— traía de yapa la biblioteca
     propia de quien tuviera sesión abierta, porque la política "ejercicios
     propios" también da lectura. No se filtraba nada a nadie, pero se bajaba
     mucho para nada: la mayoría de los pasos apuntan al catálogo, que viaja
     con la app y ni siquiera está en esta base. */
  const paresUsados = new Set(pasosOrdenados.map((p) => `${p.usuario_id}|${p.ejercicio_id}`));
  const idsUsados = [...new Set(pasosOrdenados.map((p) => p.ejercicio_id))];

  const ejercicios = idsUsados.length
    ? await supabase.from("ejercicios").select("*").eq("borrado", false).in("id", idsUsados)
    : { data: [] as ConDueno<FilaEjercicio>[], error: null };
  if (ejercicios.error) throw new Error(ejercicios.error.message);

  /* El `in` filtra por id, que sólo es único dentro de una persona: si alguien
     publica una rutina con un ejercicio que se llama igual que uno tuyo, vuelve
     también el tuyo. El par (dueño, id) es la identidad de verdad. */
  const ejerciciosPublicos = ((ejercicios.data ?? []) as ConDueno<FilaEjercicio>[])
    .filter((f) => paresUsados.has(`${f.usuario_id}|${f.id}`))
    .map((f) => ({
      id: idPublico(f.usuario_id, f.id),
      nombre: f.nombre,
      grupo: f.grupo,
      cambioLado: f.cambio_lado,
      instrucciones: f.instrucciones,
      actualizado: aMs(f.actualizado_en),
    }));

  const idsPublicos = new Set(ejerciciosPublicos.map((e) => e.id));

  for (const paso of pasosOrdenados) {
    const clave = idPublico(paso.usuario_id, paso.rutina_id);
    const lista = porRutina.get(clave) ?? [];
    /* Un paso puede apuntar a un ejercicio del catálogo, que es igual para
       todos y no lleva prefijo. Sólo se renombran los que son de esa persona. */
    const candidato = idPublico(paso.usuario_id, paso.ejercicio_id);
    lista.push({ id: idsPublicos.has(candidato) ? candidato : paso.ejercicio_id, seg: paso.seg });
    porRutina.set(clave, lista);
  }

  return {
    ejercicios: ejerciciosPublicos,
    rutinas: filas.map((f) => ({
      id: idPublico(f.usuario_id, f.id),
      nombre: f.nombre,
      descripcion: f.descripcion,
      ejercicios: porRutina.get(idPublico(f.usuario_id, f.id)) ?? [],
      publica: true,
      autor: nombrePorUsuario.get(f.usuario_id) || "Alguien de la comunidad",
      actualizado: aMs(f.actualizado_en),
    })),
  };
}
