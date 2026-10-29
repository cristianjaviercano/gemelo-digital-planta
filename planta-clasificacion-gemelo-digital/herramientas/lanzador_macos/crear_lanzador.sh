#!/usr/bin/env bash
# =============================================================================
# crear_lanzador.sh — Genera «Planta de Clasificación.app» en la raíz del
# proyecto (macOS): compila lanzador.applescript y le pone icono_1024.png.
# Uso: bash herramientas/lanzador_macos/crear_lanzador.sh
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"
RAIZ="$(cd ../.. && pwd)"
APP="$RAIZ/Planta de Clasificación.app"
TEMPORAL="$(mktemp -d)"
trap 'rm -rf "$TEMPORAL"' EXIT

chmod +x "$RAIZ/iniciar.sh" "$RAIZ/Iniciar planta.command"

# Icono: juego de tamaños que exige iconutil a partir del PNG de 1024 px
ICONOS="$TEMPORAL/icono.iconset"
mkdir -p "$ICONOS"
for lado in 16 32 128 256 512; do
  sips -z "$lado" "$lado" icono_1024.png --out "$ICONOS/icon_${lado}x${lado}.png" >/dev/null
  sips -z $((lado * 2)) $((lado * 2)) icono_1024.png --out "$ICONOS/icon_${lado}x${lado}@2x.png" >/dev/null
done
iconutil -c icns "$ICONOS" -o "$TEMPORAL/icono.icns"

rm -rf "$APP"
osacompile -o "$APP" lanzador.applescript
cp "$TEMPORAL/icono.icns" "$APP/Contents/Resources/applet.icns"
# osacompile añade un catálogo (Assets.car) con el icono genérico, que en macOS
# reciente tiene prioridad sobre applet.icns: se retira para que se vea la planta
rm -f "$APP/Contents/Resources/Assets.car"
/usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$APP/Contents/Info.plist" 2>/dev/null || true
# Cambiar el icono altera el paquete firmado: se vuelve a firmar en local (ad hoc)
codesign --force --deep --sign - "$APP" >/dev/null 2>&1
touch "$APP"
echo "Creado: $APP"
