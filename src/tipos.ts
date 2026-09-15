/** Un ejercicio, del catálogo o cargado por quien usa la página. */
export type Ejercicio = {
  id: string;
  nombre: string;
  grupo: string;
  /** Si es true, a la mitad exacta del tiempo se inserta el aviso de cambio de lado. */
  cambioLado?: boolean;
  instrucciones: string;
  /** true si lo cargó el usuario: vive en su navegador y se puede editar. */
  propio?: boolean;
  /** Momento de la última modificación, en milisegundos. Lo usa la sincronización. */
  actualizado?: number;
  /** Lápida: se borró. La fila sobrevive para que el borrado llegue a los demás dispositivos. */
  borrado?: boolean;
};

/** Una entrada de una rutina: qué ejercicio y por cuántos segundos. */
export type ItemRutina = {
  id: string;
  seg: number;
};

export type Rutina = {
  id: string;
  nombre: string;
  descripcion: string;
  ejercicios: ItemRutina[];
  /** true si la armó el usuario: vive en su navegador y se puede editar. */
  propia?: boolean;
  /** true si se publicó para que la vean los demás. */
  publica?: boolean;
  /** Nombre de quien la publicó. Sólo lo traen las rutinas de la comunidad. */
  autor?: string;
  /** Momento de la última modificación, en milisegundos. Lo usa la sincronización. */
  actualizado?: number;
  /** Lápida: se borró. */
  borrado?: boolean;
};

/** Lo que recibe el motor de audio: ya sin referencias al catálogo. */
export type EjercicioResuelto = {
  /** El motor lo ignora; la interfaz lo usa para buscar la foto. */
  id: string;
  nombre: string;
  /** Ídem: sólo para el color con el que se muestra el ejercicio. */
  grupo: string;
  seg: number;
  cambioLado: boolean;
  instrucciones: string;
};

export type VozId = "es_MX-claude-high" | "es_ES-carlfm-x_low";

export type Voz = {
  id: VozId;
  nombre: string;
  detalle: string;
  mb: number;
};

/**
 * Las voces disponibles. Son las que están en el repositorio de modelos
 * propio: la app dejó de bajarlas de un espejo ajeno porque ese espejo un día
 * cambió y rompió la aplicación entera (ver public/audio-worker.js).
 *
 * De las cuatro que se probaron quedaron dos, y no por capricho: cada una
 * ocupa decenas de megas en un repositorio, y ofrecer seis voces parecidas
 * sólo reparte el problema de elegir sin resolverlo. `es_MX-claude-high` es
 * la mejor de las medidas —acelera hasta 2,38×, contra 1,68× de la liviana, y
 * eso es lo que permite leer las instrucciones rápido sin que se corten—, y la
 * liviana existe para conexiones lentas y celulares viejos.
 */
export const VOCES: Voz[] = [
  {
    id: "es_MX-claude-high",
    nombre: "Claude",
    detalle: "Latinoamericano neutro · la mejor probada",
    mb: 60,
  },
  {
    id: "es_ES-carlfm-x_low",
    nombre: "Carl",
    detalle: "España · liviana, para bajar menos",
    mb: 27,
  },
];
