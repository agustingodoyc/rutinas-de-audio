import { useEffect, useMemo, useState } from "react";
import type { Ejercicio, ItemRutina, Rutina } from "../tipos";
import {
  duracionEstimada,
  esEjercicioPropio,
  idEjercicioPropio,
  idRutinaPropia,
  mmss,
  resolver,
} from "../datos/catalogo";
import { FormularioEjercicio } from "./FormularioEjercicio";

type Props = {
  rutina: Rutina | null; // null = rutina nueva
  indice: Map<string, Ejercicio>;
  onGuardar: (rutina: Rutina) => void;
  onBorrar: (id: string) => void;
  onCancelar: () => void;
  onGuardarEjercicio: (ejercicio: Ejercicio) => void;
  /** false sin sesión: una rutina pública necesita un dueño en la base. */
  puedePublicar: boolean;
};

const SEGUNDOS_POR_DEFECTO = 30;

export function EditorRutina({
  rutina,
  indice,
  onGuardar,
  onBorrar,
  onCancelar,
  onGuardarEjercicio,
  puedePublicar,
}: Props) {
  const [nombre, setNombre] = useState(rutina?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(rutina?.descripcion ?? "");
  const [items, setItems] = useState<ItemRutina[]>(rutina?.ejercicios ?? []);
  const [publica, setPublica] = useState(rutina?.publica ?? false);
  const [aAgregar, setAAgregar] = useState("");
  const [creandoEjercicio, setCreandoEjercicio] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [confirmandoPublicacion, setConfirmandoPublicacion] = useState(false);

  /** Agrupados para que el selector no sea una lista plana de cincuenta. */
  const grupos = useMemo(() => {
    const porGrupo = new Map<string, Ejercicio[]>();
    for (const ej of indice.values()) {
      const lista = porGrupo.get(ej.grupo) ?? [];
      lista.push(ej);
      porGrupo.set(ej.grupo, lista);
    }
    for (const lista of porGrupo.values()) {
      lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    }
    return [...porGrupo.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [indice]);

  const resueltos = useMemo(
    () => resolver({ id: "", nombre, descripcion, ejercicios: items }, indice),
    [items, indice, nombre, descripcion]
  );

  /**
   * Los ejercicios tuyos que esta rutina usa.
   *
   * Publicar una rutina publica también el texto de estos: una rutina pública
   * se tiene que poder escuchar, y sin las instrucciones no hay audio. La
   * política de RLS `ejercicios de rutinas públicas` hace exactamente eso.
   *
   * Los del catálogo no entran en la cuenta: viajan dentro de la app, los
   * tiene todo el mundo y no están en la base. Una rutina armada sólo con
   * ellos publica la secuencia y nada más.
   *
   * Que esto se vea ANTES de guardar no es un adorno. Quien importó su
   * biblioteca de otra aplicación puede tener textos que no le pertenecen, y
   * un tilde llamado "Publicarla para la comunidad" no alcanza para que se dé
   * cuenta de que también está publicando el texto.
   */
  const propiosAPublicar = useMemo(() => {
    const vistos = new Set<string>();
    return resueltos.filter((e) => {
      if (!esEjercicioPropio(e.id) || vistos.has(e.id)) return false;
      vistos.add(e.id);
      return true;
    });
  }, [resueltos]);

  // Cambiar la rutina invalida una confirmación anterior: lo que se confirmó
  // era esta lista, no otra.
  useEffect(() => setConfirmandoPublicacion(false), [items, publica]);

  const mover = (desde: number, hacia: number) => {
    if (hacia < 0 || hacia >= items.length) return;
    const copia = items.slice();
    const [sacado] = copia.splice(desde, 1);
    copia.splice(hacia, 0, sacado);
    setItems(copia);
  };

  const agregar = () => {
    if (!aAgregar) return;
    setItems([...items, { id: aAgregar, seg: SEGUNDOS_POR_DEFECTO }]);
    setAAgregar("");
  };

  const guardarNuevoEjercicio = (ejercicio: Ejercicio) => {
    onGuardarEjercicio(ejercicio);
    setItems((prev) => [...prev, { id: ejercicio.id, seg: SEGUNDOS_POR_DEFECTO }]);
    setCreandoEjercicio(false);
  };

  const guardar = () => {
    const limpio = nombre.trim();
    if (!limpio) return setAviso("Ponele un nombre a la rutina.");
    if (!items.length) return setAviso("Agregá al menos un ejercicio.");

    if (publica && puedePublicar && propiosAPublicar.length && !confirmandoPublicacion) {
      setConfirmandoPublicacion(true);
      const cuantos =
        propiosAPublicar.length === 1
          ? "el texto de 1 ejercicio tuyo"
          : `el texto de ${propiosAPublicar.length} ejercicios tuyos`;
      return setAviso(
        `Ojo: al publicarla también queda visible ${cuantos}. Revisá la lista de arriba y, si está bien, apretá Guardar de nuevo.`
      );
    }

    onGuardar({
      // Al editar se conserva el id para que renombrar no cree una copia.
      id: rutina?.id ?? idRutinaPropia(limpio),
      nombre: limpio,
      descripcion: descripcion.trim(),
      ejercicios: items,
      propia: true,
      publica: puedePublicar ? publica : false,
    });
  };

  return (
    <section className="detalle editor">
      <header className="detalle-cabeza">
        <h2>{rutina ? "Editar rutina" : "Nueva rutina"}</h2>

        <label className="campo">
          <span>Nombre</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Tren inferior 1"
            autoFocus
          />
        </label>

        <label className="campo">
          <span>Descripción</span>
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Opcional"
          />
        </label>

        <label className="casilla">
          <input
            type="checkbox"
            checked={publica && puedePublicar}
            disabled={!puedePublicar}
            onChange={(e) => setPublica(e.target.checked)}
          />
          <span>
            Publicarla para la comunidad
            {!puedePublicar && " — hace falta iniciar sesión"}
          </span>
        </label>

        {publica && puedePublicar && propiosAPublicar.length > 0 && (
          <div className="aviso-publicar" role="status">
            <p>
              <strong>Se publica también tu texto.</strong> Una rutina pública se tiene que poder
              escuchar, así que las instrucciones de estos ejercicios tuyos quedan a la vista de
              cualquiera:
            </p>
            <ul>
              {propiosAPublicar.map((e) => (
                <li key={e.id}>{e.nombre}</li>
              ))}
            </ul>
            <p className="apunte">
              Los del catálogo no están en esta lista: vienen con la app y no se suben a ningún
              lado. Una rutina hecha sólo con ellos publica la secuencia y nada más.
            </p>
          </div>
        )}

        {items.length > 0 && (
          <p className="duracion">
            <strong>{mmss(duracionEstimada(resueltos))}</strong> <span>de audio</span>
          </p>
        )}
      </header>

      <ol className="ejercicios editables">
        {items.map((item, i) => {
          const ej = indice.get(item.id);
          return (
            <li key={`${item.id}-${i}`}>
              <span className="orden">{i + 1}</span>

              <span className="nombre">
                {ej?.nombre ?? <em className="faltante">(ejercicio borrado)</em>}
                {ej?.cambioLado && <em className="chip">cambio de lado</em>}
              </span>

              <span className="controles">
                <label className="segundos-campo">
                  <input
                    type="number"
                    min={5}
                    max={600}
                    step={5}
                    value={item.seg}
                    onChange={(e) => {
                      const seg = Math.max(5, Math.min(600, Number(e.target.value) || 5));
                      setItems(items.map((x, j) => (j === i ? { ...x, seg } : x)));
                    }}
                    aria-label={`Segundos de ${ej?.nombre ?? "el ejercicio"}`}
                  />
                  <span aria-hidden="true">s</span>
                </label>

                <button className="icono" onClick={() => mover(i, i - 1)} disabled={i === 0} title="Subir">
                  ↑
                </button>
                <button
                  className="icono"
                  onClick={() => mover(i, i + 1)}
                  disabled={i === items.length - 1}
                  title="Bajar"
                >
                  ↓
                </button>
                <button
                  className="icono quitar"
                  onClick={() => setItems(items.filter((_, j) => j !== i))}
                  title="Quitar de la rutina"
                >
                  ✕
                </button>
              </span>
            </li>
          );
        })}

        {!items.length && (
          <li className="vacio">
            <p className="apunte">Todavía no agregaste ejercicios.</p>
          </li>
        )}
      </ol>

      <div className="agregar">
        <select
          value={aAgregar}
          onChange={(e) => setAAgregar(e.target.value)}
          aria-label="Ejercicio a agregar"
        >
          <option value="">Elegí un ejercicio…</option>
          {grupos.map(([grupo, lista]) => (
            <optgroup key={grupo} label={grupo}>
              {lista.map((ej) => (
                <option key={ej.id} value={ej.id}>
                  {ej.nombre}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <button className="boton" onClick={agregar} disabled={!aAgregar}>
          Agregar
        </button>
        <button className="boton" onClick={() => setCreandoEjercicio(true)}>
          Ejercicio nuevo
        </button>
      </div>

      {creandoEjercicio && (
        <FormularioEjercicio
          yaExiste={(nombreEj) => indice.has(idEjercicioPropio(nombreEj))}
          onGuardar={guardarNuevoEjercicio}
          onCancelar={() => setCreandoEjercicio(false)}
          textoGuardar="Agregar a la rutina"
        />
      )}

      {aviso && (
        <p className="error" role="alert">
          {aviso}
        </p>
      )}

      <div className="editor-pie">
        <button className="boton primario" onClick={guardar}>
          Guardar rutina
        </button>
        <button className="boton" onClick={onCancelar}>
          Cancelar
        </button>
        {rutina &&
          (confirmandoBorrado ? (
            <span className="confirmar">
              <span className="apunte">¿Eliminar «{rutina.nombre}»?</span>
              <button className="boton chico peligro" onClick={() => onBorrar(rutina.id)}>
                Sí, eliminar
              </button>
              <button className="boton chico" onClick={() => setConfirmandoBorrado(false)}>
                No
              </button>
            </span>
          ) : (
            <button className="boton peligro" onClick={() => setConfirmandoBorrado(true)}>
              Eliminar
            </button>
          ))}
      </div>
    </section>
  );
}
