import type { Ejercicio, Rutina } from "../tipos";
import { duracionEstimada, mmss, resolver } from "../datos/catalogo";
import { grupoDominante } from "../datos/fotos";
import { Foto } from "./Foto";

type Props = {
  rutinas: Rutina[];
  /** Las que publicó el resto de la gente. */
  comunidad: Rutina[];
  /** Las que alguien compartió con vos en particular. */
  compartidas: Rutina[];
  indice: Map<string, Ejercicio>;
  onSeleccionar: (id: string) => void;
  onNueva: () => void;
  /** Sólo con sesión iniciada: compartir varias rutinas de una vez. */
  onCompartirVarias?: () => void;
};

/**
 * El catálogo, en tarjetas.
 *
 * Es la portada de la app, así que cada rutina entra por la foto y no por el
 * texto: una grilla que se recorre de un vistazo, con la duración al lado del
 * nombre porque es lo que decide cuál elegís un martes a la mañana.
 */
export function ListaRutinas({
  rutinas,
  comunidad,
  compartidas,
  indice,
  onSeleccionar,
  onNueva,
  onCompartirVarias,
}: Props) {
  const catalogo = rutinas.filter((r) => !r.propia);
  const propias = rutinas.filter((r) => r.propia);

  const tarjeta = (r: Rutina) => {
    const items = resolver(r, indice);
    const grupo = grupoDominante(items.map((e) => e.grupo));
    const primero = items[0];

    return (
      <li key={r.id}>
        <button className="tarjeta" data-grupo={grupo} onClick={() => onSeleccionar(r.id)}>
          <Foto idEjercicio={primero?.id ?? ""} grupo={grupo} variante="tarjeta" />
          <span className="tarjeta-texto">
            <span className="tarjeta-nombre">{r.nombre}</span>
            <span className="tarjeta-meta">
              {items.length} {items.length === 1 ? "ejercicio" : "ejercicios"} ·{" "}
              {mmss(duracionEstimada(items))}
            </span>
            {r.autor && <span className="tarjeta-autor">por {r.autor}</span>}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="galerias">
      <section className="galeria" aria-labelledby="titulo-catalogo">
        <div className="galeria-cabeza">
          <h2 id="titulo-catalogo">Catálogo</h2>
          <p className="apunte">Listas para escuchar. Copiala si querés cambiarle algo.</p>
        </div>
        <ul className="grilla">{catalogo.map(tarjeta)}</ul>
      </section>

      <section className="galeria" aria-labelledby="titulo-mias">
        <div className="galeria-cabeza">
          <h2 id="titulo-mias">Mis rutinas</h2>
          <div className="galeria-acciones">
            {onCompartirVarias && propias.length > 0 && (
              <button className="boton chico" onClick={onCompartirVarias}>
                Compartir varias
              </button>
            )}
            <button className="boton chico" onClick={onNueva}>
              + Nueva rutina
            </button>
          </div>
        </div>

        {propias.length ? (
          <ul className="grilla">{propias.map(tarjeta)}</ul>
        ) : (
          <p className="apunte galeria-vacia">
            Todavía no armaste ninguna. Podés crear una desde cero o importar tus JSON de siempre.
          </p>
        )}
      </section>

      {compartidas.length > 0 && (
        <section className="galeria" aria-labelledby="titulo-compartidas">
          <div className="galeria-cabeza">
            <h2 id="titulo-compartidas">Compartidas conmigo</h2>
            <p className="apunte">
              De sólo lectura. Si quien la compartió la borra, desaparece de acá.
            </p>
          </div>
          <ul className="grilla">{compartidas.map(tarjeta)}</ul>
        </section>
      )}

      {comunidad.length > 0 && (
        <section className="galeria" aria-labelledby="titulo-comunidad">
          <div className="galeria-cabeza">
            <h2 id="titulo-comunidad">De la comunidad</h2>
            <p className="apunte">Rutinas que publicó otra gente. Podés copiarlas a la tuya.</p>
          </div>
          <ul className="grilla">{comunidad.map(tarjeta)}</ul>
        </section>
      )}
    </div>
  );
}
