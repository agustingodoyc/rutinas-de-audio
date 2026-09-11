import { useRef, useState } from "react";
import type { Ejercicio, Rutina } from "../tipos";
import { exportar, importar, type Paquete } from "../datos/intercambio";

type Props = {
  ejerciciosPropios: Ejercicio[];
  rutinasPropias: Rutina[];
  indice: Map<string, Ejercicio>;
  onImportar: (paquete: Paquete) => void;
};

function descargar(nombre: string, contenido: unknown) {
  const blob = new Blob([JSON.stringify(contenido, null, 4)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Importar y exportar en el formato de audios-de-entrenamiento, el proyecto
 * de Python. La biblioteca personal viaja entre los dos sin pasar por ningún
 * servidor: son archivos que salen y entran del disco de quien usa la página.
 *
 * Va plegado a propósito. Manejar archivos JSON es la forma cómoda para quien
 * ya tiene su biblioteca armada en el proyecto de Python, y es ruido para
 * cualquier otra persona: la forma normal de cargar un ejercicio es el
 * formulario de "Mis ejercicios". Una función para pocos no debería ocupar el
 * mismo lugar que la que usan todos.
 */
export function BarraDatos({ ejerciciosPropios, rutinasPropias, indice, onImportar }: Props) {
  const entrada = useRef<HTMLInputElement>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [esError, setEsError] = useState(false);

  const hayAlgo = ejerciciosPropios.length > 0 || rutinasPropias.length > 0;

  const leer = async (archivos: FileList | null) => {
    if (!archivos?.length) return;
    setMensaje(null);

    try {
      const contenidos = await Promise.all(
        [...archivos].map(async (f) => {
          try {
            return JSON.parse(await f.text()) as unknown;
          } catch {
            throw new Error(`${f.name} no es un JSON válido.`);
          }
        })
      );

      const paquete = importar(contenidos);
      onImportar(paquete);
      setEsError(false);
      setMensaje(
        `Importé ${paquete.ejercicios.length} ejercicios y ${paquete.rutinas.length} rutinas.`
      );
    } catch (err) {
      setEsError(true);
      setMensaje(err instanceof Error ? err.message : "No pude leer el archivo.");
    } finally {
      if (entrada.current) entrada.current.value = "";
    }
  };

  const salida = () => exportar(ejerciciosPropios, rutinasPropias, indice);

  return (
    <details className="panel datos avanzado">
      <summary>
        <span className="titulo-panel">Importar o exportar archivos</span>
        <span className="apunte">Para traer tu biblioteca del proyecto de Python</span>
      </summary>

      <div className="voz-fila">

        <input
          ref={entrada}
          type="file"
          accept="application/json,.json"
          multiple
          className="oculto"
          onChange={(e) => leer(e.target.files)}
        />

        <button className="boton" onClick={() => entrada.current?.click()}>
          Importar JSON
        </button>
        <button
          className="boton"
          onClick={() => descargar("ejercicios.json", salida().ejercicios)}
          disabled={!ejerciciosPropios.length}
        >
          Exportar ejercicios
        </button>
        <button
          className="boton"
          onClick={() => descargar("rutinas.json", salida().rutinas)}
          disabled={!rutinasPropias.length}
        >
          Exportar rutinas
        </button>
      </div>

      <p className={esError ? "error" : "apunte"} role={esError ? "alert" : undefined}>
        {mensaje ??
          (hayAlgo
            ? "Tus rutinas viven en este navegador. Exportalas para llevarlas a otro lado o al script de Python."
            : "Mismo formato que ejercicios.json y rutinas.json de audios-de-entrenamiento: podés traer tu biblioteca tal cual está.")}
      </p>
    </details>
  );
}
