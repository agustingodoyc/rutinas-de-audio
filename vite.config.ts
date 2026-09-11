import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * ONNX Runtime usa varios hilos vía SharedArrayBuffer, y eso sólo está
 * disponible en páginas con cross-origin isolation. Estos headers son los
 * mismos que van en public/_headers para producción: si los sacás, la app
 * sigue funcionando pero la síntesis pasa a un solo hilo y se vuelve lenta.
 *
 * `credentialless` en vez de `require-corp` para no tener que exigir CORP a
 * los CDN de los que salen el modelo y las librerías.
 */
const aislamiento = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

export default defineConfig({
  plugins: [react()],
  server: { headers: aislamiento },
  preview: { headers: aislamiento },
});
