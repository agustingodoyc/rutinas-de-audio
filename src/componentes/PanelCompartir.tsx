import { useCallback, useEffect, useState } from "react";
import {
  compartirRutina,
  dejarDeCompartir,
  destinatariosRecientes,
  esTablaFaltante,
  listarComparticiones,
  normalizarMail,
} from "../datos/nube";

type Props = {
  usuarioId: string;
  rutinaId: string;
  /** Nombres de los ejercicios tuyos que esta rutina usa. */
  propios: string[];
};

/* Validación a propósito floja: alcanza para atajar el error de tipeo obvio.
   Validar mails con una expresión estricta es un clásico que termina
   rechazando direcciones válidas; quien la valida de verdad es el servidor de
   correo cuando llega el mensaje. */
const pareceMail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/**
 * Con quién está compartida esta rutina.
 *
 * Compartir no copia nada: agrega permiso de lectura para un mail. De ahí sale
 * la propiedad que se quería —si borrás la rutina o un ejercicio, al otro le
 * desaparece— sin ningún mecanismo que vaya a borrar copias por ahí. Nunca
 * hubo una segunda copia.
 *
 * Se puede compartir con alguien que todavía no tiene cuenta: el permiso queda
 * guardado contra el mail y se activa solo el día que entre con ese mail.
 */
export function PanelCompartir({ usuarioId, rutinaId, propios }: Props) {
  const [mails, setMails] = useState<string[]>([]);
  const [recientes, setRecientes] = useState<string[]>([]);
  const [nuevo, setNuevo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    try {
      const [actuales, previos] = await Promise.all([
        listarComparticiones(usuarioId, rutinaId),
        destinatariosRecientes(usuarioId),
      ]);
      setMails(actuales);
      setRecientes(previos);
      setError("");
    } catch (e) {
      if (esTablaFaltante(e)) return; // falta la migración; ya se avisa en consola
      setError(e instanceof Error ? e.message : "No pude leer con quién está compartida.");
    }
  }, [usuarioId, rutinaId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const agregar = async (desde?: string) => {
    const mail = normalizarMail(desde ?? nuevo);
    if (!pareceMail(mail)) return setError("Escribí un mail válido.");
    if (mails.includes(mail)) return setError("Ya está compartida con esa dirección.");

    setOcupado(true);
    try {
      await compartirRutina(usuarioId, rutinaId, mail);
      setMails((prev) => [...prev, mail]);
      setRecientes((prev) => [mail, ...prev.filter((m) => m !== mail)].slice(0, 8));
      setNuevo("");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude compartirla.");
    } finally {
      setOcupado(false);
    }
  };

  const quitar = async (mail: string) => {
    setOcupado(true);
    try {
      await dejarDeCompartir(usuarioId, rutinaId, mail);
      setMails((prev) => prev.filter((m) => m !== mail));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude dejar de compartirla.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="compartir">
      <p className="titulo-panel">Compartir con alguien</p>

      <div className="compartir-alta">
        <input
          type="email"
          value={nuevo}
          placeholder="mail@ejemplo.com"
          disabled={ocupado}
          onChange={(e) => {
            setNuevo(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && void agregar()}
          aria-label="Mail de la persona"
        />
        <button className="boton chico" disabled={ocupado || !nuevo.trim()} onClick={() => void agregar()}>
          Compartir
        </button>
      </div>

      {/* Con quién compartiste antes. No es una lista de amigos: es la misma
          información que ya está en la base, puesta a un clic de distancia. */}
      {recientes.filter((m) => !mails.includes(m)).length > 0 && (
        <div className="compartir-recientes">
          <span className="apunte">Antes compartiste con:</span>
          {recientes
            .filter((m) => !mails.includes(m))
            .map((m) => (
              <button
                key={m}
                className="boton chico fantasma"
                disabled={ocupado}
                onClick={() => void agregar(m)}
              >
                {m}
              </button>
            ))}
        </div>
      )}

      {mails.length > 0 && (
        <ul className="compartir-lista">
          {mails.map((m) => (
            <li key={m}>
              <span>{m}</span>
              <button
                className="icono quitar"
                disabled={ocupado}
                title={`Dejar de compartir con ${m}`}
                onClick={() => void quitar(m)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {propios.length > 0 && (
        <div className="aviso-publicar" role="status">
          <p>
            <strong>Se comparte también tu texto.</strong> Quien la reciba va a poder leer y
            escuchar las instrucciones de estos ejercicios tuyos:
          </p>
          <ul>
            {propios.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <p className="apunte">
            Los del catálogo no están en la lista: los tiene todo el mundo dentro de la app.
          </p>
        </div>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <p className="apunte">
        Es de sólo lectura: la puede escuchar y generar el audio, no editarla. Sigue siendo tuya, así
        que si la borrás —o borrás un ejercicio— le desaparece en el acto. Podés compartirla con
        alguien que todavía no tenga cuenta: le va a aparecer el día que entre con ese mail.
      </p>
    </div>
  );
}
