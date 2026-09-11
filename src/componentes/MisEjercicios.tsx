import { useState } from "react";
import type { Ejercicio, Rutina } from "../tipos";
import { idEjercicioPropio } from "../datos/catalogo";
import { grupoConColor } from "../datos/fotos";
import { FormularioEjercicio } from "./FormularioEjercicio";

type Props = {
  ejercicios: Ejercicio[];
  rutinas: Rutina[];
  onGuardar: (ejercicio: Ejercicio) => void;
  onBorrar: (id: string) => void;
};

type Edicion = { tipo: "nuevo" } | { tipo: "editar"; ejercicio: Ejercicio } | null;

/**
 * Los ejercicios propios: crear, editar y borrar, sin tocar un archivo.
 *
 * Antes esto sólo listaba y borraba, y la única forma de cargar un ejercicio
 * era entrar a editar una rutina o importar un JSON. Cargar ejercicios es de
 * las primeras cosas que alguien quiere hacer, así que ahora vive en la
 * portada y es un formulario común.
 *
 * Antes de borrar avisa en qué rutinas se está usando: una rutina a la que le
 * falta un ejercicio se genera igual, salteándolo, y eso sorprende si no se
 * dijo antes.
 */
export function MisEjercicios({ ejercicios, rutinas, onGuardar, onBorrar }: Props) {
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [edicion, setEdicion] = useState<Edicion>(null);

  const usadoEn = (id: string) =>
    rutinas.filter((r) => r.ejercicios.some((e) => e.id === id)).map((r) => r.nombre);

  const guardar = (ejercicio: Ejercicio) => {
    onGuardar(ejercicio);
    setEdicion(null);
  };

  return (
    <section className="panel">
      <div className="galeria-cabeza">
        <h2 className="titulo-panel">Mis ejercicios</h2>
        {!edicion && (
          <button className="boton chico" onClick={() => setEdicion({ tipo: "nuevo" })}>
            + Nuevo ejercicio
          </button>
        )}
      </div>

      {edicion && (
        <FormularioEjercicio
          ejercicio={edicion.tipo === "editar" ? edicion.ejercicio : null}
          yaExiste={(nombre) => ejercicios.some((e) => e.id === idEjercicioPropio(nombre))}
          onGuardar={guardar}
          onCancelar={() => setEdicion(null)}
        />
      )}

      {ejercicios.length ? (
        <ul className="mis-ejercicios">
          {ejercicios.map((ej) => {
            const rutinasQueLoUsan = usadoEn(ej.id);
            const preguntando = confirmando === ej.id;

            return (
              <li key={ej.id}>
                <span className="nombre">
                  {ej.nombre}
                  <em className="chip chip-grupo" data-grupo={grupoConColor(ej.grupo)}>
                    {ej.grupo}
                  </em>
                  {ej.cambioLado && <em className="chip">cambio de lado</em>}
                </span>

                {preguntando ? (
                  <span className="confirmar">
                    <span className="apunte">
                      {rutinasQueLoUsan.length
                        ? `Lo usan ${rutinasQueLoUsan.join(", ")}. ¿Borrar igual?`
                        : "¿Borrar?"}
                    </span>
                    <button
                      className="boton chico peligro"
                      onClick={() => {
                        onBorrar(ej.id);
                        setConfirmando(null);
                      }}
                    >
                      Sí, borrar
                    </button>
                    <button className="boton chico" onClick={() => setConfirmando(null)}>
                      No
                    </button>
                  </span>
                ) : (
                  <span className="controles">
                    <button
                      className="icono"
                      onClick={() => setEdicion({ tipo: "editar", ejercicio: ej })}
                      title={`Editar ${ej.nombre}`}
                    >
                      ✎
                    </button>
                    <button
                      className="icono quitar"
                      onClick={() => setConfirmando(ej.id)}
                      title={`Borrar ${ej.nombre}`}
                    >
                      ✕
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        !edicion && (
          <p className="apunte">
            Cargá tus propios ejercicios y armá rutinas con ellos. Sólo hacen falta un nombre y una
            explicación de cómo se hace.
          </p>
        )
      )}
    </section>
  );
}
