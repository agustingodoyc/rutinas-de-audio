import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  abierto: boolean;
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
};

/**
 * Una ventana por encima de la página, sobre el elemento `<dialog>` del
 * navegador y no sobre un `<div>` con posición fija.
 *
 * La diferencia no es estética. `showModal()` trae gratis cosas que a mano se
 * hacen mal casi siempre:
 *
 * - El foco del teclado queda atrapado adentro. Sin eso, tabular se va a los
 *   botones de atrás, que están tapados y no se pueden ver.
 * - Escape cierra.
 * - Lo de atrás queda inerte: no se puede clickear ni leer con un lector de
 *   pantalla, que es lo que significa «modal» de verdad.
 * - El fondo oscuro es `::backdrop`, un pseudo-elemento del navegador, así que
 *   no hace falta un div extra.
 *
 * Todo eso son unas cien líneas de JavaScript propenso a fallar, o un atributo.
 */
export function Modal({ abierto, titulo, onCerrar, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    /* Abrir uno ya abierto, o cerrar uno cerrado, tira excepción. */
    if (abierto && !dialogo.open) dialogo.showModal();
    if (!abierto && dialogo.open) dialogo.close();
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      className="modal"
      /* Escape cierra por su cuenta, sin avisarle a React. Escuchar `close`
         mantiene el estado de afuera de acuerdo con lo que se ve. */
      onClose={onCerrar}
      /* Un clic en el fondo tiene como target al propio <dialog>: lo que está
         adentro es el div, que detiene el clic ahí. */
      onClick={(e) => {
        if (e.target === ref.current) onCerrar();
      }}
    >
      <div className="modal-caja">
        <header className="modal-cabeza">
          <h2>{titulo}</h2>
          <button className="icono" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </header>
        <div className="modal-cuerpo">{children}</div>
      </div>
    </dialog>
  );
}
