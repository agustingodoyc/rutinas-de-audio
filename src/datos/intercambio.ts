import type { Ejercicio, Rutina } from "../tipos";
import { idEjercicioPropio, idRutinaPropia } from "./catalogo";

/**
 * Importar y exportar en el formato exacto de audios-de-entrenamiento, el
 * proyecto de Python. Así la biblioteca personal viaja entre los dos sin
 * conversiones a mano, y sin que nada se suba a ningún lado.
 *
 *   ejercicios.json  { "Balanceo de Brazos": "INSTRUCCIONES: … CONSEJOS: …" }
 *   rutinas.json     { "Pecho 1": [ { "nombre": "…", "seg": 30, "cambio_lado": false } ] }
 *
 * Una diferencia a tener presente: en el formato de Python `cambio_lado` va
 * en cada entrada de la rutina; acá vive en el ejercicio, porque un
 * estiramiento es por lado siempre, esté en la rutina que esté. Al importar
 * se toma de la primera entrada que lo mencione.
 */

export type Paquete = {
  ejercicios: Ejercicio[];
  rutinas: Rutina[];
};

type EjerciciosPython = Record<string, string>;
type ItemPython = { nombre: string; seg: number; cambio_lado?: boolean };
type RutinasPython = Record<string, ItemPython[]>;

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/* ── Importar ──────────────────────────────────────────────────── */

export function leerEjercicios(crudo: unknown): Ejercicio[] {
  if (!esObjeto(crudo)) throw new Error("ejercicios.json tiene que ser un objeto.");

  const salida: Ejercicio[] = [];
  for (const [nombre, instrucciones] of Object.entries(crudo as EjerciciosPython)) {
    if (typeof instrucciones !== "string") continue;
    salida.push({
      id: idEjercicioPropio(nombre),
      nombre,
      grupo: "Mis ejercicios",
      instrucciones,
      propio: true,
    });
  }
  return salida;
}

export function leerRutinas(crudo: unknown): { rutinas: Rutina[]; ladosPorId: Set<string> } {
  if (!esObjeto(crudo)) throw new Error("rutinas.json tiene que ser un objeto.");

  const rutinas: Rutina[] = [];
  const ladosPorId = new Set<string>();

  for (const [nombre, items] of Object.entries(crudo as RutinasPython)) {
    if (!Array.isArray(items)) continue;

    const ejercicios = items
      .filter((i) => esObjeto(i) && typeof i.nombre === "string")
      .map((i) => {
        const id = idEjercicioPropio(i.nombre);
        if (i.cambio_lado) ladosPorId.add(id);
        return { id, seg: Number(i.seg) > 0 ? Math.round(Number(i.seg)) : 30 };
      });

    rutinas.push({ id: idRutinaPropia(nombre), nombre, descripcion: "", ejercicios, propia: true });
  }

  return { rutinas, ladosPorId };
}

/**
 * Acepta los dos archivos por separado o uno solo con las dos claves.
 * Devuelve lo que hay: importar sólo ejercicios, o sólo rutinas, es válido.
 */
export function importar(archivos: unknown[]): Paquete {
  let ejercicios: Ejercicio[] = [];
  let rutinas: Rutina[] = [];
  const lados = new Set<string>();

  for (const archivo of archivos) {
    if (!esObjeto(archivo)) continue;

    // Un archivo único con las dos claves, como el que exporta esta app.
    const conClaves = archivo as { ejercicios?: unknown; rutinas?: unknown };
    const fuenteEjercicios = conClaves.ejercicios ?? null;
    const fuenteRutinas = conClaves.rutinas ?? null;

    if (fuenteEjercicios || fuenteRutinas) {
      if (fuenteEjercicios) ejercicios = ejercicios.concat(leerEjercicios(fuenteEjercicios));
      if (fuenteRutinas) {
        const leidas = leerRutinas(fuenteRutinas);
        rutinas = rutinas.concat(leidas.rutinas);
        leidas.ladosPorId.forEach((id) => lados.add(id));
      }
      continue;
    }

    // Si no, se deduce por la forma: valores de texto son ejercicios,
    // valores de lista son rutinas.
    const valores = Object.values(archivo);
    if (valores.length && valores.every((v) => typeof v === "string")) {
      ejercicios = ejercicios.concat(leerEjercicios(archivo));
    } else if (valores.length && valores.some((v) => Array.isArray(v))) {
      const leidas = leerRutinas(archivo);
      rutinas = rutinas.concat(leidas.rutinas);
      leidas.ladosPorId.forEach((id) => lados.add(id));
    }
  }

  for (const ej of ejercicios) {
    if (lados.has(ej.id)) ej.cambioLado = true;
  }

  if (!ejercicios.length && !rutinas.length) {
    throw new Error(
      "No reconocí el formato. Esperaba ejercicios.json o rutinas.json de audios-de-entrenamiento."
    );
  }

  return { ejercicios, rutinas };
}

/* ── Exportar ──────────────────────────────────────────────────── */

export function exportar(ejercicios: Ejercicio[], rutinas: Rutina[], indice: Map<string, Ejercicio>) {
  const salidaEjercicios: EjerciciosPython = {};
  for (const ej of ejercicios) salidaEjercicios[ej.nombre] = ej.instrucciones;

  const salidaRutinas: RutinasPython = {};
  for (const rutina of rutinas) {
    salidaRutinas[rutina.nombre] = rutina.ejercicios.flatMap((item) => {
      const ej = indice.get(item.id);
      if (!ej) return [];
      return [{ nombre: ej.nombre, seg: item.seg, cambio_lado: ej.cambioLado ?? false }];
    });
  }

  return { ejercicios: salidaEjercicios, rutinas: salidaRutinas };
}
