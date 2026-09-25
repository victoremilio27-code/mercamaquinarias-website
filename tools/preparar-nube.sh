#!/bin/bash
# Prepara una sesión de Claude Code en la nube (claude.ai/code) para este repo.
#
# Va como "script de preparación" del entorno en claude.ai/code. Allí la máquina
# es Linux y está vacía: no tiene el CLAUDE.md global de Victor, ni la memoria de
# sesiones anteriores, ni GSD, que en su PC vive en ~/.claude. Por eso no sirve
# copiar la instalación de GSD al repo: sus hooks quedan escritos con rutas de
# Windows ("C:/Program Files/nodejs/node.exe") y en Linux no arrancan.
#
# Se puede correr más de una vez sin daño.
set -euo pipefail

cd "$(dirname "$0")/.."

# 1. Node >= 22.5: node:sqlite (DatabaseSync) no existe antes. Con un Node viejo
#    el servidor y todas las pruebas de base fallan con un error que no lo dice.
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=5)?0:1)'; then
  echo "Node $(node -v) es demasiado viejo: hace falta >= 22.5 (en producción, 24)." >&2
  if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
    nvm install 24 && nvm alias default 24
  else
    echo "Elige Node 24 en la configuración del entorno." >&2
    exit 1
  fi
fi
echo "Node $(node -v)"

# 2. Dependencias de desarrollo (solo puppeteer). Si la red no deja bajar Chrome,
#    se instala sin él: las auditorías del navegador siguen corriendo en el CI del PR.
if ! npm ci --no-audit --no-fund; then
  echo "npm ci falló; reintento sin descargar Chrome." >&2
  PUPPETEER_SKIP_DOWNLOAD=1 npm ci --no-audit --no-fund
  echo "AVISO: sin Chrome, 'npm run auditar' y 'npm run check' no corren aquí; los cubre el CI." >&2
fi

# 3. GSD, la misma versión que usa Victor en su PC. Versión fija a propósito:
#    npm marca el paquete como "no longer supported", así que "latest" podría
#    desaparecer o cambiar sin aviso.
if [ ! -d "$HOME/.claude/get-shit-done" ]; then
  npx -y get-shit-done-cc@1.42.3 --claude --global
fi

echo "Listo. Al empezar, lee .planning/STATE.md."
