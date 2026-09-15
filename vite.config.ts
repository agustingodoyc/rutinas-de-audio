import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Los headers de cross-origin isolation están apagados, y no es un descuido.
 *
 * Con ellos activados el navegador habilita SharedArrayBuffer y ONNX Runtime
 * sintetiza con varios hilos, que es varias veces más rápido. El precio es que
 * TODO lo que la página baja de otros dominios tiene que cumplir la política:
 * y huggingface.co, que es de donde sale el modelo de voz, dejó de cumplirla.
 * El síntoma era un "Failed to fetch" al cargar la voz, con la app entera
 * inutilizable. Medido desde la página misma: cdnjs, jsDelivr y
 * raw.githubusercontent pasan; huggingface.co no.
 *
 * Entre una app rápida que no funciona y una lenta que funciona, gana la
 * segunda. Para recuperar la velocidad hay que servir el modelo desde un
 * dominio que sí cumpla —o desde el propio— y recién ahí volver a encenderlos.
 * Están acá abajo, listos para descomentar el día que eso pase.
 */
// const aislamiento = {
//   "Cross-Origin-Opener-Policy": "same-origin",
//   "Cross-Origin-Embedder-Policy": "credentialless",
// };

export default defineConfig({
  plugins: [react()],
});
