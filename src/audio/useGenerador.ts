import { useCallback, useEffect, useRef, useState } from "react";
import type { EjercicioResuelto, VozId } from "../tipos";

export type Fase = "sin-voz" | "cargando" | "lista" | "generando" | "listo";

export type Resultado = {
  url: string;
  nombreArchivo: string;
  duracionMs: number;
  bytes: number;
};

export type Descarga = { cargado: number; total: number };
export type Progreso = { hecho: number; total: number; nombre?: string };

type MensajeWorker =
  | { tipo: "estado"; fase: string; detalle?: string }
  | { tipo: "descarga"; cargado: number; total: number }
  | { tipo: "progreso"; hecho: number; total: number; nombre?: string }
  | { tipo: "voz"; voiceId: VozId; bytes?: number; sampleRate?: number; techo?: number }
  | { tipo: "listo"; mp3: ArrayBuffer; duracionMs: number; bytes: number }
  | { tipo: "error"; mensaje: string };

const TEXTOS: Record<string, string> = {
  configuracion: "Buscando la voz…",
  modelo: "Bajando la voz…",
  sesion: "Preparando el modelo…",
  fonemizador: "Cargando el pronunciador…",
  calibrando: "Midiendo la velocidad de la voz…",
  sintetizando: "Sintetizando…",
  codificando: "Armando el MP3…",
};

/**
 * Conecta la interfaz con el motor de audio, que corre en un Web Worker.
 *
 * Todo el trabajo pesado —la red neuronal de voz, el armado de la pista y la
 * codificación del MP3— pasa del otro lado, así la página sigue respondiendo
 * mientras genera. Acá sólo viajan mensajes.
 */
export function useGenerador() {
  const workerRef = useRef<Worker | null>(null);
  const urlRef = useRef<string | null>(null);
  const nombreRef = useRef<string>("rutina");

  const [fase, setFase] = useState<Fase>("sin-voz");
  const [mensaje, setMensaje] = useState("");
  const [descarga, setDescarga] = useState<Descarga | null>(null);
  const [progreso, setProgreso] = useState<Progreso | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [vozCargada, setVozCargada] = useState<VozId | null>(null);
  const [error, setError] = useState<string | null>(null);

  // El worker se crea una sola vez, así que su onmessage no puede leer estado
  // de React directamente sin quedarse con el valor viejo.
  const vozRef = useRef<VozId | null>(null);

  const worker = useCallback(() => {
    if (workerRef.current) return workerRef.current;

    const w = new Worker(`${import.meta.env.BASE_URL}audio-worker.js`);

    w.onmessage = (e: MessageEvent<MensajeWorker>) => {
      const msg = e.data;

      if (msg.tipo === "estado") {
        if (msg.fase === "voz-lista") {
          setFase("lista");
          setMensaje("");
          setDescarga(null);
          return;
        }
        setMensaje(TEXTOS[msg.fase] ?? "");
        return;
      }

      if (msg.tipo === "descarga") {
        setDescarga({ cargado: msg.cargado, total: msg.total });
        return;
      }

      if (msg.tipo === "progreso") {
        setProgreso({ hecho: msg.hecho, total: msg.total, nombre: msg.nombre });
        return;
      }

      if (msg.tipo === "voz") {
        if (msg.bytes) {
          vozRef.current = msg.voiceId;
          setVozCargada(msg.voiceId);
        }
        return;
      }

      if (msg.tipo === "listo") {
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        const url = URL.createObjectURL(new Blob([msg.mp3], { type: "audio/mpeg" }));
        urlRef.current = url;
        setResultado({
          url,
          nombreArchivo: `${nombreRef.current}.mp3`,
          duracionMs: msg.duracionMs,
          bytes: msg.bytes,
        });
        setFase("listo");
        setMensaje("");
        setProgreso(null);
        return;
      }

      if (msg.tipo === "error") {
        setError(msg.mensaje);
        setFase(vozRef.current ? "lista" : "sin-voz");
        setMensaje("");
        setDescarga(null);
        setProgreso(null);
      }
    };

    w.onerror = () => {
      setError(
        "No se pudo iniciar el motor de audio. Revisá la consola del navegador y contame qué dice."
      );
      setFase("sin-voz");
    };

    workerRef.current = w;
    return w;
  }, []);

  const cargarVoz = useCallback(
    (voiceId: VozId) => {
      setError(null);
      setFase("cargando");
      setMensaje(TEXTOS.configuracion);
      worker().postMessage({ tipo: "cargar", voiceId });
    },
    [worker]
  );

  const generar = useCallback(
    (ejercicios: EjercicioResuelto[], nombreArchivo: string) => {
      setError(null);
      setResultado(null);
      setFase("generando");
      setProgreso({ hecho: 0, total: ejercicios.length });
      nombreRef.current = nombreArchivo;
      worker().postMessage({ tipo: "generar", ejercicios });
    },
    [worker]
  );

  const limpiarResultado = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setResultado(null);
    setFase((f) => (f === "listo" ? "lista" : f));
  }, []);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );

  return {
    fase,
    mensaje,
    descarga,
    progreso,
    resultado,
    vozCargada,
    error,
    cargarVoz,
    generar,
    limpiarResultado,
  };
}
