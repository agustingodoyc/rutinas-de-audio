/**
 * Service worker: deja la app usable sin conexión.
 *
 * Guarda el shell —HTML, JS, CSS, íconos y el motor de audio— y lo sirve
 * desde el cache. El modelo de voz NO pasa por acá: lo cachea el propio
 * audio-worker.js con la Cache API, porque son 60 MB que no tienen por qué
 * competir con el resto por la cuota ni revalidarse en cada visita.
 *
 * Sólo se registra en producción. En desarrollo un service worker sirviendo
 * archivos viejos es una fuente de confusión y nada más.
 */

const CACHE = "rutinas-shell-v3";

/* Lo mínimo para que la app arranque offline. El resto de los archivos, que
   en el build llevan hash en el nombre, se van cacheando a medida que se
   piden: no se pueden listar acá porque cambian en cada build. */
const ESENCIAL = ["./", "./audio-worker.js", "./manifest.webmanifest", "./iconos/icono-192.png"];

/**
 * Los archivos que NO llevan hash en el nombre.
 *
 * Todo lo que arma Vite sale como `index-a1b2c3d4.js`: el nombre cambia
 * cuando cambia el contenido, así que servirlo del cache no puede devolver
 * una versión equivocada. Estos otros viven en `public/` y se sirven con el
 * mismo nombre para siempre.
 *
 * Para ellos, cache primero es una trampa: una corrección al motor de audio
 * no llega nunca a quien ya tiene la versión vieja guardada. Pasó de verdad
 * —un arreglo publicado que no le cambiaba nada a nadie— y por eso van por
 * red primero, con el cache sólo como red de seguridad si no hay conexión.
 */
const SIN_HASH = ["/audio-worker.js", "/manifest.webmanifest", "/ejemplos/indice.json"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ESENCIAL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

/** Red primero; si falla, lo último que haya guardado bajo `clave`. */
function redPrimero(pedido, clave) {
  return fetch(pedido)
    .then((res) => {
      if (res.ok) {
        const copia = res.clone();
        caches.open(CACHE).then((cache) => cache.put(clave, copia));
      }
      return res;
    })
    .catch(() => caches.match(clave).then((res) => res ?? Response.error()));
}

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.method !== "GET") return;

  const url = new URL(pedido.url);
  // El modelo y las librerías vienen de otros orígenes: que sigan de largo.
  if (url.origin !== self.location.origin) return;

  // La página: red primero, para no servir una versión vieja de la app.
  if (pedido.mode === "navigate") {
    evento.respondWith(redPrimero(pedido, "./"));
    return;
  }

  // Los archivos sin hash en el nombre, por el mismo motivo.
  if (SIN_HASH.includes(url.pathname)) {
    evento.respondWith(redPrimero(pedido, pedido));
    return;
  }

  // El resto lleva hash: cache primero, que es lo más rápido y no puede
  // devolver una versión equivocada.
  evento.respondWith(
    caches.match(pedido).then((guardado) => {
      if (guardado) return guardado;
      return fetch(pedido).then((res) => {
        if (res.ok && res.type === "basic") {
          const copia = res.clone();
          caches.open(CACHE).then((cache) => cache.put(pedido, copia));
        }
        return res;
      });
    })
  );
});
