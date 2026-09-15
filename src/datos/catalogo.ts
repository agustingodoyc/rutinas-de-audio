import datos from "./catalogo.json";
import type { Ejercicio, EjercicioResuelto, Rutina } from "../tipos";

/** Ejercicios y rutinas que vienen con la app. No se pueden editar. */
export const ejerciciosCatalogo = datos.ejercicios as Ejercicio[];
export const rutinasCatalogo = datos.rutinas as Rutina[];

/** "Elevación lateral" → "elevacion-lateral" */
export function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/* Los ids de lo que carga el usuario van con prefijo para no chocar con el
   catálogo: alguien puede llamar a su rutina igual que una de las que vienen
   con la app. Como derivan del nombre, importar dos veces el mismo archivo
   actualiza en vez de duplicar. */
export const PREFIJO_PROPIO = "propio:";
export const PREFIJO_RUTINA_PROPIA = "mia:";

export const idEjercicioPropio = (nombre: string) => `${PREFIJO_PROPIO}${slug(nombre)}`;
export const idRutinaPropia = (nombre: string) => `${PREFIJO_RUTINA_PROPIA}${slug(nombre)}`;

/** Un ejercicio que cargó el usuario, y no uno de los que vienen con la app. */
export const esEjercicioPropio = (id: string) => id.startsWith(PREFIJO_PROPIO);

/** Índice por id, con los ejercicios propios pisando a los del catálogo. */
export function indexar(propios: Ejercicio[]): Map<string, Ejercicio> {
  const indice = new Map<string, Ejercicio>();
  for (const e of ejerciciosCatalogo) indice.set(e.id, e);
  for (const e of propios) indice.set(e.id, e);
  return indice;
}

/**
 * Convierte una rutina en lo que espera el motor de audio.
 * Un ejercicio que ya no está en el índice se descarta en vez de romper: pasa
 * solo en cuanto alguien borra un ejercicio que una rutina guardada usaba.
 */
export function resolver(rutina: Rutina, indice: Map<string, Ejercicio>): EjercicioResuelto[] {
  const salida: EjercicioResuelto[] = [];
  for (const item of rutina.ejercicios) {
    const ej = indice.get(item.id);
    if (!ej) continue;
    salida.push({
      id: ej.id,
      nombre: ej.nombre,
      grupo: ej.grupo,
      seg: item.seg,
      cambioLado: ej.cambioLado ?? false,
      instrucciones: ej.instrucciones,
    });
  }
  return salida;
}

/* Los mismos números que usa el motor para armar la pista. Están acá para
   poder mostrar la duración antes de generar nada; si allá cambian, cambian
   acá. Es una estimación por lo bajo: un nombre muy largo puede agrandar su
   caja y estirar el total unos décimos. */
const SEG_ANUNCIO = 2;
const SEG_PREPARACION = 3;
const SEG_AVISO = 2;

export function duracionEstimada(items: EjercicioResuelto[]): number {
  const ejercicio = items.reduce((total, e) => total + e.seg, 0);
  const hablado = items.length * (SEG_ANUNCIO + SEG_PREPARACION);
  const avisos = items.filter((e) => e.cambioLado).length * SEG_AVISO;
  return ejercicio + hablado + avisos;
}

/** 245 → "4:05" */
export function mmss(segundos: number): string {
  const s = Math.round(segundos);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
