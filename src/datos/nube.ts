import type { Ejercicio, ItemRutina, Rutina } from "../tipos";
import { supabase } from "./supabase";

/**
 * La biblioteca en Supabase: bajar, subir y fusionar.
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

type ConMarca = { id: string; actualizado?: number };

/**
 * Fusiona dos listas por id quedándose con la versión más nueva de cada una.
 *
 * Es la estrategia "gana el último que escribió" (*last write wins*). No es
 * perfecta: si editás la misma rutina en dos dispositivos sin conectarte, la
 * más vieja se pierde en silencio. Resolverlo de verdad exige guardar el
 * historial de cambios de cada campo —lo que hacen las bases distribuidas— y
 * para una biblioteca de rutinas personales el costo no se justifica. Lo que
 * sí importa es que el criterio sea explícito y predecible.
 *
 * Devuelve además qué quedó pendiente de subir: lo que ganó localmente.
 */
export function fusionar<T extends ConMarca>(
  locales: T[],
  remotos: T[]
): { fusionados: T[]; aSubir: T[] } {
  const porId = new Map<string, T>();
  const aSubir: T[] = [];

  for (const remoto of remotos) porId.set(remoto.id, remoto);

  for (const local of locales) {
    const remoto = porId.get(local.id);
    if (!remoto) {
      // Está sólo acá: la nube todavía no lo conoce.
      porId.set(local.id, local);
      aSubir.push(local);
      continue;
    }
    if ((local.actualizado ?? 0) > (remoto.actualizado ?? 0)) {
      porId.set(local.id, local);
      aSubir.push(local);
    }
  }

  return { fusionados: [...porId.values()], aSubir };
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

export async function bajarRutinasPublicas(): Promise<{
  rutinas: Rutina[];
  ejercicios: Ejercicio[];
}> {
  if (!supabase) return { rutinas: [], ejercicios: [] };

  const [rutinas, pasos, ejercicios, perfiles] = await Promise.all([
    supabase.from("rutinas").select("*").eq("publica", true).eq("borrado", false),
    supabase.from("rutina_ejercicios").select("*"),
    supabase.from("ejercicios").select("*").eq("borrado", false),
    supabase.from("perfiles").select("id, nombre"),
  ]);

  const fallo = rutinas.error ?? pasos.error ?? ejercicios.error ?? perfiles.error;
  if (fallo) throw new Error(fallo.message);

  type ConDueno<T> = T & { usuario_id: string };

  const filas = (rutinas.data ?? []) as ConDueno<FilaRutina>[];
  /* Las otras dos consultas vuelven con lo propio mezclado —las políticas
     suman permisos— así que se filtra contra las rutinas públicas que sí
     pedimos. */
  const claves = new Set(filas.map((r) => `${r.usuario_id}|${r.id}`));

  const nombrePorUsuario = new Map(
    ((perfiles.data ?? []) as { id: string; nombre: string }[]).map((p) => [p.id, p.nombre])
  );

  const ejerciciosPublicos = ((ejercicios.data ?? []) as ConDueno<FilaEjercicio>[]).map((f) => ({
    id: idPublico(f.usuario_id, f.id),
    nombre: f.nombre,
    grupo: f.grupo,
    cambioLado: f.cambio_lado,
    instrucciones: f.instrucciones,
    actualizado: aMs(f.actualizado_en),
  }));

  const porRutina = new Map<string, ItemRutina[]>();
  const pasosOrdenados = ((pasos.data ?? []) as ConDueno<FilaPaso>[])
    .filter((p) => claves.has(`${p.usuario_id}|${p.rutina_id}`))
    .sort((a, b) => a.orden - b.orden);

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
