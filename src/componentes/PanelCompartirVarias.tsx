import { useCallback, useEffect, useMemo, useState } from "react";
import type { Ejercicio, Rutina } from "../tipos";
import { duracionEstimada, esEjercicioPropio, mmss, resolver } from "../datos/catalogo";
import {
  compartirRutinas,
  destinatariosRecientes,
  esTablaFaltante,
  normalizarMail,
} from "../datos/nube";

type Props = {
  usuarioId: string;
  /** Las rutinas propias: son las únicas que se pueden compartir. */
  rutinas: Rutina[];
  indice: Map<string, Ejercicio>;
  onListo: () => void;
};

const pareceMail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/**
 * Compartir varias rutinas con una persona de una sola vez.
 *
 * El panel de una rutina sola resuelve «quiero que esta persona tenga esto».
 * Este resuelve el otro caso, que aparece cuando ya tenés biblioteca: «le
 * quiero pasar mis rutinas a alguien». Hacerlo de a una son diez modales.
 *
 * Por eso la dirección es una sola y las rutinas muchas: es el sentido en que
 * se agrupa el trabajo real. Elegir N rutinas y N destinatarios a la vez sería
 * una matriz, y una matriz en una pantalla de celular no la llena nadie.
 */
export function PanelCompartirVarias({ usuarioId, rutinas, indice, onListo }: Props) {
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [mail, setMail] = useState("");
  const [recientes, setRecientes] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState("");

  const cargar = useCallback(async () => {
    try {
      setRecientes(await destinatariosRecientes(usuarioId));
    } catch (e) {
      if (!esTablaFaltante(e)) {
        setError(e instanceof Error ? e.message : "No pude leer con quiénes compartiste antes.");
      }
    }
  }, [usuarioId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const alternar = (id: string) => {
    setHecho("");
    setSeleccion((prev) => {
      const copia = new Set(prev);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  };

  const todas = seleccion.size === rutinas.length && rutinas.length > 0;

  /**
   * Los ejercicios tuyos que las rutinas elegidas usan, sin repetir.
   *
   * Se calcula sobre la selección y no sobre la biblioteca entera: el aviso
   * tiene que decir qué texto se va a compartir con esta acción, no qué texto
   * existe. Un aviso que exagera se aprende a ignorar.
   */
  const propios = useMemo(() => {
    const nombres = new Set<string>();
    for (const rutina of rutinas) {
      if (!seleccion.has(rutina.id)) continue;
      for (const item of resolver(rutina, indice)) {
        if (esEjercicioPropio(item.id)) nombres.add(item.nombre);
      }
    }
    return [...nombres];
  }, [rutinas, seleccion, indice]);

  const compartir = async () => {
    const destino = normalizarMail(mail);
    if (!seleccion.size) return setError("Elegí al menos una rutina.");
    if (!pareceMail(destino)) return setError("Escribí un mail válido.");

    setOcupado(true);
    try {
      await compartirRutinas(usuarioId, [...seleccion], destino);
      setHecho(
        seleccion.size === 1
          ? `Compartiste 1 rutina con ${destino}.`
          : `Compartiste ${seleccion.size} rutinas con ${destino}.`
      );
      setSeleccion(new Set());
      setMail("");
      setError("");
      setRecientes((prev) => [destino, ...prev.filter((m) => m !== destino)].slice(0, 8));
      onListo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude compartirlas.");
    } finally {
      setOcupado(false);
    }
  };

  if (!rutinas.length) {
    return <p className="apunte">Todavía no tenés rutinas propias para compartir.</p>;
  }

  return (
    <div className="compartir">
      <div className="compartir-cabeza">
        <span className="apunte">
          {seleccion.size
            ? `${seleccion.size} de ${rutinas.length} elegidas`
            : `Elegí cuáles de tus ${rutinas.length} rutinas`}
        </span>
        <button
          className="boton chico fantasma"
          disabled={ocupado}
          onClick={() => setSeleccion(todas ? new Set() : new Set(rutinas.map((r) => r.id)))}
        >
          {todas ? "Ninguna" : "Todas"}
        </button>
      </div>

      <ul className="compartir-rutinas">
        {rutinas.map((r) => {
          const items = resolver(r, indice);
          return (
            <li key={r.id}>
              <label className="casilla">
                <input
                  type="checkbox"
                  checked={seleccion.has(r.id)}
                  disabled={ocupado}
                  onChange={() => alternar(r.id)}
                />
                <span className="compartir-rutina-nombre">{r.nombre}</span>
                <span className="apunte">{mmss(duracionEstimada(items))}</span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="compartir-alta">
        <input
          type="email"
          value={mail}
          placeholder="mail@ejemplo.com"
          disabled={ocupado}
          onChange={(e) => {
            setMail(e.target.value);
            setError("");
            setHecho("");
          }}
          onKeyDown={(e) => e.key === "Enter" && void compartir()}
          aria-label="Mail de la persona"
        />
        <button
          className="boton primario"
          disabled={ocupado || !seleccion.size || !mail.trim()}
          onClick={() => void compartir()}
        >
          {ocupado
            ? "Compartiendo…"
            : seleccion.size > 1
              ? `Compartir ${seleccion.size}`
              : "Compartir"}
        </button>
      </div>

      {recientes.length > 0 && (
        <div className="compartir-recientes">
          <span className="apunte">Antes compartiste con:</span>
          {recientes.map((m) => (
            <button
              key={m}
              className="boton chico fantasma"
              disabled={ocupado}
              onClick={() => {
                setMail(m);
                setError("");
              }}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {propios.length > 0 && (
        <div className="aviso-publicar" role="status">
          <p>
            <strong>Se comparte también tu texto.</strong> Con lo que elegiste, esa persona va a
            poder leer las instrucciones de {propios.length}{" "}
            {propios.length === 1 ? "ejercicio tuyo" : "ejercicios tuyos"}:
          </p>
          <ul>
            {propios.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {hecho && (
        <p className="apunte" role="status">
          {hecho} Es de sólo lectura, y si borrás algo le desaparece.
        </p>
      )}
    </div>
  );
}
