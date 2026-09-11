import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./estilos.css";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Falta el elemento #root en index.html");

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>
);

/* Sólo en producción: en desarrollo un service worker sirviendo archivos
   viejos confunde más de lo que ayuda. Si falla, la app anda igual — lo
   único que se pierde es poder abrirla sin conexión. */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
