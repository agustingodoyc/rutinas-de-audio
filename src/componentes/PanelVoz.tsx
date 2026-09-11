import { useState } from "react";
import { VOCES, type VozId } from "../tipos";
import type { Descarga, Fase } from "../audio/useGenerador";

type Props = {
  fase: Fase;
  vozCargada: VozId | null;
  descarga: Descarga | null;
  mensaje: string;
  onCargar: (voz: VozId) => void;
};

const mb = (bytes: number) => (bytes / 1048576).toFixed(0);

export function PanelVoz({ fase, vozCargada, descarga, mensaje, onCargar }: Props) {
  const [elegida, setElegida] = useState<VozId>("es_MX-claude-high");
  const voz = VOCES.find((v) => v.id === elegida)!;
  const ocupado = fase === "cargando" || fase === "generando";
  const yaEsta = vozCargada === elegida;

  const porcentaje =
    descarga && descarga.total ? Math.round((descarga.cargado / descarga.total) * 100) : null;

  return (
    <section className="panel voz">
      <div className="voz-fila">
        <label className="campo">
          <span>Voz</span>
          <select
            value={elegida}
            onChange={(e) => setElegida(e.target.value as VozId)}
            disabled={ocupado}
          >
            {VOCES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombre} — {v.detalle}
              </option>
            ))}
          </select>
        </label>

        <button className="boton" onClick={() => onCargar(elegida)} disabled={ocupado || yaEsta}>
          {yaEsta ? "Voz lista" : `Cargar voz (${voz.mb} MB)`}
        </button>
      </div>

      {fase === "cargando" && (
        <div className="carga">
          <p className="apunte">
            {mensaje}
            {porcentaje !== null && descarga && (
              <span className="cifra">
                {" "}
                {mb(descarga.cargado)} de {mb(descarga.total)} MB
              </span>
            )}
          </p>
          <div className="barra">
            <i style={{ width: `${porcentaje ?? 8}%` }} />
          </div>
        </div>
      )}

      {fase !== "cargando" && !vozCargada && (
        <p className="apunte">
          La voz se baja una sola vez y queda guardada en tu navegador. No se sube nada: el audio se
          genera en tu dispositivo.
        </p>
      )}
    </section>
  );
}
