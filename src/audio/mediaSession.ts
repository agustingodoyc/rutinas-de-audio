/**
 * Datos para la pantalla bloqueada del celular.
 *
 * Sin esto, un MP3 sonando en segundo plano aparece como «localhost» o el
 * título de la pestaña. Con esto se ve el nombre de la rutina y el ícono de
 * la app, y los botones de los auriculares funcionan solos.
 */
export function anunciarEnMediaSession(titulo: string) {
  if (!("mediaSession" in navigator)) return;

  try {
    const icono = `${import.meta.env.BASE_URL}iconos/icono-512.png`;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: titulo,
      artist: "Rutinas de audio",
      artwork: [{ src: icono, sizes: "512x512", type: "image/png" }],
    });
  } catch {
    // Navegador sin soporte, o metadata rechazada: no vale romper nada por esto.
  }
}
