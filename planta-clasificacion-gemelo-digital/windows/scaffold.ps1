# =============================================================================
# scaffold.ps1 — Inicialización del repositorio en Windows (host de CODESYS Control Win V3)
# Requiere: PowerShell ≥ 5.1, Node.js ≥ 20.19 (recomendado 22 LTS), npm ≥ 10.
# Uso: powershell -ExecutionPolicy Bypass -File .\scaffold.ps1 [-Root ruta]
# =============================================================================
param([string]$Root = "planta-clasificacion-gemelo-digital")
$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path $Root | Out-Null
Set-Location $Root

# --- 1. Árbol de directorios -------------------------------------------------
$dirs = @(
  "docs", "plc-codesys",
  "puente-modbus-planta/src/config", "puente-modbus-planta/src/services", "puente-modbus-planta/src/models",
  "hmi-planta-3d/public", "hmi-planta-3d/src/core", "hmi-planta-3d/src/components3d",
  "hmi-planta-3d/src/ui", "hmi-planta-3d/src/styles"
)
$dirs | ForEach-Object { New-Item -ItemType Directory -Force -Path $_ | Out-Null }

# --- 2. Archivos marcadores --------------------------------------------------
$files = @(
  "docs/01_arquitectura_y_flujos.md", "docs/02_mapeo_memoria_modbus.md", "docs/03_manual_puesta_en_marcha.md",
  "plc-codesys/variables_globales.st", "plc-codesys/logica_clasificador_fsm.st", "plc-codesys/config_modbus_slave.json",
  "puente-modbus-planta/src/config/env.js", "puente-modbus-planta/src/services/modbusClient.js",
  "puente-modbus-planta/src/services/websocketServer.js", "puente-modbus-planta/src/models/dataContract.js",
  "puente-modbus-planta/src/index.js",
  "hmi-planta-3d/src/core/sceneManager.js", "hmi-planta-3d/src/core/wsClient.js",
  "hmi-planta-3d/src/components3d/conveyorBelt.js", "hmi-planta-3d/src/components3d/diverterMechanism.js",
  "hmi-planta-3d/src/components3d/sensorsAndBeacons.js", "hmi-planta-3d/src/components3d/packageSpawner.js",
  "hmi-planta-3d/src/ui/operatorPanel.js", "hmi-planta-3d/src/ui/hudLabels.js",
  "hmi-planta-3d/src/styles/industrial-theme.css", "hmi-planta-3d/src/main.js", "hmi-planta-3d/index.html"
)
$files | ForEach-Object { if (-not (Test-Path $_)) { New-Item -ItemType File -Path $_ | Out-Null } }

# --- 3. Middleware -----------------------------------------------------------
Push-Location "puente-modbus-planta"
npm init -y | Out-Null
npm pkg delete scripts.test
npm pkg set name="puente-modbus-planta" version="0.1.0" type="module" main="src/index.js" `
  description="Middleware Modbus TCP -> WebSocket para la planta virtual de clasificación" `
  engines.node=">=20.19.0" scripts.start="node src/index.js" scripts.dev="node --watch src/index.js"
npm install --save-exact modbus-serial@8.0.25 ws@8.22.0 dotenv@18.0.9 pino@10.4.0
npm install --save-dev --save-exact pino-pretty@13.2.0
@"
MODBUS_HOST=127.0.0.1
MODBUS_PORT=502
MODBUS_UNIT_ID=1
MODBUS_TIMEOUT_MS=2000
POLL_INTERVAL_MS=50
HEARTBEAT_STALE_MS=1500
PULSE_WIDTH_MS=150
RECONNECT_BASE_MS=500
RECONNECT_MAX_MS=5000
WS_PORT=8080
LOG_LEVEL=info
"@ | Set-Content -Encoding UTF8 ".env.example"
Copy-Item ".env.example" ".env" -Force
Pop-Location

# --- 4. HMI/SCADA 3D ---------------------------------------------------------
Push-Location "hmi-planta-3d"
npm init -y | Out-Null
npm pkg delete scripts.test
npm pkg set private=true --json
npm pkg set name="hmi-planta-3d" version="0.1.0" type="module" `
  description="Gemelo digital 3D reactivo (Three.js + Tailwind)" engines.node=">=20.19.0" `
  scripts.dev="vite" scripts.build="vite build" scripts.preview="vite preview"
npm install --save-exact three@0.186.1
npm install --save-dev --save-exact vite@8.3.5 tailwindcss@4.3.3 "@tailwindcss/vite@4.3.3"
@"
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  server: { port: 5173, strictPort: true },
});
"@ | Set-Content -Encoding UTF8 "vite.config.js"
Pop-Location

"node_modules/`ndist/`n.env`n*.log" | Set-Content -Encoding UTF8 ".gitignore"
Write-Host "Scaffolding completado en: $(Get-Location)"
