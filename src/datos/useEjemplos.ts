import { useEffect, useState } from "react";

/**
 * Audios de muestra ya generados, que viven en `public/ejemplos/`.
 *
 * Existen por un motivo concreto: la primera generación real exige bajar unos
 * 78 MB entre el modelo de voz y el pronunciador. Alguien que entra sólo a ver
 * de qué se trata no va a esperar eso, y con razón. Con un ejemplo pregenerado
 * escucha cómo suena en dos segundos y después decide.
 *
 * `indice.json` dice cuáles hay. Si está vacío o no está, la función
 * simplemente no aparece.
 */
export function useEjemplos(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let vigente = true;

    fetch(`${import.meta.env.BASE_URL}ejemplos/indice.json`)
      .then((res) => (res.ok ? res.json() : []))
      .then((lista: unknown) => {
        if (!vigente || !Array.isArray(lista)) return;
        setIds(new Set(lista.filter((x): x is string => typeof x === "string")));
      })
      .catch(() => {});

    return () => {
      vigente = false;
    };
  }, []);

  return ids;
}

export const urlEjemplo = (id: string) => `${import.meta.env.BASE_URL}ejemplos/${id}.mp3`;
