import { useState } from "react";
import type { Ejercicio } from "../tipos";
import { idEjercicioPropio } from "../datos/catalogo";
import { componerInstrucciones, separarInstrucciones } from "../datos/texto";

type Props = {
  /** El ejercicio a editar, o null para uno nuevo. */
  ejercicio?: Ejercicio | null;
  yaExiste: (nombre: string) => boolean;
  onGuardar: (ejercicio: Ejercicio) => void;
  onCancelar: () => void;
  /** Texto del botón: cambia si además se agrega a una rutina. */
  textoGuardar?: string;
};

/* Los grupos que tienen color propio. Se puede escribir otro, pero estos tres
   cubren el catálogo y evitan que cada persona invente el suyo. */
const GRUPOS = ["Movilidad", "Fuerza", "Elongación", "Mis ejercicios"];

export function FormularioEjercicio({
  ejercicio = null,
  yaExiste,
  onGuardar,
  onCancelar,
  textoGuardar = "Guardar ejercicio",
}: Props) {
  const inicial = ejercicio
    ? separarInstrucciones(ejercicio.instrucciones)
    : { comoSeHace: "", consejo: "" };

  const [nombre, setNombre] = useState(ejercicio?.nombre ?? "");
  const [grupo, setGrupo] = useState(ejercicio?.grupo ?? "Mis ejercicios");
  const [comoSeHace, setComoSeHace] = useState(inicial.comoSeHace);
  const [consejo, setConsejo] = useState(inicial.consejo);
  const [cambioLado, setCambioLado] = useState(ejercicio?.cambioLado ?? false);
  const [aviso, setAviso] = useState<string | null>(null);

  const opciones = GRUPOS.includes(grupo) ? GRUPOS : [...GRUPOS, grupo];

  const guardar = () => {
    const n = nombre.trim();
    const hacer = comoSeHace.trim();

    if (!n) return setAviso("Falta el nombre del ejercicio.");
    if (!hacer) return setAviso("Falta explicar cómo se hace: es lo que la voz va a leer.");

    // Al editar se conserva el id: cambiarlo dejaría huérfanas a las rutinas
    // que ya usan este ejercicio.
    const cambioDeNombre = !ejercicio || ejercicio.nombre !== n;
    if (cambioDeNombre && yaExiste(n)) return setAviso("Ya tenés un ejercicio con ese nombre.");

    onGuardar({
      ...(ejercicio ?? {}),
      id: ejercicio?.id ?? idEjercicioPropio(n),
      nombre: n,
      grupo: grupo.trim() || "Mis ejercicios",
      cambioLado,
      instrucciones: componerInstrucciones(hacer, consejo),
      propio: true,
    });
  };

  return (
    <div className="formulario">
      <h3>{ejercicio ? "Editar ejercicio" : "Ejercicio nuevo"}</h3>

      <div className="formulario-fila">
        <label className="campo crece">
          <span>Nombre</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Remo con banda elástica"
            autoFocus
          />
        </label>

        <label className="campo">
          <span>Grupo</span>
          <select value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            {opciones.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="campo">
        <span>¿Cómo se hace?</span>
        <textarea
          value={comoSeHace}
          onChange={(e) => setComoSeHace(e.target.value)}
          placeholder="Parate con los pies al ancho de las caderas y llevá los codos hacia atrás, despacio."
          rows={3}
        />
      </label>

      <label className="campo">
        <span>Un consejo (opcional)</span>
        <textarea
          value={consejo}
          onChange={(e) => setConsejo(e.target.value)}
          placeholder="Mantené los hombros bajos y respirá parejo."
          rows={2}
        />
      </label>

      <p className="apunte">
        La voz lee estos dos textos mientras dura el ejercicio, así que escribilos como se los
        dirías a alguien que no está mirando la pantalla.
      </p>

      <label className="casilla">
        <input
          type="checkbox"
          checked={cambioLado}
          onChange={(e) => setCambioLado(e.target.checked)}
        />
        <span>Se hace por lado: avisar el cambio a la mitad del tiempo</span>
      </label>

      {aviso && (
        <p className="error" role="alert">
          {aviso}
        </p>
      )}

      <div className="formulario-pie">
        <button className="boton primario" onClick={guardar}>
          {textoGuardar}
        </button>
        <button className="boton" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
