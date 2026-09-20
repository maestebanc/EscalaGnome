#!/usr/bin/env bash
# ==============================================================================
# Script de empaquetado para Quick Scale & Font Switcher
# Genera: quick-scale-switcher@local.shell-extension.zip
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UUID="quick-scale-switcher@local"
OUTPUT_ZIP="${SCRIPT_DIR}/${UUID}.shell-extension.zip"

echo "=================================================="
echo "  Empaquetando GNOME Shell Extension: ${UUID}"
echo "=================================================="

cd "${SCRIPT_DIR}"

# Comprobar existencia de archivos mínimos requeridos
for file in "metadata.json" "extension.js" "stylesheet.css"; do
    if [[ ! -f "${file}" ]]; then
        echo "Error: Falta el archivo obligatorio '${file}' en ${SCRIPT_DIR}" >&2
        exit 1
    fi
done

# Eliminar zip anterior si existe
rm -f "${OUTPUT_ZIP}"

if command -v gnome-extensions >/dev/null 2>&1; then
    echo "-> Utilizando herramienta oficial 'gnome-extensions pack'..."
    gnome-extensions pack \
        --force \
        --extra-source=stylesheet.css \
        --out-dir="${SCRIPT_DIR}" \
        "${SCRIPT_DIR}"
    echo "-> Empaquetado oficial completado."
else
    echo "-> 'gnome-extensions' no encontrado. Usando fallback 'zip'..."
    zip -q -9 -r "${OUTPUT_ZIP}" \
        metadata.json \
        extension.js \
        stylesheet.css
    echo "-> Empaquetado mediante zip completado."
fi

if [[ -f "${OUTPUT_ZIP}" ]]; then
    echo "--------------------------------------------------"
    echo "✓ Paquete generado correctamente:"
    echo "  Ruta:   ${OUTPUT_ZIP}"
    echo "  Tamaño: $(du -h "${OUTPUT_ZIP}" | cut -f1)"
    echo "--------------------------------------------------"
else
    echo "Error: No se pudo generar el archivo ${OUTPUT_ZIP}" >&2
    exit 1
fi
