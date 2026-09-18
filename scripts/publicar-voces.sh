#!/usr/bin/env bash
#
# Publica el repositorio de voces y verifica que raw.githubusercontent lo sirva.
#
# Segundo paso de bajar-voces.sh. Hace lo mismo que uno haría a mano con git y
# el navegador, pero sin el navegador.
#
# Lo importante es el final. Subir un archivo a GitHub no garantiza que sea
# alcanzable como lo va a pedir la app: puede quedar el repositorio privado,
# puede fallar un nombre, puede tardar la caché. El script no da por terminado
# nada hasta que un pedido real a la URL que va a usar el navegador devuelve
# el archivo con el tamaño correcto.
#
#   bash publicar-voces.sh [carpeta]     (por defecto ~/voces-piper)

set -euo pipefail

CARPETA="${1:-$HOME/voces-piper}"
USUARIO="agustingodoyc"
REPO="voces-piper"
REMOTO="https://github.com/$USUARIO/$REPO.git"
RAW="https://raw.githubusercontent.com/$USUARIO/$REPO/main"

# ── 0. ¿Estamos donde creemos? ──────────────────────────────────────────
# Este script hace `git init` y `git add -A`, así que correrlo en la carpeta
# equivocada ensucia otro repositorio. Comprobarlo cuesta dos líneas.
cd "$CARPETA" 2>/dev/null || { echo "No existe $CARPETA. Corré antes bajar-voces.sh"; exit 1; }
compgen -G "*.onnx" >/dev/null || { echo "No hay modelos en $CARPETA. Corré antes bajar-voces.sh"; exit 1; }

echo "· carpeta $CARPETA"

# ── 1. Repositorio local ────────────────────────────────────────────────
[ -d .git ] || git init -b main
git add -A
git diff --cached --quiet || git commit -m "Modelos de voz Piper para rutinas-de-audio"

# ── 2. El remoto, por HTTPS ─────────────────────────────────────────────
# Por HTTPS y no por SSH a propósito: así es como este equipo ya se autentica
# con GitHub. Con una URL `git@github.com:` haría falta tener una clave SSH
# cargada, y sin ella el push muere con "Permission denied (publickey)".
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTO"
else
  git remote add origin "$REMOTO"
fi
echo "· origin → $REMOTO"

# ¿Existe del otro lado? Un 404 puede ser que no exista o que exista privado;
# en los dos casos intentar crearlo es lo correcto y si ya está, no pasa nada.
codigo=$(curl -s -o /dev/null -w '%{http_code}' "https://github.com/$USUARIO/$REPO")
if [ "$codigo" != "200" ]; then
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    echo "· creando $USUARIO/$REPO"
    gh repo create "$USUARIO/$REPO" --public --disable-wiki --disable-issues \
      || echo "  (ya existía)"
  else
    echo
    echo "El repositorio $USUARIO/$REPO no existe y no hay gh para crearlo:"
    echo
    echo "  sudo apt install gh && gh auth login    # y volvé a correr esto"
    echo
    exit 1
  fi
fi

git push -u origin main

# ── 3. Verificación: lo que importa es lo que ve el navegador ──────────
echo
echo "Verificando $RAW"

fallo=0
for f in *.onnx *.onnx.json; do
  local_bytes=$(stat -c%s "$f")
  remoto_bytes=""

  # La caché de raw.githubusercontent puede tardar unos segundos en el primer
  # pedido. -f para que un 404 sea un error y no un cuerpo que se mide igual.
  for _ in 1 2 3 4 5; do
    remoto_bytes=$(curl -fsSL -o /dev/null -w '%{size_download}' "$RAW/$f" 2>/dev/null) && break
    remoto_bytes=""
    sleep 3
  done

  if [ -z "$remoto_bytes" ]; then
    echo "  ✗ $f todavía no se puede bajar"
    fallo=1
  elif [ "$remoto_bytes" != "$local_bytes" ]; then
    echo "  ✗ $f llega con $remoto_bytes bytes y en disco tiene $local_bytes"
    fallo=1
  else
    echo "  ✓ $f  $((local_bytes / 1048576)) MB"
  fi
done

echo
if [ "$fallo" -ne 0 ]; then
  echo "Si el repositorio quedó privado, la app no va a poder bajar las voces:"
  echo "  gh repo edit $USUARIO/$REPO --visibility public --accept-visibility-change-consequences"
  exit 1
fi

echo "Las voces están servidas. La app ya apunta acá, así que sólo falta"
echo "que Cloudflare tenga el último commit:"
echo
echo "  cd '/home/agustin/Documentos/Personal/Texto a audios/Web/app'"
echo "  git log --oneline -1        # si ya lo pusheaste, no hace falta nada más"
