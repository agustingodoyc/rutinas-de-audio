import { useRef, useState } from "react";
import { enviarSugerencia } from "../datos/nube";
import { haySupabase } from "../datos/supabase";

const MAX = 2000;
const CLAVE_ULTIMO = "rutinas:ultima-sugerencia";
const ESPERA_MS = 60_000;

/**
 * Buzón de sugerencias.
 *
 * El mensaje va a una tabla donde cualquiera puede escribir y nadie puede
 * leer: RLS encendido, política de insert, ninguna de select. Los mensajes se
 * leen desde el panel de Supabase, con una llave que nunca viaja al navegador.
 *
 * El motivo del diseño es concreto: recibir sugerencias sin publicar una
 * dirección de contacto. Un `mailto:` o un link de WhatsApp dejan el dato a la
 * vista en la página y, peor, dentro del bundle, que cualquiera puede abrir y
 * los bots recorren buscando exactamente eso. Acá no hay ningún dato de
 * contacto que exponer, ni en la pantalla ni en el código.
 *
 * El campo de contacto es al revés: es de quien escribe, opcional, y sirve
 * para que pueda pedir respuesta si quiere.
 */
export function Sugerencias() {
  const [texto, setTexto] = useState("");
  const [contacto, setContacto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [estado, setEstado] = useState<"" | "listo" | "error">("");
  const [mensaje, setMensaje] = useState("");

  /* Honeypot: un campo escondido que una persona nunca ve ni completa, y que
     un bot que rellena todo lo que encuentra sí. Si viene con algo, se
     descarta en silencio. No frena a nadie decidido, pero sí al ruido
     automático, y cuesta cuatro líneas. */
  const trampa = useRef<HTMLInputElement>(null);

  if (!haySupabase) return null;

  const restantes = MAX - texto.length;

  const enviar = async () => {
    const limpio = texto.trim();
    if (!limpio) {
      setEstado("error");
      setMensaje("Escribí algo antes de enviar.");
      return;
    }

    if (trampa.current?.value) {
      // Se le dice que salió bien y no se guarda nada.
      setEstado("listo");
      setTexto("");
      return;
    }

    /* Un minuto entre mensajes. Es del lado del cliente, así que no es una
       defensa de verdad —quien quiera saltearla la saltea— pero evita el
       doble clic y el envío repetido por impaciencia, que es el 99% de los
       duplicados reales. */
    try {
      const ultimo = Number(localStorage.getItem(CLAVE_ULTIMO) ?? 0);
      if (Date.now() - ultimo < ESPERA_MS) {
        setEstado("error");
        setMensaje("Recién enviaste una. Esperá un minuto y mandá la que falta.");
        return;
      }
    } catch {
      /* Sin localStorage se envía igual. */
    }

    setEnviando(true);
    try {
      await enviarSugerencia(limpio, contacto);
      try {
        localStorage.setItem(CLAVE_ULTIMO, String(Date.now()));
      } catch {
        /* No poder recordarlo no es motivo para fallar. */
      }
      setTexto("");
      setContacto("");
      setEstado("listo");
      setMensaje("Gracias. Lo leo.");
    } catch (e) {
      setEstado("error");
      setMensaje(
        e instanceof Error ? e.message : "No pude enviarla. Probá de nuevo en un rato."
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="panel sugerencias" aria-labelledby="titulo-sugerencias">
      <p className="titulo-panel" id="titulo-sugerencias">
        Sugerencias
      </p>
      <p className="apunte">
        ¿Algo no se entiende, no funciona o te gustaría que hiciera? Contámelo. Lo leo todo.
      </p>

      <textarea
        value={texto}
        maxLength={MAX}
        rows={4}
        placeholder="Tu sugerencia…"
        disabled={enviando}
        onChange={(e) => {
          setTexto(e.target.value);
          setEstado("");
        }}
        aria-label="Tu sugerencia"
      />

      <label className="campo">
        <span>Si querés respuesta, dejá cómo ubicarte (opcional)</span>
        <input
          value={contacto}
          maxLength={200}
          placeholder="Mail, usuario de Instagram, lo que prefieras"
          disabled={enviando}
          onChange={(e) => setContacto(e.target.value)}
        />
      </label>

      {/* Invisible para una persona, tentador para un bot. */}
      <input
        ref={trampa}
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="oculto"
      />

      <div className="sugerencias-pie">
        <button className="boton primario" onClick={enviar} disabled={enviando || !texto.trim()}>
          {enviando ? "Enviando…" : "Enviar"}
        </button>
        <span className="apunte">
          {estado === "" && restantes < 200 ? `${restantes} caracteres` : ""}
        </span>
      </div>

      {estado !== "" && mensaje && (
        <p className={estado === "error" ? "error" : "apunte"} role="status">
          {mensaje}
        </p>
      )}
    </section>
  );
}
