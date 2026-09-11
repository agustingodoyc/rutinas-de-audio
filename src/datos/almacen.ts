/**
 * Persistencia local en IndexedDB.
 *
 * Todo lo que carga el usuario vive acá, en su navegador, y no sale nunca.
 * Es una envoltura mínima a propósito: la app guarda dos listas chicas, no
 * justifica sumar una dependencia.
 */

const BASE = "rutinas-de-audio";
const VERSION = 1;

export const TIENDA_EJERCICIOS = "ejercicios";
export const TIENDA_RUTINAS = "rutinas";

let conexion: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (conexion) return conexion;

  conexion = new Promise((resolver, rechazar) => {
    const pedido = indexedDB.open(BASE, VERSION);

    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      for (const tienda of [TIENDA_EJERCICIOS, TIENDA_RUTINAS]) {
        if (!db.objectStoreNames.contains(tienda)) {
          db.createObjectStore(tienda, { keyPath: "id" });
        }
      }
    };

    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () =>
      rechazar(pedido.error ?? new Error("No se pudo abrir la base local."));
  });

  return conexion;
}

function transaccion(db: IDBDatabase, tienda: string, modo: IDBTransactionMode) {
  return db.transaction(tienda, modo).objectStore(tienda);
}

function esperar<T>(pedido: IDBRequest<T>): Promise<T> {
  return new Promise((resolver, rechazar) => {
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rechazar(pedido.error ?? new Error("Falló la operación local."));
  });
}

export async function leerTodo<T>(tienda: string): Promise<T[]> {
  const db = await abrir();
  return esperar(transaccion(db, tienda, "readonly").getAll() as IDBRequest<T[]>);
}

export async function guardar<T>(tienda: string, valor: T): Promise<void> {
  const db = await abrir();
  await esperar(transaccion(db, tienda, "readwrite").put(valor));
}

/** Una sola transacción para todos: si algo falla, no queda a medias. */
export async function guardarVarios<T>(tienda: string, valores: T[]): Promise<void> {
  if (!valores.length) return;
  const db = await abrir();
  const tx = db.transaction(tienda, "readwrite");
  const almacen = tx.objectStore(tienda);
  for (const valor of valores) almacen.put(valor);

  await new Promise<void>((resolver, rechazar) => {
    tx.oncomplete = () => resolver();
    tx.onerror = () => rechazar(tx.error ?? new Error("Falló el guardado."));
  });
}

export async function borrar(tienda: string, id: string): Promise<void> {
  const db = await abrir();
  await esperar(transaccion(db, tienda, "readwrite").delete(id));
}
