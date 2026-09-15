import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Los headers de cross-origin isolation están apagados, y volver a encenderlos
 * es descomentar estas cuatro líneas (y las dos de public/_headers).
 *
 * Con ellos el navegador habilita SharedArrayBuffer y ONNX Runtime sintetiza
 * con varios hilos, que es bastante más rápido. Se apagaron mientras se
 * buscaba por qué no se podía bajar el modelo de voz; no eran la causa —era
 * una redirección de huggingface.co, el README lo cuenta entero— y ahora que
 * los modelos salen de un repositorio propio se pueden volver a encender.
 *
 * `credentialless` en vez de `require-corp` para no tener que exigirles CORP a
 * los CDN de los que salen las librerías.
 */
// const aislamiento = {
//   "Cross-Origin-Opener-Policy": "same-origin",
//   "Cross-Origin-Embedder-Policy": "credentialless",
// };

export default defineConfig({
  plugins: [react()],
});
