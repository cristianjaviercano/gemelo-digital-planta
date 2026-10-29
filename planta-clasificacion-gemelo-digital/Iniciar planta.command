#!/bin/bash
# Lanzador de doble clic para macOS: abre Terminal y ejecuta iniciar.sh.
# Ctrl+C o cerrar la ventana detiene la planta.
cd "$(dirname "$0")" && exec ./iniciar.sh
