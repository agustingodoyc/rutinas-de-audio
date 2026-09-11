/**
 * La fusión de dos bibliotecas: la local y la de la nube.
 *
 * Este archivo no importa nada. Es a propósito: la lógica que decide qué
 * versión de cada rutina gana es la parte más delicada de la sincronización y
 * la que más barato sale equivocarse en silencio. Separada del acceso a la red
 * se puede probar con node en dos milisegundos, sin navegador, sin base de
 * datos y sin simular Supabase. Cuando la lógica pura vive pegada a la
 * entrada/salida, testearla obliga a inventar mocks, y un test con mocks
 * termina probando los mocks.
 *
 * Ver `tests/fusion.test.mjs`.
 */

export type ConMarca = { id: string; actualizado?: number };

/**
 * Fusiona dos listas por id quedándose con la versión más nueva de cada una.
 *
 * Es la estrategia "gana el último que escribió" (*last write wins*). No es
 * perfecta: si editás la misma rutina en dos dispositivos sin conectarte, la
 * más vieja se pierde en silencio. Resolverlo de verdad exige guardar el
 * historial de cambios de cada campo —lo que hacen las bases distribuidas— y
 * para una biblioteca de rutinas personales el costo no se justifica. Lo que
 * sí importa es que el criterio sea explícito y predecible.
 *
 * Una versión sin fecha (`actualizado` vacío) se trata como la más vieja
 * posible: son las que se guardaron antes de que existiera la sincronización.
 *
 * @returns `fusionados`, la biblioteca resultante, y `aSubir`, las entradas
 * que ganaron del lado local y que la nube todavía no tiene.
 */
export function fusionar<T extends ConMarca>(
  locales: T[],
  remotos: T[]
): { fusionados: T[]; aSubir: T[] } {
  const porId = new Map<string, T>();
  const aSubir: T[] = [];

  for (const remoto of remotos) porId.set(remoto.id, remoto);

  for (const local of locales) {
    const remoto = porId.get(local.id);
    if (!remoto) {
      // Está sólo acá: la nube todavía no lo conoce.
      porId.set(local.id, local);
      aSubir.push(local);
      continue;
    }
    if ((local.actualizado ?? 0) > (remoto.actualizado ?? 0)) {
      porId.set(local.id, local);
      aSubir.push(local);
    }
  }

  return { fusionados: [...porId.values()], aSubir };
}
