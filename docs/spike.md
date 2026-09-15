# Fase 0: el spike

Antes de escribir una sola línea de React, el proyecto empezó por una pregunta
que podía matarlo entero: **¿se puede correr en el navegador el mismo pipeline
que hacía el script de Python?** Si la respuesta era no, no había proyecto — y
era mejor enterarse en una tarde que después de dos semanas de interfaz.

Un *spike* es exactamente eso: código desechable cuyo único objetivo es
responder una pregunta técnica. No se cuida, no se testea de punta a punta y no
sobrevive. Lo que sobrevive es lo que se aprendió, y esta página es ese
registro.

El spike fue una sola página HTML sin build, servida por un script de Python de
diez líneas que mandaba los headers de cross-origin isolation. Tenía cuatro
pasos, en orden: verificar el entorno, bajar la voz, sintetizar el mismo texto a
1× y a 2× para comparar duraciones, y generar una rutina completa a MP3. Cada
paso podía cancelar el proyecto.

## Lo que se validó

**Que ONNX Runtime corre con varios hilos en el navegador.** Necesita
`SharedArrayBuffer`, que sólo existe en páginas con *cross-origin isolation*, y
eso exige dos headers que no todos los hostings dejan configurar:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

Ese fue el primer hallazgo con consecuencias: **descartó GitHub Pages**, que no
permite headers propios, y definió que el proyecto terminara en Cloudflare. Sin
esos headers la app funciona igual, pero la síntesis pasa a un solo hilo y se
vuelve varias veces más lenta.

**Que se puede acelerar una frase.** El bloque de ejecución de cada ejercicio
repite las instrucciones aceleradas, así que sin control de velocidad no había
producto. Se midió la duración del mismo texto pedido a 1×, 1,5×, 2× y 3×, y
ahí apareció el segundo hallazgo: **`length_scale` no es lineal**. Piper predice
cuántos frames dura cada fonema y redondea hacia arriba con un mínimo de uno,
así que pedir 2× no devuelve 2×: la curva satura. El motor final mide esa curva
una vez por voz y la invierte, en vez de creerle al número que le pide al
modelo.

**Cuánto cuesta la primera visita**, que era el riesgo de producto más que el
técnico:

| Recurso | Peso |
|---|---|
| Modelo de voz (`es_MX-claude-high`) | ~63 MB |
| Fonemizador espeak-ng (`.data`) | ~18 MB |
| WASM del fonemizador y de ONNX Runtime | ~1 MB |

Unos **82 MB la primera vez**, no 63 como decía la cuenta ingenua. Queda todo
cacheado, pero el número es lo bastante grande como para haber cambiado el
diseño: de ahí salieron los audios de ejemplo pregenerados, para que alguien que
entra sólo a mirar escuche cómo suena sin bajar nada.

## Por qué no se usó `vits-web`

Existe una librería que hace justo esto —cargar una voz Piper y sintetizar— y el
spike terminó **descartándola**, hablando directo con `onnxruntime-web` y el
fonemizador en unas 40 líneas propias. Dos motivos concretos, los dos
encontrados probando:

- `vits-web` toma `length_scale` del archivo de configuración del modelo y no lo
  expone. Sin eso no hay forma de acelerar una frase, que es el corazón del
  bloque de ejecución.
- `vits-web` se queda con la primera oración que devuelve el fonemizador. Para
  un texto de instrucciones de tres oraciones, sintetiza sólo la primera. El
  motor propio sintetiza todas y concatena el audio, que es lo que hace Piper de
  verdad.

Es el clásico caso en que una dependencia que ahorra código te saca justo la
palanca que necesitás. Escribir esas 40 líneas fue más barato que pelearse con
la librería, y dejó el control total de la parte más delicada.

## De dónde sale cada cosa

- [`onnxruntime-web`](https://github.com/microsoft/onnxruntime) (MIT) — inferencia
- [`lamejs`](https://github.com/zhuker/lamejs) (**LGPL**) — codificador MP3,
  cargado desde CDN sin modificar
- [`@diffusionstudio/piper-wasm`](https://www.npmjs.com/package/@diffusionstudio/piper-wasm) — fonemizador
- Modelos [Piper](https://github.com/rhasspy/piper) (MIT), servidos desde
  [Hugging Face](https://huggingface.co/diffusionstudio/piper-voices)

La licencia de `lamejs` es la que hay que mirar con cuidado: es LGPL, y este
proyecto es MIT. Cargarla desde un CDN sin modificarla está bien; incluirla
modificada en el build obligaría a liberar esos cambios.

## Qué quedó de todo esto

El spike no está en este repositorio: era código para tirar. Lo que sobrevivió
está en [`public/audio-worker.js`](../public/audio-worker.js) —el motor, ya
ordenado y con sus tests— y en las decisiones que vinieron de acá: los headers,
la calibración de velocidad, el fonemizado por oraciones y los audios de
ejemplo.
