import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Cross-origin isolation. Sin estos dos headers el navegador no habilita
 * SharedArrayBuffer, y sin SharedArrayBuffer ONNX Runtime sintetiza en un solo
 * hilo: varias veces más lento.
 *
 * Estuvieron apagados un tiempo mientras se buscaba por qué no se podía bajar
 * el modelo de voz. No eran la causa —era una redirección de huggingface.co—,
 * y se pueden tener encendidos desde que los modelos salen de un repositorio
 * propio en raw.githubusercontent.com, que sí cumple la política.
 *
 * Lo que hay que saber antes de agregar cualquier recurso externo: con esto
 * puesto, TODO lo que la página baja de otro dominio tiene que cumplir la
 * política, o no se baja. Hoy cumplen los tres que se usan: cdnjs, jsDelivr y
 * raw.githubusercontent.
 *
 * `credentialless` en vez de `require-corp` para no tener que exigirles CORP
 * a esos CDN.
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
