import { useCallback, useEffect, useMemo, useState } from "react";
import type { Ejercicio, Rutina } from "../tipos";
import { bajarCompartidasConmigo, esTablaFaltante } from "./nube";
import { haySupabase } from "./supabase";

/**
 * Las rutinas que otras personas compartieron con vos.
 *
 * Se piden por mail, que es el de la sesión iniciada: sin cuenta no hay nada
 * que mostrar, porque compartir es con alguien en particular y ese alguien
 * tiene que poder identificarse.
 *
 * No se guardan en el navegador. Eso es deliberado y es lo que hace que la
 * promesa se cumpla: si el dueño borra la rutina o uno de sus ejercicios, la
 * base deja de devolverlos y desaparecen de acá. Una copia local seguiría
 * viva y habría que inventar un mecanismo para ir a borrarla, que es
 * justamente el problema que este diseño evita en vez de resolver.
 */
export function useCompartidas(mail: string | null) {
  const [rutinas, setRutinas] = useState<Rutina[]>([]);
  const [ejercicios, setEjercicios] = useState<Ejercicio[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const recargar = useCallback(async () => {
    if (!haySupabase || !mail) {
      setRutinas([]);
      setEjercicios([]);
      return;
    }
    setCargando(true);
    try {
      const datos = await bajarCompartidasConmigo(mail);
      setRutinas(datos.rutinas);
      setEjercicios(datos.ejercicios);
      setError("");
    } catch (e) {
      /* Sin la tabla no hay nada compartido que mostrar, que es un estado
         perfectamente válido de la app. El cartel rojo arriba de la página
         sería ruido para el visitante y no arregla nada. */
      if (esTablaFaltante(e)) {
        console.error("Falta la tabla `rutinas_compartidas`: correr supabase/migracion-02.", e);
        setRutinas([]);
        setEjercicios([]);
        setError("");
      } else {
        setError(e instanceof Error ? e.message : "No pude traer las rutinas compartidas con vos.");
      }
    } finally {
      setCargando(false);
    }
  }, [mail]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const indice = useMemo(() => {
    const mapa = new Map<string, Ejercicio>();
    for (const ejercicio of ejercicios) mapa.set(ejercicio.id, ejercicio);
    return mapa;
  }, [ejercicios]);

  return { rutinas, indice, cargando, error, recargar };
}
