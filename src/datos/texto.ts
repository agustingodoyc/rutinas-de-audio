/**
 * El texto de un ejercicio, de ida y de vuelta.
 *
 * Guardado, un ejercicio es un solo string con dos etiquetas:
 *
 *     INSTRUCCIONES: Parate con los pies… CONSEJOS: Respirá parejo.
 *
 * Ese formato no es un capricho: es el mismo que usa el proyecto de Python, y
 * gracias a eso la biblioteca va y viene entre los dos sin convertir nada.
 *
 * Pero nadie que quiera cargar un ejercicio tiene por qué saber eso. En
 * pantalla son dos campos separados —cómo se hace y un consejo— y estas dos
 * funciones traducen entre lo que se ve y lo que se guarda. La regla general:
 * el formato de archivo es asunto del programa, no de quien lo usa.
 */

const ETIQUETA_INSTRUCCIONES = "INSTRUCCIONES:";
const ETIQUETA_CONSEJOS = "CONSEJOS:";

/** Dos campos → el string que se guarda y que lee la voz. */
export function componerInstrucciones(comoSeHace: string, consejo: string): string {
  const hacer = comoSeHace.trim();
  const tip = consejo.trim();
  const base = `${ETIQUETA_INSTRUCCIONES} ${hacer}`;
  return tip ? `${base} ${ETIQUETA_CONSEJOS} ${tip}` : base;
}

/** El string guardado → los dos campos. Un texto sin etiquetas entra entero. */
export function separarInstrucciones(texto: string): { comoSeHace: string; consejo: string } {
  const sinEtiqueta = texto.replace(/^\s*INSTRUCCIONES:\s*/i, "");
  const [comoSeHace, consejo] = sinEtiqueta.split(/CONSEJOS:\s*/i);
  return { comoSeHace: (comoSeHace ?? "").trim(), consejo: (consejo ?? "").trim() };
}
