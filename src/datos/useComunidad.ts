import { useCallback, useEffect, useMemo, useState } from "react";
import type { Ejercicio, Rutina } from "../tipos";
import { bajarRutinasPublicas } from "./nube";
import { haySupabase } from "./supabase";

/**
 * Las rutinas que publicó el resto de la gente.
 *
 * Se leen sin sesión: son públicas de verdad. Si Supabase no está configurado
 * —alguien que clonó el repositorio y todavía no armó su proyecto— devuelve
 * listas vacías y la sección simplemente no aparece.
 */
export function useComunidad() {
  const [rutinas, setRutinas] = useState<Rutina[]>([]);
  const [ejercicios, setEjercicios] = useState<Ejercicio[]>([]);
  const [cargando, setCargando] = useState(haySupabase);
  const [error, setError] = useState("");

  const recargar = useCallback(async () => {
    if (!haySupabase) return;
    setCargando(true);
    try {
      const datos = await bajarRutinasPublicas();
      setRutinas(datos.rutinas);
      setEjercicios(datos.ejercicios);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude traer las rutinas de la comunidad.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  /** Índice de los ejercicios publicados, para poder resolver sus rutinas. */
  const indice = useMemo(() => {
    const mapa = new Map<string, Ejercicio>();
    for (const ejercicio of ejercicios) mapa.set(ejercicio.id, ejercicio);
    return mapa;
  }, [ejercicios]);

  return { rutinas, indice, cargando, error, recargar };
}
