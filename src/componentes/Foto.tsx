import { useEffect, useState } from "react";
import { urlFoto } from "../datos/fotos";

type Props = {
  idEjercicio: string;
  /** Grupo ya normalizado: define el color de la tarjeta de reemplazo. */
  grupo: string;
  /** `mini` en las filas, `tarjeta` en el catálogo, `portada` en la cabecera. */
  variante?: "mini" | "tarjeta" | "portada";
};

/**
 * La foto de un ejercicio, con una tarjeta de color como reemplazo.
 *
 * El reemplazo no es un detalle: las fotos son un archivo aparte que puede no
 * estar (nadie las bajó todavía, o el ejercicio lo cargó quien usa la app).
 * En vez de preguntar antes si existe, se intenta mostrarla y se cambia al
 * color si el navegador avisa que falló. Un `onError` alcanza y evita un
 * pedido de más por cada ejercicio de la lista.
 */
export function Foto({ idEjercicio, grupo, variante = "mini" }: Props) {
  const url = urlFoto(idEjercicio);
  const [falla, setFalla] = useState(false);

  // Al cambiar de ejercicio hay que volver a intentar: el error era del anterior.
  useEffect(() => setFalla(false), [idEjercicio]);

  const clase = `foto foto-${variante}`;

  if (!url || falla) {
    return <div className={`${clase} foto-vacia`} data-grupo={grupo} aria-hidden="true" />;
  }

  return (
    <img
      className={clase}
      data-grupo={grupo}
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFalla(true)}
    />
  );
}
