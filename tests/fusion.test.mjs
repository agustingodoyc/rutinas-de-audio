/**
 * Tests de la fusión de bibliotecas.
 *
 *     npm test
 *
 * Prueban la parte de la sincronización que decide qué versión de cada rutina
 * sobrevive. Es lógica pura —entra la lista local y la remota, sale el
 * resultado— así que no hace falta ni navegador ni Supabase: corre en node en
 * milisegundos.
 *
 * Necesita node 22.18 o más nuevo, que lee TypeScript sin compilar.
 */

let fusionar;
try {
  ({ fusionar } = await import("../src/datos/fusion.ts"));
} catch (error) {
  console.error(
    `No pude importar fusion.ts. Estos tests necesitan node 22.18+ (tenés ${process.version}), ` +
      `que lee TypeScript sin compilar.\n${error.message}`
  );
  process.exit(1);
}

let fallos = 0;

function check(nombre, condicion, detalle = "") {
  if (condicion) {
    console.log(`  ✓ ${nombre}`);
  } else {
    fallos++;
    console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
}

const rutina = (id, actualizado, nombre = id) => ({ id, actualizado, nombre });
const porId = (lista) => Object.fromEntries(lista.map((x) => [x.id, x.nombre]));

console.log("\nFusión de bibliotecas");

{
  // Lo que existe de un solo lado sobrevive, venga de donde venga.
  const { fusionados, aSubir } = fusionar([rutina("mia:pecho", 100)], [rutina("mia:piernas", 100)]);
  check("junta lo que está de un solo lado", fusionados.length === 2);
  check(
    "sube lo que la nube no tiene",
    aSubir.length === 1 && aSubir[0].id === "mia:pecho",
    aSubir.map((x) => x.id).join(",")
  );
}

{
  // El caso central: la misma rutina editada de los dos lados.
  const { fusionados, aSubir } = fusionar(
    [rutina("mia:pecho", 200, "version local")],
    [rutina("mia:pecho", 100, "version remota")]
  );
  check("gana la local cuando es más nueva", porId(fusionados)["mia:pecho"] === "version local");
  check("y queda pendiente de subir", aSubir.length === 1);
}

{
  const { fusionados, aSubir } = fusionar(
    [rutina("mia:pecho", 100, "version local")],
    [rutina("mia:pecho", 200, "version remota")]
  );
  check("gana la remota cuando es más nueva", porId(fusionados)["mia:pecho"] === "version remota");
  check("y no se sube nada", aSubir.length === 0);
}

{
  // Empate: no se sube nada. Subir por las dudas duplicaría escrituras en cada
  // arranque de la app, que es el bug silencioso más caro de este código.
  const { fusionados, aSubir } = fusionar(
    [rutina("mia:pecho", 100, "local")],
    [rutina("mia:pecho", 100, "remota")]
  );
  check("con la misma fecha se queda con la remota", porId(fusionados)["mia:pecho"] === "remota");
  check("y no genera escrituras", aSubir.length === 0);
}

{
  // Las guardadas antes de que existiera la sincronización no tienen fecha.
  const { fusionados, aSubir } = fusionar(
    [rutina("mia:pecho", undefined, "sin fecha")],
    [rutina("mia:pecho", 50, "con fecha")]
  );
  check("una sin fecha pierde contra una con fecha", porId(fusionados)["mia:pecho"] === "con fecha");
  check("y no se sube", aSubir.length === 0);
}

{
  // Una lápida es una versión más: gana si es la más nueva.
  const borrada = { id: "mia:pecho", actualizado: 300, borrado: true };
  const { fusionados } = fusionar([borrada], [rutina("mia:pecho", 200)]);
  check("un borrado más nuevo se impone", fusionados[0].borrado === true);

  const alReves = fusionar([rutina("mia:pecho", 400, "revivida")], [borrada]);
  check(
    "y una edición posterior lo revierte",
    alReves.fusionados[0].borrado !== true && alReves.aSubir.length === 1
  );
}

{
  const vacio = fusionar([], []);
  check("dos bibliotecas vacías no rompen nada", vacio.fusionados.length === 0);
}

console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo verde");
process.exit(fallos ? 1 : 0);
