#!/usr/bin/env bash
# ==============================================================================
# Packaging script for Quick Scale & Font Switcher
# Generates: quick-scale-switcher@local.shell-extension.zip
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UUID="quick-scale-switcher@local"
DOMAIN="quick-scale-switcher"
OUTPUT_ZIP="${SCRIPT_DIR}/${UUID}.shell-extension.zip"

echo "=================================================="
echo "  Packaging GNOME Shell Extension: ${UUID}"
echo "=================================================="

cd "${SCRIPT_DIR}"

# Check required base files
for file in "metadata.json" "extension.js" "stylesheet.css"; do
    if [[ ! -f "${file}" ]]; then
        echo "Error: Missing required file '${file}' in ${SCRIPT_DIR}" >&2
        exit 1
    fi
done

# Compile translations if msgfmt is available
if command -v msgfmt >/dev/null 2>&1 && [[ -d "po" ]]; then
    echo "-> Compiling gettext translations..."
    for po in po/*.po; do
        if [[ -f "${po}" ]]; then
            lang="$(basename "${po}" .po)"
            localedir="locale/${lang}/LC_MESSAGES"
            mkdir -p "${localedir}"
            msgfmt -c "${po}" -o "${localedir}/${DOMAIN}.mo"
            echo "   Compiled ${po} -> ${localedir}/${DOMAIN}.mo"
        fi
    done
fi

# Remove previous zip if it exists
rm -f "${OUTPUT_ZIP}"

if command -v gnome-extensions >/dev/null 2>&1; then
    echo "-> Using official 'gnome-extensions pack' tool..."
    gnome-extensions pack \
        --force \
        --podir=po \
        --gettext-domain="${DOMAIN}" \
        --extra-source=stylesheet.css \
        --out-dir="${SCRIPT_DIR}" \
        "${SCRIPT_DIR}"
    echo "-> Official packaging completed."
else
    echo "-> 'gnome-extensions' not found. Using fallback 'zip'..."
    zip -q -9 -r "${OUTPUT_ZIP}" \
        metadata.json \
        extension.js \
        stylesheet.css \
        locale
    echo "-> Zip fallback packaging completed."
fi

if [[ -f "${OUTPUT_ZIP}" ]]; then
    echo "--------------------------------------------------"
    echo "✓ Package generated successfully:"
    echo "  Path: ${OUTPUT_ZIP}"
    echo "  Size: $(du -h "${OUTPUT_ZIP}" | cut -f1)"
    echo "--------------------------------------------------"
else
    echo "Error: Failed to generate ${OUTPUT_ZIP}" >&2
    exit 1
fi
