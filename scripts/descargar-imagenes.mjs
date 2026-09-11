/**
 * Baja una foto por ejercicio del catálogo desde free-exercise-db.
 *
 *     node scripts/descargar-imagenes.mjs [--forzar]
 *
 * Las fotos no se escriben a mano: las trae este script, que además deja
 * anotado de dónde salió cada una en `public/ejercicios/creditos.json`. La
 * app funciona igual sin ellas — cada foto que falte se reemplaza por una
 * tarjeta del color del grupo, así que se puede correr una sola vez, o
 * nunca.
 *
 * El catálogo está en español y free-exercise-db en inglés, así que abajo hay
 * una lista de nombres candidatos por ejercicio. Se prueban en orden: primero
 * el nombre exacto, después por coincidencia parcial. Lo que no encuentra lo
 * informa al final en vez de fallar: el catálogo tiene ejercicios de
 * movilidad que ese proyecto, que es sobre todo de gimnasio, puede no traer.
 *
 * free-exercise-db es de dominio público (Unlicense).
 * https://github.com/yuhonas/free-exercise-db
 */

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DESTINO = join(RAIZ, "public", "ejercicios");

const FUENTE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main";
const INDICE = `${FUENTE}/dist/exercises.json`;

/** id del catálogo → nombres a buscar, del más preciso al más general. */
const CANDIDATOS = {
  "circulos-hombros": ["Arm Circles", "Shoulder Circles", "Standing Arm Circles"],
  "rotacion-cadera": ["Hip Circles", "Standing Hip Circles", "Hip Circle"],
  "gato-vaca": ["Cat Stretch", "Cat Cow", "Cat-Cow"],
  "balanceo-piernas": ["Leg Swings", "Forward Leg Swings", "Lateral Leg Swings"],
  "rotacion-tobillos": ["Ankle Circles", "Ankle On The Knee", "Calf Stretch"],
  sentadilla: ["Bodyweight Squat", "Air Squats", "Squat"],
  "estocada-estatica": ["Bodyweight Lunge", "Static Lunge", "Lunge"],
  flexiones: ["Pushups", "Push-Ups", "Push-Up"],
  plancha: ["Plank", "Front Plank", "Forearm Plank"],
  "puente-gluteos": ["Butt Lift (Bridge)", "Glute Bridge", "Hip Bridge"],
  "elevacion-talones": ["Standing Calf Raises", "Calf Raises", "Standing Calf Raise"],
  isquiotibiales: [
    "Standing Hamstring Stretch",
    "Seated Hamstring Stretch",
    "Lying Hamstring Stretch",
  ],
  "postura-nino": ["Childs Pose", "Child's Pose", "Kneeling Forearm Stretch"],
  cuadriceps: ["Standing Quadriceps Stretch", "Quadriceps Stretch", "Quad Stretch"],
  "pectorales-pared": ["Standing Chest Stretch", "Chest Stretch", "Doorway Chest Stretch"],
};

const forzar = process.argv.includes("--forzar");

const normalizar = (texto) =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Exacto primero; recién si ninguno da, coincidencia parcial. */
function buscar(ejercicios, candidatos) {
  const porNombre = new Map(ejercicios.map((e) => [normalizar(e.name), e]));

  for (const candidato of candidatos) {
    const exacto = porNombre.get(normalizar(candidato));
    if (exacto) return { ejercicio: exacto, exacto: true };
  }

  for (const candidato of candidatos) {
    const buscado = normalizar(candidato);
    const parcial = ejercicios.find((e) => normalizar(e.name).includes(buscado));
    if (parcial) return { ejercicio: parcial, exacto: false };
  }

  return null;
}

const existe = (ruta) =>
  access(ruta).then(
    () => true,
    () => false
  );

async function main() {
  const catalogo = JSON.parse(await readFile(join(RAIZ, "src", "datos", "catalogo.json"), "utf8"));
  const ids = catalogo.ejercicios.map((e) => e.id);

  const sinMapear = ids.filter((id) => !CANDIDATOS[id]);
  if (sinMapear.length) {
    console.log(`Sin candidatos en este script: ${sinMapear.join(", ")}\n`);
  }

  console.log("Bajando el índice de free-exercise-db…");
  const respuesta = await fetch(INDICE);
  if (!respuesta.ok) throw new Error(`El índice respondió ${respuesta.status}`);
  const ejercicios = await respuesta.json();
  console.log(`${ejercicios.length} ejercicios en el índice.\n`);

  await mkdir(DESTINO, { recursive: true });

  const creditos = {};
  const faltan = [];

  for (const id of ids) {
    const candidatos = CANDIDATOS[id];
    if (!candidatos) {
      faltan.push(`${id} (sin candidatos)`);
      continue;
    }

    const archivo = join(DESTINO, `${id}.jpg`);
    if (!forzar && (await existe(archivo))) {
      console.log(`· ${id}: ya está`);
      continue;
    }

    const hallazgo = buscar(ejercicios, candidatos);
    if (!hallazgo) {
      faltan.push(`${id} (ninguno de: ${candidatos.join(", ")})`);
      continue;
    }

    const { ejercicio, exacto } = hallazgo;
    const imagen = ejercicio.images?.[0];
    if (!imagen) {
      faltan.push(`${id} (${ejercicio.name} no tiene imagen)`);
      continue;
    }

    const url = `${FUENTE}/exercises/${imagen}`;
    const foto = await fetch(url);
    if (!foto.ok) {
      faltan.push(`${id} (la foto respondió ${foto.status})`);
      continue;
    }

    await writeFile(archivo, Buffer.from(await foto.arrayBuffer()));
    creditos[id] = { nombre: ejercicio.name, id: ejercicio.id, url };
    console.log(`✓ ${id} ← ${ejercicio.name}${exacto ? "" : " (parcial, revisá que pegue)"}`);
  }

  // Los créditos se acumulan: una corrida que sólo baja lo que falta no tiene
  // por qué borrar la procedencia de lo que ya estaba.
  const rutaCreditos = join(DESTINO, "creditos.json");
  const previos = (await existe(rutaCreditos))
    ? JSON.parse(await readFile(rutaCreditos, "utf8")).ejercicios ?? {}
    : {};

  await writeFile(
    rutaCreditos,
    JSON.stringify(
      {
        fuente: "free-exercise-db",
        licencia: "Unlicense (dominio público)",
        repositorio: "https://github.com/yuhonas/free-exercise-db",
        ejercicios: { ...previos, ...creditos },
      },
      null,
      2
    ) + "\n"
  );

  console.log(`\nListo. Fotos en public/ejercicios/`);
  if (faltan.length) {
    console.log(`\nSin foto (${faltan.length}), la app les pone una tarjeta de color:`);
    for (const linea of faltan) console.log(`  - ${linea}`);
    console.log(
      "\nPara resolverlos: buscá el ejercicio en https://yuhonas.github.io/free-exercise-db/" +
        "\ny agregá su nombre a CANDIDATOS, o dejá una foto propia en public/ejercicios/<id>.jpg"
    );
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
