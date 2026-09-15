#!/usr/bin/env bash
#
# Arma el repositorio de voces que usa la app.
#
# Los modelos de Piper viven en Hugging Face, pero la app NO los baja de ahí:
# una URL /resolve/ contesta con una redirección a una URL firmada que un
# `fetch` con CORS no puede seguir, así que desde el navegador la descarga
# muere con "Failed to fetch". Por eso los modelos se copian una vez a un
# repositorio propio y se sirven desde raw.githubusercontent.com.
#
# Este script hace esa copia, y sobre todo la verifica: cuando una descarga
# sale mal lo que queda en el disco es una página de error de dos kilobytes
# con nombre de modelo, y eso no se nota hasta que la app no arranca.
#
#   bash bajar-voces.sh [carpeta]     (por defecto ~/voces-piper)

set -euo pipefail

DESTINO="${1:-$HOME/voces-piper}"
BASE="https://huggingface.co/diffusionstudio/piper-voices/resolve/main/es"

# Las dos voces que ofrece la app. Sumar una es agregar una línea acá, otra en
# VOCES de public/audio-worker.js y otra en VOCES de src/tipos.ts.
RUTAS=(
  "es_MX/claude/high/es_MX-claude-high"
  "es_ES/carlfm/x_low/es_ES-carlfm-x_low"
)

mkdir -p "$DESTINO"
cd "$DESTINO"
echo "Bajando a $DESTINO"
echo

for ruta in "${RUTAS[@]}"; do
  nombre="${ruta##*/}"

  for ext in onnx onnx.json; do
    echo "→ $nombre.$ext"
    # -f: cortar con error si el servidor contesta 4xx o 5xx, en vez de
    #     guardar el HTML del error como si fuera el archivo.
    # -L: seguir la redirección, que es justo lo que no hace Postman y por eso
    #     desde ahí parecía un 404.
    curl -fL --progress-bar -o "$nombre.$ext" "$BASE/$ruta.$ext"
  done

  # La atribución de cada voz. El repositorio es MIT, pero llevarse la tarjeta
  # del modelo junto con el modelo es lo correcto y pesa 250 bytes.
  curl -fLs -o "MODEL_CARD-$nombre" "$BASE/${ruta%/*}/MODEL_CARD" \
    || echo "  (esta voz no trae MODEL_CARD)"
  echo
done

echo "Verificación:"
fallo=0

for f in *.onnx; do
  bytes=$(stat -c%s "$f")
  if [ "$bytes" -lt 1000000 ]; then
    echo "  ✗ $f pesa $bytes bytes. Eso no es un modelo: bajó una página de error."
    fallo=1
  else
    echo "  ✓ $f  $((bytes / 1048576)) MB"
  fi
done

for f in *.onnx.json; do
  if head -c 400 "$f" | grep -q '"sample_rate"'; then
    echo "  ✓ $f"
  else
    echo "  ✗ $f no parece una configuración de Piper."
    fallo=1
  fi
done

echo
if [ "$fallo" -eq 0 ]; then
  echo "Listo. Para publicarlo:"
  echo
  echo "  cd $DESTINO"
  echo "  git init -b main && git add -A"
  echo "  git commit -m 'Modelos de voz Piper para rutinas-de-audio'"
  echo "  git remote add origin git@github.com:agustingodoyc/voces-piper.git"
  echo "  git push -u origin main"
else
  echo "Algo bajó mal. Para ver qué contesta el servidor de verdad:"
  echo
  echo "  curl -IL '$BASE/${RUTAS[0]}.onnx'"
fi

exit "$fallo"
