import { useState } from "react";
import type { EjercicioResuelto, Rutina } from "../tipos";
import { duracionEstimada, mmss } from "../datos/catalogo";
import { grupoConColor, grupoDominante } from "../datos/fotos";
import { separarInstrucciones } from "../datos/texto";
import { Foto } from "./Foto";

type Props = {
  rutina: Rutina;
  items: EjercicioResuelto[];
  enCurso?: string;
  onEditar?: () => void;
  /** Sólo en las rutinas ajenas —catálogo o comunidad—: traerla a la propia. */
  onCopiar?: () => void;
};

export function DetalleRutina({ rutina, items, enCurso, onEditar, onCopiar }: Props) {
  const color = grupoDominante(items.map((e) => e.grupo));
  const portada = items[0];

  // Una fila abierta a la vez, o todas juntas. Poder leer la rutina entera
  // antes de generarla es lo que evita bajar un MP3 de cinco minutos para
  // enterarte recién ahí de qué ejercicios tenía.
  const [abierta, setAbierta] = useState<number | null>(null);
  const [todas, setTodas] = useState(false);

  const alternar = (i: number) => {
    setTodas(false);
    setAbierta((actual) => (actual === i ? null : i));
  };

  return (
    <section className="detalle" data-grupo={color}>
      <header className="portada">
        {portada && <Foto idEjercicio={portada.id} grupo={color} variante="portada" />}

        <div className="portada-texto">
          {rutina.autor && <span className="portada-autor">por {rutina.autor}</span>}
          <h2>{rutina.nombre}</h2>
          {rutina.descripcion && <p>{rutina.descripcion}</p>}
        </div>

        {onEditar && (
          <button className="boton chico portada-editar" onClick={onEditar}>
            Editar
          </button>
        )}

        {onCopiar && (
          <button className="boton chico portada-editar" onClick={onCopiar}>
            Copiar a mis rutinas
          </button>
        )}
      </header>

      <div className="detalle-datos">
        <p className="duracion">
          <strong>{mmss(duracionEstimada(items))}</strong> <span>de audio</span>
        </p>

        <div className="detalle-acciones">
          <span className="apunte">
            {items.length} {items.length === 1 ? "ejercicio" : "ejercicios"}
          </span>
          {items.length > 0 && (
            <button
              className="boton chico fantasma"
              onClick={() => {
                setAbierta(null);
                setTodas((x) => !x);
              }}
            >
              {todas ? "Ocultar el texto" : "Ver el texto"}
            </button>
          )}
        </div>
      </div>

      <ol className="ejercicios lectura">
        {items.map((e, i) => {
          const grupo = grupoConColor(e.grupo);
          const desplegada = todas || abierta === i;
          const texto = separarInstrucciones(e.instrucciones);

          return (
            <li
              key={`${e.id}-${i}`}
              className={e.nombre === enCurso ? "en-curso" : undefined}
              data-grupo={grupo}
            >
              <button
                className="fila"
                onClick={() => alternar(i)}
                aria-expanded={desplegada}
                aria-label={`${e.nombre}, ${e.seg} segundos. Ver el texto que va a leer la voz.`}
              >
                <span className="orden">{i + 1}</span>
                <Foto idEjercicio={e.id} grupo={grupo} />
                <span className="nombre">
                  {e.nombre}
                  <em className="chip chip-grupo">{e.grupo}</em>
                  {e.cambioLado && <em className="chip">cambio de lado</em>}
                </span>
                <span className="segundos">{e.seg}s</span>
                <span className={`flecha${desplegada ? " abierta" : ""}`} aria-hidden="true">
                  ⌄
                </span>
              </button>

              {desplegada && (
                <div className="instrucciones">
                  <p>{texto.comoSeHace}</p>
                  {texto.consejo && (
                    <p className="consejo">
                      <strong>Consejo.</strong> {texto.consejo}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
