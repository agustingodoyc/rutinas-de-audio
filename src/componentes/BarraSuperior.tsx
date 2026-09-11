import { useState } from "react";
import type { Sesion } from "../datos/useSesion";

type Props = {
  sesion: Sesion;
  /** true mientras la biblioteca se está poniendo al día con la nube. */
  sincronizando: boolean;
};

/** El nombre que Google manda en el perfil; si no vino, el mail. */
function nombreDe(sesion: Sesion): string {
  const usuario = sesion.session?.user;
  if (!usuario) return "";
  const meta = usuario.user_metadata as { full_name?: string; name?: string };
  return meta.full_name || meta.name || usuario.email || "Tu cuenta";
}

function avatarDe(sesion: Sesion): string {
  const meta = sesion.session?.user.user_metadata as { avatar_url?: string } | undefined;
  return meta?.avatar_url ?? "";
}

/**
 * El encabezado: la marca y la cuenta.
 *
 * Cuando el proyecto no tiene Supabase configurado —el caso de cualquiera que
 * clone el repositorio— el panel lo dice en vez de ofrecer un login que no
 * puede funcionar. La app entera anda igual sin cuenta.
 */
export function BarraSuperior({ sesion, sincronizando }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [fallaAvatar, setFallaAvatar] = useState(false);

  const usuario = sesion.session?.user;
  const nombre = nombreDe(sesion);
  const avatar = avatarDe(sesion);

  return (
    <header className="encabezado">
      <div className="encabezado-interior">
        <a className="marca" href="./">
          <img
            className="marca-icono"
            src={`${import.meta.env.BASE_URL}iconos/icono-192.png`}
            alt=""
            width={36}
            height={36}
          />
          <span className="marca-nombre">Rutinas de audio</span>
        </a>

        <div className="encabezado-acciones">
          {sincronizando && (
            <span className="sincro" role="status">
              Sincronizando…
            </span>
          )}
          {usuario ? (
            <button
              className="cuenta-boton"
              onClick={() => setAbierto((x) => !x)}
              aria-expanded={abierto}
            >
              {avatar && !fallaAvatar ? (
                <img
                  className="cuenta-avatar"
                  src={avatar}
                  alt=""
                  width={28}
                  height={28}
                  referrerPolicy="no-referrer"
                  onError={() => setFallaAvatar(true)}
                />
              ) : (
                <span className="cuenta-inicial" aria-hidden="true">
                  {nombre.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="cuenta-nombre">{nombre}</span>
            </button>
          ) : (
            <>
              <button
                className="boton chico fantasma"
                onClick={() => setAbierto((x) => !x)}
                aria-expanded={abierto}
                disabled={sesion.cargando}
              >
                Iniciar sesión
              </button>
              <button
                className="boton chico primario"
                onClick={() => setAbierto(true)}
                disabled={sesion.cargando}
              >
                Crear cuenta
              </button>
            </>
          )}
        </div>
      </div>

      {abierto && (
        <div className="cuentas" role="dialog" aria-label="Tu cuenta">
          <p className="titulo-panel">Tu cuenta</p>

          {usuario ? (
            <>
              <p className="apunte">
                Entraste como <strong>{nombre}</strong>. Tus rutinas y ejercicios se sincronizan
                con tu cuenta.
              </p>
              <button
                className="boton"
                onClick={() => {
                  sesion.salir();
                  setAbierto(false);
                }}
              >
                Cerrar sesión
              </button>
            </>
          ) : (
            <>
              <p className="apunte">
                Guardá tus rutinas y llevalas a cualquier dispositivo. Sin cuenta la app funciona
                igual: todo queda en este navegador.
              </p>

              <button className="boton google" onClick={sesion.entrarConGoogle} disabled={!sesion.disponible}>
                <span className="google-marca" aria-hidden="true">
                  G
                </span>
                Continuar con Google
              </button>

              {!sesion.disponible && (
                <p className="apunte pendiente">
                  Este proyecto todavía no tiene Supabase configurado: copiá <code>.env.example</code>{" "}
                  a <code>.env.local</code> con los datos de tu proyecto.
                </p>
              )}
            </>
          )}

          {sesion.error && <p className="error">{sesion.error}</p>}

          <button className="boton chico fantasma" onClick={() => setAbierto(false)}>
            Cerrar
          </button>
        </div>
      )}
    </header>
  );
}
