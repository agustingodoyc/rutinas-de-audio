import { useMemo, useState } from "react";
import type { Ejercicio, Rutina } from "./tipos";
import { esEjercicioPropio, idEjercicioPropio, idRutinaPropia, resolver, slug } from "./datos/catalogo";
import { useBiblioteca } from "./datos/useBiblioteca";
import { useGenerador } from "./audio/useGenerador";
import { BarraSuperior } from "./componentes/BarraSuperior";
import { ListaRutinas } from "./componentes/ListaRutinas";
import { DetalleRutina } from "./componentes/DetalleRutina";
import { EditorRutina } from "./componentes/EditorRutina";
import { PanelVoz } from "./componentes/PanelVoz";
import { PanelGeneracion } from "./componentes/PanelGeneracion";
import { BarraDatos } from "./componentes/BarraDatos";
import { MisEjercicios } from "./componentes/MisEjercicios";
import { PanelEjemplo } from "./componentes/PanelEjemplo";
import { useEjemplos } from "./datos/useEjemplos";
import { useSesion } from "./datos/useSesion";
import { useComunidad } from "./datos/useComunidad";
import { primeraOracion, separarInstrucciones } from "./datos/texto";
import { esCompartidaConmigo, esDeLaComunidad } from "./datos/nube";
import { useCompartidas } from "./datos/useCompartidas";
import { Sugerencias } from "./componentes/Sugerencias";
import { PanelCompartir } from "./componentes/PanelCompartir";
import { Modal } from "./componentes/Modal";
import { PanelCompartirVarias } from "./componentes/PanelCompartirVarias";

type Modo = { tipo: "ver" } | { tipo: "editar" } | { tipo: "nueva" };

/**
 * Dos pantallas, no una.
 *
 * El catálogo es la portada: rutinas en tarjetas y nada más, porque elegir es
 * lo primero que hace cualquiera que entra. Todo el aparato —la voz, la
 * generación, el reproductor— aparece recién cuando ya hay una rutina
 * elegida, que es cuando significa algo. Antes de eso sólo era ruido
 * alrededor de una decisión que todavía no se tomó.
 */
export default function App() {
  const sesion = useSesion();
  // La biblioteca necesita saber quién entró: con sesión, además de guardar en
  // el navegador, sincroniza con Supabase.
  const bib = useBiblioteca(sesion.session?.user.id ?? null);
  const gen = useGenerador();
  const ejemplos = useEjemplos();
  const comunidad = useComunidad();
  /* Lo compartido conmigo se pide por mail: compartir es con alguien en
     particular, y sin sesión no hay a quién identificar. */
  const compartidas = useCompartidas(sesion.session?.user.email ?? null);

  const [seleccionada, setSeleccionada] = useState("");
  const [modo, setModo] = useState<Modo>({ tipo: "ver" });
  const [compartiendo, setCompartiendo] = useState(false);
  const [compartiendoVarias, setCompartiendoVarias] = useState(false);

  /* Un solo índice para resolver cualquier rutina: los ejercicios del catálogo,
     los propios y los que vienen con las rutinas publicadas. */
  const indice = useMemo(
    () => new Map<string, Ejercicio>([...bib.indice, ...comunidad.indice, ...compartidas.indice]),
    [bib.indice, comunidad.indice, compartidas.indice]
  );

  const todas = useMemo(
    () => [...bib.rutinas, ...comunidad.rutinas, ...compartidas.rutinas],
    [bib.rutinas, comunidad.rutinas, compartidas.rutinas]
  );

  const rutina: Rutina | undefined = useMemo(
    () => todas.find((r) => r.id === seleccionada),
    [todas, seleccionada]
  );

  const items = useMemo(() => (rutina ? resolver(rutina, indice) : []), [rutina, indice]);

  /* La frase con la que se prueba una velocidad sale del primer ejercicio de
     la rutina que está abierta, no de un texto de ejemplo: se escucha lo que
     se va a escuchar, con esas palabras y ese largo. */
  /* Los ejercicios tuyos que la rutina abierta usa: es el texto que compartir
     pondría a la vista de otra persona. */
  const propiosEnRutina = useMemo(
    () => [...new Set(items.filter((e) => esEjercicioPropio(e.id)).map((e) => e.nombre))],
    [items]
  );

  const textoMuestra = useMemo(() => {
    const primero = items[0];
    if (!primero) return "";
    return primeraOracion(separarInstrucciones(primero.instrucciones).comoSeHace);
  }, [items]);

  const elegir = (id: string) => {
    setSeleccionada(id);
    setModo({ tipo: "ver" });
    setCompartiendo(false);
    gen.limpiarResultado();
  };

  const volver = () => {
    setSeleccionada("");
    setModo({ tipo: "ver" });
    setCompartiendo(false);
    gen.limpiarResultado();
  };

  const guardarRutina = async (nueva: Rutina) => {
    await bib.guardarRutina(nueva);
    setSeleccionada(nueva.id);
    setModo({ tipo: "ver" });
    gen.limpiarResultado();
    // Publicar o despublicar cambia lo que ve el resto: hay que releerlo.
    if (nueva.publica) await comunidad.recargar();
  };

  /**
   * Trae una rutina ajena —del catálogo o de la comunidad— a la biblioteca
   * propia.
   *
   * Es una copia de verdad, no un enlace: se duplican también los ejercicios
   * que trae, con ids propios. Si el autor la borra o la cambia, la tuya sigue
   * igual — que es lo que espera cualquiera que aprieta "copiar".
   *
   * Los del catálogo son la excepción y se dejan como están: los tiene todo el
   * mundo, así que copiarlos sería guardar quince veces el mismo texto. Una
   * copia de una rutina del catálogo termina apuntando sólo a ids del
   * catálogo, y por eso publicarla no sube ni una línea de instrucciones: lo
   * único que viaja es la secuencia.
   */
  const copiarAMisRutinas = async (origen: Rutina) => {
    const equivalencias = new Map<string, string>();

    for (const item of origen.ejercicios) {
      // Los del catálogo ya los tiene todo el mundo: se dejan como están.
      if (!esDeLaComunidad(item.id)) continue;
      const ejercicio = indice.get(item.id);
      if (!ejercicio) continue;

      const idPropio = idEjercicioPropio(ejercicio.nombre);
      equivalencias.set(item.id, idPropio);
      await bib.guardarEjercicio({ ...ejercicio, id: idPropio, propio: true });
    }

    const copia: Rutina = {
      id: idRutinaPropia(origen.nombre),
      nombre: origen.nombre,
      descripcion: origen.descripcion,
      ejercicios: origen.ejercicios.map((item) => ({
        ...item,
        id: equivalencias.get(item.id) ?? item.id,
      })),
      propia: true,
      publica: false,
    };

    await bib.guardarRutina(copia);
    setSeleccionada(copia.id);
    gen.limpiarResultado();
  };

  const borrarRutina = (id: string) => {
    bib.borrarRutina(id);
    volver();
  };

  const editando = modo.tipo !== "ver";
  const enRutina = editando || Boolean(rutina);

  const avisos = (
    <>
      {gen.error && (
        <p className="error" role="alert">
          {gen.error}
        </p>
      )}
      {bib.error && <p className="error">{bib.error}</p>}
      {comunidad.error && <p className="error">{comunidad.error}</p>}
      {compartidas.error && <p className="error">{compartidas.error}</p>}
    </>
  );

  return (
    <>
      <BarraSuperior sesion={sesion} sincronizando={bib.sincronizando} />

      <div className="app">
        {enRutina ? (
          <main className="vista">
            <button className="volver" onClick={volver}>
              ← Catálogo
            </button>

            {avisos}

            {editando ? (
              <EditorRutina
                rutina={modo.tipo === "editar" && rutina ? rutina : null}
                indice={indice}
                onGuardar={guardarRutina}
                onBorrar={borrarRutina}
                onCancelar={() => (modo.tipo === "nueva" ? volver() : setModo({ tipo: "ver" }))}
                onGuardarEjercicio={bib.guardarEjercicio}
                puedePublicar={Boolean(sesion.session)}
              />
            ) : rutina ? (
              <div className="rutina">
                <div className="rutina-principal">
                  <DetalleRutina
                    rutina={rutina}
                    items={items}
                    enCurso={gen.progreso?.nombre}
                    onEditar={rutina.propia ? () => setModo({ tipo: "editar" }) : undefined}
                    /* Una rutina compartida no se copia: copiarla crearía una
                       versión que sobrevive al borrado del dueño, que es justo
                       lo contrario de lo que promete la función. */
                    onCopiar={
                      !rutina.propia && !esCompartidaConmigo(rutina.id)
                        ? () => void copiarAMisRutinas(rutina)
                        : undefined
                    }
                    /* Sólo tus rutinas se pueden compartir, y hace falta sesión
                       para que la base sepa de quién es el permiso. */
                    onCompartir={
                      rutina.propia && sesion.session
                        ? () => setCompartiendo((x) => !x)
                        : undefined
                    }
                    compartiendo={compartiendo}
                  />

                  {/* En un modal y no debajo del detalle: ahí abajo quedaba
                      después de toda la lista de ejercicios, fuera de la
                      pantalla, y el botón parecía no hacer nada. Lo que un
                      botón produce tiene que verse sin buscarlo. */}
                  {rutina.propia && sesion.session && (
                    <Modal
                      abierto={compartiendo}
                      titulo={`Compartir «${rutina.nombre}»`}
                      onCerrar={() => setCompartiendo(false)}
                    >
                      <PanelCompartir
                        usuarioId={sesion.session.user.id}
                        rutinaId={rutina.id}
                        propios={propiosEnRutina}
                      />
                    </Modal>
                  )}
                </div>

                <aside className="rutina-lateral">
                  {ejemplos.has(rutina.id) && !gen.resultado && (
                    <PanelEjemplo rutinaId={rutina.id} nombre={rutina.nombre} />
                  )}

                  <PanelVoz
                    fase={gen.fase}
                    vozCargada={gen.vozCargada}
                    descarga={gen.descarga}
                    mensaje={gen.mensaje}
                    onCargar={gen.cargarVoz}
                  />

                  <PanelGeneracion
                    fase={gen.fase}
                    mensaje={gen.mensaje}
                    progreso={gen.progreso}
                    resultado={gen.resultado}
                    puedeGenerar={items.length > 0}
                    tituloRutina={rutina.nombre}
                    techoVelocidad={gen.techoVelocidad}
                    muestra={gen.muestra}
                    probando={gen.probando}
                    hilos={gen.hilos}
                    onProbar={(velocidad) => gen.probar(textoMuestra, velocidad)}
                    onGenerar={(velocidad) =>
                      gen.generar(items, slug(rutina.nombre) || "rutina", velocidad)
                    }
                  />
                </aside>
              </div>
            ) : null}
          </main>
        ) : (
          <main className="vista">
            <section className="hero">
              <h1>Rutinas de audio</h1>
              <p className="bajada">
                Elegí una rutina o armá la tuya, y llevátela como un MP3 guiado por voz para
                entrenar sin mirar la pantalla. Se genera entero en tu navegador.
              </p>
            </section>

            {avisos}

            <ListaRutinas
              rutinas={bib.rutinas}
              comunidad={comunidad.rutinas}
              compartidas={compartidas.rutinas}
              indice={indice}
              onSeleccionar={elegir}
              onNueva={() => setModo({ tipo: "nueva" })}
              onCompartirVarias={
                sesion.session ? () => setCompartiendoVarias(true) : undefined
              }
            />

            {sesion.session && (
              <Modal
                abierto={compartiendoVarias}
                titulo="Compartir varias rutinas"
                onCerrar={() => setCompartiendoVarias(false)}
              >
                <PanelCompartirVarias
                  usuarioId={sesion.session.user.id}
                  rutinas={bib.rutinasPropias}
                  indice={indice}
                  onListo={() => void compartidas.recargar()}
                />
              </Modal>
            )}

            <div className="datos-abajo">
              <BarraDatos
                ejerciciosPropios={bib.ejerciciosPropios}
                rutinasPropias={bib.rutinasPropias}
                indice={indice}
                onImportar={bib.importarPaquete}
              />

              <MisEjercicios
                ejercicios={bib.ejerciciosPropios}
                rutinas={bib.rutinasPropias}
                onGuardar={bib.guardarEjercicio}
                onBorrar={bib.borrarEjercicio}
              />

              <Sugerencias />
            </div>
          </main>
        )}

        <footer className="pie">
          <p>
            La voz corre en tu dispositivo con{" "}
            <a href="https://github.com/rhasspy/piper" target="_blank" rel="noreferrer">
              Piper
            </a>
            . No hay servidor: ni las rutinas ni el audio salen de tu navegador.
          </p>
        </footer>
      </div>
    </>
  );
}
