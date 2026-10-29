#!/usr/bin/env bash
# =============================================================================
# scaffold.sh — Inicialización del repositorio "planta-clasificacion-gemelo-digital"
# Fase 1 · Ingeniería de detalle. Requiere: bash ≥ 4, Node.js ≥ 20.19 (recomendado 22 LTS), npm ≥ 10.
# Uso: bash scaffold.sh [directorio_destino]
# =============================================================================
set -euo pipefail

ROOT="${1:-planta-clasificacion-gemelo-digital}"
mkdir -p "$ROOT" && cd "$ROOT"

# --- 1. Árbol de directorios -------------------------------------------------
mkdir -p docs \
         plc-codesys \
         puente-modbus-planta/src/{config,services,models} \
         hmi-planta-3d/public \
         hmi-planta-3d/src/{core,components3d,ui,styles}

# --- 2. Archivos marcadores (se completan en Fases 2–5) ----------------------
touch docs/01_arquitectura_y_flujos.md \
      docs/02_mapeo_memoria_modbus.md \
      docs/03_manual_puesta_en_marcha.md \
      plc-codesys/variables_globales.st \
      plc-codesys/logica_clasificador_fsm.st \
      plc-codesys/config_modbus_slave.json \
      puente-modbus-planta/src/config/env.js \
      puente-modbus-planta/src/services/modbusClient.js \
      puente-modbus-planta/src/services/websocketServer.js \
      puente-modbus-planta/src/models/dataContract.js \
      puente-modbus-planta/src/index.js \
      hmi-planta-3d/src/core/sceneManager.js \
      hmi-planta-3d/src/core/wsClient.js \
      hmi-planta-3d/src/components3d/conveyorBelt.js \
      hmi-planta-3d/src/components3d/diverterMechanism.js \
      hmi-planta-3d/src/components3d/sensorsAndBeacons.js \
      hmi-planta-3d/src/components3d/packageSpawner.js \
      hmi-planta-3d/src/ui/operatorPanel.js \
      hmi-planta-3d/src/ui/hudLabels.js \
      hmi-planta-3d/src/styles/industrial-theme.css \
      hmi-planta-3d/src/main.js \
      hmi-planta-3d/index.html

# --- 3. Middleware: puente-modbus-planta -------------------------------------
pushd puente-modbus-planta >/dev/null
npm init -y >/dev/null
npm pkg delete scripts.test
npm pkg set name="puente-modbus-planta" version="0.1.0" type="module" \
  description="Middleware Modbus TCP -> WebSocket para la planta virtual de clasificación" \
  main="src/index.js" engines.node=">=20.19.0" \
  scripts.start="node src/index.js" \
  scripts.dev="node --watch src/index.js | pino-pretty"
npm install --save-exact modbus-serial@8.0.25 ws@8.22.0 dotenv@18.0.9 pino@10.4.0
npm install --save-dev --save-exact pino-pretty@13.2.0
cat > .env.example <<'EOF'
# Esclavo Modbus TCP (CODESYS Control Win V3)
MODBUS_HOST=127.0.0.1
MODBUS_PORT=502
MODBUS_UNIT_ID=1
MODBUS_TIMEOUT_MS=2000
# Ciclo de adquisición
POLL_INTERVAL_MS=50
HEARTBEAT_STALE_MS=1500
PULSE_WIDTH_MS=150
# Reconexión con retroceso exponencial
RECONNECT_BASE_MS=500
RECONNECT_MAX_MS=5000
# Servidor WebSocket
WS_PORT=8080
# Registro estructurado (trace|debug|info|warn|error)
LOG_LEVEL=info
EOF
cp .env.example .env
popd >/dev/null

# --- 4. HMI/SCADA 3D: hmi-planta-3d ------------------------------------------
pushd hmi-planta-3d >/dev/null
npm init -y >/dev/null
npm pkg delete scripts.test
npm pkg set private=true --json
npm pkg set name="hmi-planta-3d" version="0.1.0" type="module" \
  description="Gemelo digital 3D reactivo (Three.js + Tailwind) de la planta de clasificación" \
  engines.node=">=20.19.0" \
  scripts.dev="vite" scripts.build="vite build" scripts.preview="vite preview"
npm install --save-exact three@0.186.1
npm install --save-dev --save-exact vite@8.3.5 tailwindcss@4.3.3 @tailwindcss/vite@4.3.3
cat > vite.config.js <<'EOF'
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  server: { port: 5173, strictPort: true },
});
EOF
popd >/dev/null

# --- 5. Control de versiones -------------------------------------------------
cat > .gitignore <<'EOF'
node_modules/
dist/
.env
*.log
plc-codesys/*.bak
EOF
git init -q 2>/dev/null || true

echo "Scaffolding completado en: $(pwd)"
