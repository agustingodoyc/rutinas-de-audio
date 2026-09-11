import { createClient } from "@supabase/supabase-js";

/**
 * El cliente de Supabase, o `null` si no está configurado.
 *
 * La app tiene que seguir funcionando sin cuenta: ese es el trato desde el
 * principio —todo pasa en tu navegador— y la sincronización es un extra. Si no
 * hay variables de entorno, `supabase` queda en null y la interfaz muestra las
 * cuentas como lo que son, algo que todavía no está conectado, en vez de
 * romperse al arrancar.
 *
 * Las variables van en `.env.local` (ver `.env.example`).
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const haySupabase = Boolean(url && anon);

export const supabase = haySupabase
  ? createClient(url as string, anon as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // El login vuelve por la URL con el token en el fragmento; que lo lea
        // y limpie la barra de direcciones.
        detectSessionInUrl: true,
      },
    })
  : null;
