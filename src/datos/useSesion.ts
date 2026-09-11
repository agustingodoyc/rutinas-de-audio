import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { haySupabase, supabase } from "./supabase";

export type Sesion = {
  /** null = no hay nadie con sesión iniciada. */
  session: Session | null;
  /** true mientras se averigua si había una sesión guardada. */
  cargando: boolean;
  /** false cuando el proyecto no tiene Supabase configurado. */
  disponible: boolean;
  error: string;
  entrarConGoogle: () => void;
  salir: () => void;
};

/**
 * La sesión de quien está usando la app.
 *
 * El login es **por redirección**, no por popup, y no es una preferencia: la
 * página corre con `Cross-Origin-Opener-Policy: same-origin` porque ONNX
 * necesita SharedArrayBuffer, y con eso un popup no puede hablar con la
 * ventana que lo abrió. El flujo por popup de Google se cuelga sin decir por
 * qué. Redirigir la página entera no depende del `opener` y funciona igual.
 */
export function useSesion(): Sesion {
  const [session, setSession] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(haySupabase);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    let vigente = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!vigente) return;
        setSession(data.session);
        setCargando(false);
      })
      .catch(() => vigente && setCargando(false));

    const { data } = supabase.auth.onAuthStateChange((_evento, nueva) => {
      if (vigente) setSession(nueva);
    });

    return () => {
      vigente = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const entrarConGoogle = useCallback(() => {
    if (!supabase) return;
    setError("");
    supabase.auth
      .signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
      })
      .then(({ error }) => error && setError(error.message))
      .catch(() => setError("No se pudo abrir el login de Google."));
  }, []);

  const salir = useCallback(() => {
    if (!supabase) return;
    supabase.auth
      .signOut()
      .then(({ error }) => error && setError(error.message))
      .catch(() => setError("No se pudo cerrar la sesión."));
  }, []);

  return { session, cargando, disponible: haySupabase, error, entrarConGoogle, salir };
}
