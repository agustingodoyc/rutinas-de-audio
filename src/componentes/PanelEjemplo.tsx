import { useEffect, useState } from "react";
import { urlEjemplo } from "../datos/useEjemplos";
import { anunciarEnMediaSession } from "../audio/mediaSession";

type Props = {
  rutinaId: string;
  nombre: string;
};

/**
 * Reproduce un audio de muestra ya generado, sin bajar el modelo de voz.
 * Es lo primero que ve alguien que entra a mirar: escucha cómo suena y
 * después decide si quiere generar el suyo.
 *
 * Antes de mostrarse comprueba que el archivo exista de verdad. No alcanza con
 * escuchar el evento `error` del `<audio>`: cuando el archivo falta, tanto el
 * servidor de desarrollo como un hosting con fallback a index.html devuelven
 * 200 con HTML, y el reproductor se queda cargando para siempre sin avisar.
 * Por eso se mira el content-type de la respuesta.
 */
export function PanelEjemplo({ rutinaId, nombre }: Props) {
  const [hay, setHay] = useState(false);

  useEffect(() => {
    let vigente = true;
    setHay(false);

    fetch(urlEjemplo(rutinaId), { method: "HEAD" })
      .then((res) => {
        const tipo = res.headers.get("content-type") ?? "";
        if (vigente && res.ok && tipo.includes("audio")) setHay(true);
      })
      .catch(() => {});

    return () => {
      vigente = false;
    };
  }, [rutinaId]);

  if (!hay) return null;

  return (
    <section className="panel ejemplo">
      <div className="ejemplo-cabeza">
        <p className="titulo-panel">Escuchá cómo suena</p>
        <span className="apunte">Muestra ya generada · no baja nada</span>
      </div>
      <audio
        controls
        preload="metadata"
        src={urlEjemplo(rutinaId)}
        onPlay={() => anunciarEnMediaSession(nombre)}
      />
    </section>
  );
}
