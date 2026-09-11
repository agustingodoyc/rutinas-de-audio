/**
 * Fotos de los ejercicios y color por grupo.
 *
 * Las fotos viven en `public/ejercicios/<id>.jpg` y son **opcionales**: las
 * baja `scripts/descargar-imagenes.mjs` desde free-exercise-db, que es de
 * dominio público. Si el archivo no está, la interfaz muestra una tarjeta de
 * color en su lugar. La app nunca depende de una foto para funcionar, igual
 * que no depende de los audios de ejemplo.
 */

/** `null` cuando no puede haber foto: lo que carga el usuario no tiene. */
export function urlFoto(idEjercicio: string): string | null {
  // Sin id no hay archivo posible: pasa con una rutina todavía vacía.
  if (!idEjercicio) return null;
  // Los ids de lo que carga el usuario llevan prefijo (`propio:`).
  if (idEjercicio.includes(":")) return null;
  return `${import.meta.env.BASE_URL}ejercicios/${idEjercicio}.jpg`;
}

/* Los tres grupos del catálogo tienen color propio en la hoja de estilos.
   Un grupo inventado por quien usa la app cae en el neutro, así nunca queda
   un elemento sin color asignado. */
const CON_COLOR = new Set(["Movilidad", "Fuerza", "Elongación"]);

export const grupoConColor = (grupo: string): string => (CON_COLOR.has(grupo) ? grupo : "Otro");

/**
 * El grupo que más aparece en una rutina. Es el que le da el color a su
 * portada y a su entrada en la lista: una rutina de movilidad se reconoce por
 * el color antes de leer el nombre.
 */
export function grupoDominante(grupos: string[]): string {
  const cuenta = new Map<string, number>();
  for (const grupo of grupos) {
    const clave = grupoConColor(grupo);
    cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
  }

  let dominante = "Otro";
  let maximo = 0;
  for (const [clave, veces] of cuenta) {
    if (veces > maximo) {
      dominante = clave;
      maximo = veces;
    }
  }
  return dominante;
}
