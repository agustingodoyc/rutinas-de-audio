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

/* Subir el número al cambiar public/audio-worker.js: se sirve desde el cache
   y sin esto un navegador que ya lo tiene sigue con el motor viejo. */
const CACHE = "rutinas-shell-v2";

/* Lo mínimo para que la app arranque offline. El resto de los archivos, que
   en el build llevan hash en el nombre, se van cacheando a medida que se
   piden: no se pueden listar acá porque cambian en cada build. */
const ESENCIAL = ["./", "./audio-worker.js", "./manifest.webmanifest", "./iconos/icono-192.png"];

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

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;

  // El modelo y las librerías vienen de otros orígenes: que sigan de largo.
  if (pedido.method !== "GET" || new URL(pedido.url).origin !== self.location.origin) return;

  // Navegación: primero la red, para no servir una versión vieja de la app;
  // si no hay conexión, el shell cacheado.
  if (pedido.mode === "navigate") {
    evento.respondWith(
      fetch(pedido)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE).then((cache) => cache.put("./", copia));
          return res;
        })
        .catch(() => caches.match("./").then((res) => res ?? Response.error()))
    );
    return;
  }

  // Todo lo demás: cache primero. Los archivos del build llevan hash, así que
  // servirlos del cache no puede devolver una versión equivocada.
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
