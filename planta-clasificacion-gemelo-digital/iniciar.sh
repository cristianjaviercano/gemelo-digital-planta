#!/usr/bin/env bash
# =============================================================================
# iniciar.sh — Arranca la planta completa en macOS: PLC virtual, middleware y
# HMI 3D, y abre el navegador. Ctrl+C detiene las tres capas.
# Uso: ./iniciar.sh            (SIN_NAVEGADOR=1 ./iniciar.sh para no abrirlo)
# En el laboratorio (Windows + CODESYS) se usa windows/README.md.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

for carpeta in plc-virtual puente-modbus-planta hmi-planta-3d; do
  if [ ! -d "$carpeta/node_modules" ]; then
    echo "Falta instalar dependencias: cd $carpeta && npm install"
    exit 1
  fi
done
[ -f puente-modbus-planta/.env ] || cp puente-modbus-planta/.env.example puente-modbus-planta/.env

# Un segundo doble clic no debe lanzar otra planta que choque con la primera
ocupados=""
for puerto in 5020 8080 5173; do
  lsof -ti "tcp:$puerto" -sTCP:LISTEN >/dev/null 2>&1 && ocupados="$ocupados $puerto"
done
if [ -n "$ocupados" ]; then
  echo "Puertos en uso:$ocupados. La planta ya parece estar en marcha."
  if curl -s -o /dev/null http://localhost:5173/; then
    # No se abre otra pestaña: dos HMI emularían dos sensores a la vez (docs/06 §7)
    echo "Use la pestaña ya abierta en http://localhost:5173 (si la cerró, ábrala de nuevo con esa dirección)."
  else
    echo "Otro programa ocupa esos puertos; ciérrelo antes de iniciar la planta (lsof -i :<puerto>)."
  fi
  exit 1
fi

procesos=()
detener() {
  trap - EXIT INT TERM HUP
  [ ${#procesos[@]} -gt 0 ] && kill "${procesos[@]}" 2>/dev/null || true
  wait 2>/dev/null || true
  echo
  echo "Planta detenida."
}
# HUP: cerrar la ventana de Terminal también detiene las tres capas
trap detener EXIT INT TERM HUP

# Antepone la capa a cada línea para distinguir quién escribe
prefijo() { while IFS= read -r linea; do printf '%s %s\n' "$1" "$linea"; done; }

# Cada capa corre como proceso propio (exec) y su salida va a una sustitución de
# proceso: así $! es el PID de node y Ctrl+C lo detiene de verdad
(cd plc-virtual && exec node src/index.js < /dev/null) > >(prefijo "[PLC]") 2>&1 &
procesos+=($!)
sleep 0.5
(cd puente-modbus-planta && exec node src/index.js) 2>&1 > >(
  puente-modbus-planta/node_modules/.bin/pino-pretty --singleLine --ignore pid,hostname --translateTime SYS:HH:MM:ss \
    | prefijo "[MW] ") &
procesos+=($!)
(cd hmi-planta-3d && exec node_modules/.bin/vite --port 5173 --strictPort) > >(prefijo "[HMI]") 2>&1 &
procesos+=($!)

for _ in $(seq 1 40); do
  curl -s -o /dev/null http://localhost:5173/ && break
  sleep 0.25
done
echo "[HMI] Planta en http://localhost:5173  (Ctrl+C para detener todo)"
[ -n "${SIN_NAVEGADOR:-}" ] || open "http://localhost:5173"
wait
