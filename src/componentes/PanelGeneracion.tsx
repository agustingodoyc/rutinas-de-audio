import { useEffect, useState } from "react";
import type { Fase, Muestra, Progreso, Resultado } from "../audio/useGenerador";
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
  /** Hasta dónde acelera la voz cargada. null mientras no se sepa. */
  techoVelocidad: number | null;
  muestra: Muestra | null;
  probando: boolean;
  /** Hilos que consiguió el motor. Se muestra junto al tiempo de generación. */
  hilos: number | null;
  onProbar: (velocidad: number) => void;
  onGenerar: (velocidad: number) => void;
};

const mb = (bytes: number) => (bytes / 1048576).toFixed(1);

/* Pasos de un cuarto: menos opciones no dejan afinar y más vuelven la
   decisión un trámite. Las que la voz cargada no pueda entregar se esconden. */
const VELOCIDADES = [1, 1.25, 1.5, 1.75, 2];
const POR_DEFECTO = 1.25;
const CLAVE_GUARDADA = "rutinas:velocidad";

/** "1.25" → "1,25×" */
const etiqueta = (v: number) => `${v.toString().replace(".", ",")}×`;

/**
 * La velocidad elegida se recuerda entre visitas. Es una preferencia de esta
 * persona en este navegador y nada más, así que va en localStorage y no en la
 * biblioteca: no tiene por qué viajar a la nube ni sincronizarse.
 *
 * Todo envuelto en try/catch porque en ventana privada, o con el sitio
 * bloqueado, leer localStorage no devuelve vacío: tira excepción.
 */
function leerGuardada(): number {
  try {
    const v = Number(localStorage.getItem(CLAVE_GUARDADA));
    return VELOCIDADES.includes(v) ? v : POR_DEFECTO;
  } catch {
    return POR_DEFECTO;
  }
}

export function PanelGeneracion({
  fase,
  mensaje,
  progreso,
  resultado,
  puedeGenerar,
  tituloRutina,
  techoVelocidad,
  muestra,
  probando,
  hilos,
  onProbar,
  onGenerar,
}: Props) {
  const [velocidad, setVelocidad] = useState(leerGuardada);

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_GUARDADA, String(velocidad));
    } catch {
      /* Sin guardar, la app funciona igual. */
    }
  }, [velocidad]);

  const generando = fase === "generando";
  const ocupado = generando || probando || fase === "cargando";
  const hayVoz = fase !== "sin-voz" && fase !== "cargando";

  /* Pedir 2× a una voz que llega a 1,68× no da 2×: da 1,68×. Mostrar la opción
     sería prometer algo que el modelo no puede cumplir, así que se recorta la
     lista con el techo medido. El +0,01 es para que un techo de 1,50000001
     no deje afuera al 1,5. */
  const techo = techoVelocidad ?? VELOCIDADES[VELOCIDADES.length - 1];
  const disponibles = VELOCIDADES.filter((v) => v <= techo + 0.01);
  const recortada = disponibles.length < VELOCIDADES.length;

  // Si la voz que se cargó no llega a la velocidad guardada, se baja al máximo.
  useEffect(() => {
    if (techoVelocidad && velocidad > techoVelocidad + 0.01) {
      setVelocidad(disponibles[disponibles.length - 1] ?? 1);
    }
  }, [techoVelocidad, velocidad, disponibles]);

  const porcentaje =
    progreso && progreso.total ? Math.round((progreso.hecho / progreso.total) * 100) : 0;

  return (
    <section className="panel generacion">
      {hayVoz && puedeGenerar && (
        <div className="velocidad">
          <p className="titulo-panel">Velocidad de las instrucciones</p>

          <div className="velocidad-opciones" role="group" aria-label="Velocidad">
            {disponibles.map((v) => (
              <button
                key={v}
                className={`boton chico${v === velocidad ? " activo" : ""}`}
                aria-pressed={v === velocidad}
                disabled={ocupado}
                onClick={() => setVelocidad(v)}
              >
                {etiqueta(v)}
              </button>
            ))}

            <button className="boton chico fantasma" disabled={ocupado} onClick={() => onProbar(velocidad)}>
              {probando ? "Preparando…" : "Escuchar"}
            </button>
          </div>

          {muestra && !probando && (
            <audio
              controls
              autoPlay
              className="muestra"
              src={muestra.url}
              aria-label={`Muestra a ${etiqueta(muestra.velocidad)}`}
            />
          )}

          <p className="apunte">
            Cambia qué tan rápido se leen las instrucciones, no cuánto dura el audio: cada ejercicio
            dura los segundos que tiene asignados y la instrucción se repite hasta llenarlos.
            {recortada && ` Esta voz llega hasta ${etiqueta(Math.floor(techo * 100) / 100)}.`}
          </p>
        </div>
      )}

      <div className="generacion-fila">
        <button
          className="boton primario"
          onClick={() => onGenerar(velocidad)}
          disabled={!puedeGenerar || fase === "sin-voz" || fase === "cargando" || generando || probando}
        >
          {generando ? "Generando…" : resultado ? "Generar de nuevo" : "Generar el audio"}
        </button>

        {!puedeGenerar ? (
          <p className="apunte">Esta rutina no tiene ejercicios todavía.</p>
        ) : (
          fase === "sin-voz" && <p className="apunte">Cargá una voz para empezar.</p>
        )}
      </div>

      {(generando || probando) && (
        <div className="carga">
          <p className="apunte">
            {mensaje}
            {progreso?.nombre && <span className="cifra"> {progreso.nombre}</span>}
            {generando && progreso && progreso.total > 0 && (
              <span className="cifra">
                {" "}
                · {Math.min(progreso.hecho + 1, progreso.total)} de {progreso.total}
              </span>
            )}
          </p>
          {generando && (
            <div className="barra">
              <i style={{ width: `${Math.max(porcentaje, 4)}%` }} />
            </div>
          )}
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
              {/* El tiempo que tardó, al lado del que dura. Sin el número, la
                  única forma de saber si un cambio aceleró algo es la
                  impresión de quien lo hizo. */}
              <span className="cifra">
                {" "}
                · generado en {(resultado.msGeneracion / 1000).toFixed(0)} s
                {hilos ? ` con ${hilos} ${hilos === 1 ? "hilo" : "hilos"}` : ""}
              </span>
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
