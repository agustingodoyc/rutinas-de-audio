#!/usr/bin/env bash
#
# Publica el repositorio de voces y verifica que raw.githubusercontent lo sirva.
#
# Segundo paso de bajar-voces.sh. Es lo mismo que haría uno a mano con git y el
# navegador, pero sin el navegador: `gh` crea el repositorio desde la consola.
#
# Lo importante es el final. Subir un archivo a GitHub no garantiza que sea
# alcanzable como dice la app: puede estar el repositorio privado, puede fallar
# el nombre, puede tardar la caché. El script no da por terminado nada hasta
# que un pedido real a la URL que va a usar el navegador devuelve 200 con el
# tamaño correcto.
#
#   bash publicar-voces.sh [carpeta]     (por defecto ~/voces-piper)

set -euo pipefail

CARPETA="${1:-$HOME/voces-piper}"
USUARIO="agustingodoyc"
REPO="voces-piper"
RAW="https://raw.githubusercontent.com/$USUARIO/$REPO/main"

cd "$CARPETA"

# ── 1. Repositorio local ────────────────────────────────────────────────
if [ ! -d .git ]; then
  git init -b main
fi

git add -A
# --allow-empty-message no: si no hay nada que commitear, seguimos de largo.
git diff --cached --quiet || git commit -m "Modelos de voz Piper para rutinas-de-audio"

# ── 2. Repositorio remoto ───────────────────────────────────────────────
if git remote get-url origin >/dev/null 2>&1; then
  echo "· origin ya configurado"
elif command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo "· creando $USUARIO/$REPO con gh"
  gh repo create "$USUARIO/$REPO" --public --source=. --remote=origin
else
  echo "gh no está instalado o no tiene sesión. Dos opciones:"
  echo
  echo "  sudo apt install gh && gh auth login     # y volvé a correr esto"
  echo
  echo "  # o, si preferís crear el repositorio a mano en github.com:"
  echo "  git remote add origin git@github.com:$USUARIO/$REPO.git"
  exit 1
fi

git push -u origin main

# ── 3. Verificación: lo que importa es lo que ve el navegador ──────────
echo
echo "Verificando $RAW"

fallo=0
for f in *.onnx *.onnx.json; do
  local_bytes=$(stat -c%s "$f")

  # -f para que un 404 sea un error y no un cuerpo que se guarda igual.
  # La caché de raw puede tardar unos segundos en el primer pedido.
  for intento in 1 2 3 4 5; do
    remoto_bytes=$(curl -fsSL -o /dev/null -w '%{size_download}' "$RAW/$f" 2>/dev/null) && break
    remoto_bytes=""
    sleep 3
  done

  if [ -z "$remoto_bytes" ]; then
    echo "  ✗ $f no se puede bajar todavía"
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
  echo "Revisá que el repositorio sea público:  gh repo view $USUARIO/$REPO --json visibility"
  exit 1
fi

echo "Las voces están servidas. Último paso, la app:"
echo
echo "  cd '/home/agustin/Documentos/Personal/Texto a audios/Web/app'"
echo "  npm run build && git add -A \\"
echo "    && git commit -m 'Servir el modelo de voz desde un repositorio propio' \\"
echo "    && git push"
