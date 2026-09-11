import { useCallback, useEffect, useMemo, useState } from "react";
import type { Ejercicio, Rutina } from "../tipos";
import { indexar, rutinasCatalogo } from "./catalogo";
import {
  TIENDA_EJERCICIOS,
  TIENDA_RUTINAS,
  guardar,
  guardarVarios,
  leerTodo,
} from "./almacen";
import type { Paquete } from "./intercambio";
import { bajarBiblioteca, subirEjercicio, subirRutina } from "./nube";
import { fusionar } from "./fusion";

/** Pisa el elemento con el mismo id, o lo agrega al final. */
function reemplazar<T extends { id: string }>(lista: T[], valor: T): T[] {
  const i = lista.findIndex((x) => x.id === valor.id);
  if (i === -1) return [...lista, valor];
  const copia = lista.slice();
  copia[i] = valor;
  return copia;
}

/** Lo borrado sigue guardado como lápida, pero no se muestra. */
const vivos = <T extends { borrado?: boolean }>(lista: T[]) => lista.filter((x) => !x.borrado);

/**
 * La biblioteca del usuario.
 *
 * Es *local-first*: la fuente de verdad es IndexedDB, en el navegador. Todo
 * anda sin cuenta y sin internet. Cuando hay sesión, además, se sincroniza con
 * Supabase: al entrar se fusionan las dos bibliotecas, y de ahí en adelante
 * cada cambio se guarda local primero y se sube después. Si la subida falla,
 * el cambio no se pierde: quedó guardado acá y se sube en la próxima fusión.
 *
 * @param usuarioId id de quien inició sesión, o null si no hay nadie.
 */
export function useBiblioteca(usuarioId: string | null) {
  const [ejerciciosPropios, setEjerciciosPropios] = useState<Ejercicio[]>([]);
  const [rutinasPropias, setRutinasPropias] = useState<Rutina[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Carga local ──────────────────────────────────────────────────────
  useEffect(() => {
    let vigente = true;

    (async () => {
      try {
        const [ejercicios, rutinas] = await Promise.all([
          leerTodo<Ejercicio>(TIENDA_EJERCICIOS),
          leerTodo<Rutina>(TIENDA_RUTINAS),
        ]);
        if (!vigente) return;
        setEjerciciosPropios(ejercicios);
        setRutinasPropias(rutinas);
      } catch {
        if (vigente) {
          setError(
            "No pude abrir el guardado local. En ventana privada el navegador a veces lo bloquea; lo que armes va a funcionar igual pero no se va a guardar."
          );
        }
      } finally {
        if (vigente) setCargando(false);
      }
    })();

    return () => {
      vigente = false;
    };
  }, []);

  // ── Sincronización al iniciar sesión ─────────────────────────────────
  // Corre cuando aparece un usuario (login, o recarga con sesión guardada).
  // `cargando` en las dependencias no es un detalle: si esto se adelantara a
  // la lectura de IndexedDB, fusionaría contra una biblioteca local vacía y
  // subiría la nube encima de todo lo que había acá.
  useEffect(() => {
    if (!usuarioId || cargando) return;
    let vigente = true;

    (async () => {
      setSincronizando(true);
      try {
        const remoto = await bajarBiblioteca(usuarioId);
        if (!vigente) return;

        const ejercicios = fusionar(ejerciciosPropios, remoto.ejercicios);
        const rutinas = fusionar(rutinasPropias, remoto.rutinas);

        setEjerciciosPropios(ejercicios.fusionados);
        setRutinasPropias(rutinas.fusionados);

        await Promise.all([
          guardarVarios(TIENDA_EJERCICIOS, ejercicios.fusionados),
          guardarVarios(TIENDA_RUTINAS, rutinas.fusionados),
        ]);

        // Lo que ganó acá todavía no está allá.
        for (const ejercicio of ejercicios.aSubir) await subirEjercicio(usuarioId, ejercicio);
        for (const rutina of rutinas.aSubir) await subirRutina(usuarioId, rutina);
      } catch (e) {
        if (vigente) {
          setError(
            `No pude sincronizar con tu cuenta: ${
              e instanceof Error ? e.message : "error desconocido"
            }. Tus rutinas siguen guardadas en este navegador.`
          );
        }
      } finally {
        if (vigente) setSincronizando(false);
      }
    })();

    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioId, cargando]);

  const indice = useMemo(() => indexar(vivos(ejerciciosPropios)), [ejerciciosPropios]);
  const rutinas = useMemo(
    () => [...rutinasCatalogo, ...vivos(rutinasPropias)],
    [rutinasPropias]
  );

  // ── Escrituras: primero local, después la nube ───────────────────────

  const guardarEjercicio = useCallback(
    async (ejercicio: Ejercicio) => {
      const valor: Ejercicio = {
        ...ejercicio,
        propio: true,
        borrado: false,
        actualizado: Date.now(),
      };
      setEjerciciosPropios((prev) => reemplazar(prev, valor));
      await guardar(TIENDA_EJERCICIOS, valor).catch(() => {});
      if (usuarioId) await subirEjercicio(usuarioId, valor).catch(() => {});
    },
    [usuarioId]
  );

  const guardarRutina = useCallback(
    async (rutina: Rutina) => {
      const valor: Rutina = {
        ...rutina,
        propia: true,
        borrado: false,
        actualizado: Date.now(),
      };
      setRutinasPropias((prev) => reemplazar(prev, valor));
      await guardar(TIENDA_RUTINAS, valor).catch(() => {});
      if (usuarioId) await subirRutina(usuarioId, valor).catch(() => {});
    },
    [usuarioId]
  );

  /* Borrar no borra: deja una lápida con la fecha. Si se borrara de verdad, el
     otro dispositivo —que todavía tiene la rutina— la volvería a subir en la
     próxima sincronización y reaparecería sola. */
  const borrarRutina = useCallback(
    async (id: string) => {
      let lapida: Rutina | undefined;
      setRutinasPropias((prev) => {
        const previa = prev.find((r) => r.id === id);
        if (!previa) return prev;
        lapida = { ...previa, borrado: true, actualizado: Date.now() };
        return reemplazar(prev, lapida);
      });
      if (!lapida) return;
      await guardar(TIENDA_RUTINAS, lapida).catch(() => {});
      if (usuarioId) await subirRutina(usuarioId, lapida).catch(() => {});
    },
    [usuarioId]
  );

  const borrarEjercicio = useCallback(
    async (id: string) => {
      let lapida: Ejercicio | undefined;
      setEjerciciosPropios((prev) => {
        const previo = prev.find((e) => e.id === id);
        if (!previo) return prev;
        lapida = { ...previo, borrado: true, actualizado: Date.now() };
        return reemplazar(prev, lapida);
      });
      if (!lapida) return;
      await guardar(TIENDA_EJERCICIOS, lapida).catch(() => {});
      if (usuarioId) await subirEjercicio(usuarioId, lapida).catch(() => {});
    },
    [usuarioId]
  );

  /** Importa un paquete completo: lo que ya existe con el mismo id se pisa. */
  const importarPaquete = useCallback(
    async (paquete: Paquete) => {
      const ahora = Date.now();
      const ejercicios: Ejercicio[] = paquete.ejercicios.map((e) => ({
        ...e,
        propio: true,
        borrado: false,
        actualizado: ahora,
      }));
      const rutinasNuevas: Rutina[] = paquete.rutinas.map((r) => ({
        ...r,
        propia: true,
        borrado: false,
        actualizado: ahora,
      }));

      setEjerciciosPropios((prev) => ejercicios.reduce((acc, e) => reemplazar(acc, e), prev));
      setRutinasPropias((prev) => rutinasNuevas.reduce((acc, r) => reemplazar(acc, r), prev));

      await Promise.all([
        guardarVarios(TIENDA_EJERCICIOS, ejercicios).catch(() => {}),
        guardarVarios(TIENDA_RUTINAS, rutinasNuevas).catch(() => {}),
      ]);

      if (usuarioId) {
        for (const ejercicio of ejercicios) await subirEjercicio(usuarioId, ejercicio).catch(() => {});
        for (const rutina of rutinasNuevas) await subirRutina(usuarioId, rutina).catch(() => {});
      }
    },
    [usuarioId]
  );

  return {
    cargando,
    sincronizando,
    error,
    indice,
    rutinas,
    rutinasPropias: vivos(rutinasPropias),
    ejerciciosPropios: vivos(ejerciciosPropios),
    guardarEjercicio,
    guardarRutina,
    borrarRutina,
    borrarEjercicio,
    importarPaquete,
  };
}
