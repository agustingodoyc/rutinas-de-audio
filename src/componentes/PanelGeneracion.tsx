import type { Fase, Progreso, Resultado } from "../audio/useGenerador";
import { mmss } from "../datos/catalogo";
import { anunciarEnMediaSession } from "../audio/mediaSession";

type Props = {
  fase: Fase;
  mensaje: string;
  progreso: Progreso | null;
  resultado: Resultado | null;
  /** false cuando la rutina quedó sin ejercicios que la voz pueda leer. */
  puedeGenerar: boolean;
  /** Para que la pantalla bloqueada muestre el nombre de la rutina. */
  tituloRutina: string;
  onGenerar: () => void;
};

const mb = (bytes: number) => (bytes / 1048576).toFixed(1);

export function PanelGeneracion({
  fase,
  mensaje,
  progreso,
  resultado,
  puedeGenerar,
  tituloRutina,
  onGenerar,
}: Props) {
  const generando = fase === "generando";
  const porcentaje =
    progreso && progreso.total ? Math.round((progreso.hecho / progreso.total) * 100) : 0;

  return (
    <section className="panel generacion">
      <div className="generacion-fila">
        <button
          className="boton primario"
          onClick={onGenerar}
          disabled={!puedeGenerar || fase === "sin-voz" || fase === "cargando" || generando}
        >
          {generando ? "Generando…" : resultado ? "Generar de nuevo" : "Generar el audio"}
        </button>

        {!puedeGenerar ? (
          <p className="apunte">Esta rutina no tiene ejercicios todavía.</p>
        ) : (
          fase === "sin-voz" && <p className="apunte">Cargá una voz para empezar.</p>
        )}
      </div>

      {generando && (
        <div className="carga">
          <p className="apunte">
            {mensaje}
            {progreso?.nombre && <span className="cifra"> {progreso.nombre}</span>}
            {progreso && progreso.total > 0 && (
              <span className="cifra">
                {" "}
                · {Math.min(progreso.hecho + 1, progreso.total)} de {progreso.total}
              </span>
            )}
          </p>
          <div className="barra">
            <i style={{ width: `${Math.max(porcentaje, 4)}%` }} />
          </div>
        </div>
      )}

      {resultado && !generando && (
        <div className="resultado">
          <audio
            controls
            preload="metadata"
            src={resultado.url}
            onPlay={() => anunciarEnMediaSession(tituloRutina)}
          />
          <div className="resultado-pie">
            <span className="apunte">
              {mmss(resultado.duracionMs / 1000)} · {mb(resultado.bytes)} MB
            </span>
            <a className="boton" href={resultado.url} download={resultado.nombreArchivo}>
              Descargar MP3
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
