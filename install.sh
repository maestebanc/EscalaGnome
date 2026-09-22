#!/usr/bin/env bash
# ==============================================================================
# Script universal de instalación y despliegue para Quick Scale & Font Switcher
# Compatible con GNOME 45 a GNOME 51 (Wayland / X11)
# ==============================================================================

set -euo pipefail

# Colores para salida de terminal
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UUID="quick-scale-switcher@local"
TARGET_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"
ZIP_NAME="${UUID}.shell-extension.zip"

echo -e "${BOLD}${BLUE}=====================================================${NC}"
echo -e "${BOLD}${BLUE}   Instalador de Quick Scale & Font Switcher        ${NC}"
echo -e "${BOLD}${BLUE}=====================================================${NC}"

# ------------------------------------------------------------------------------
# a) Detección de versión de GNOME Shell
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[1/4] Comprobando entorno de GNOME Shell...${NC}"
if ! command -v gnome-shell >/dev/null 2>&1; then
    echo -e "${RED}Error: 'gnome-shell' no está instalado o no se encuentra en el PATH.${NC}" >&2
    exit 1
fi

SHELL_VERSION_FULL=$(gnome-shell --version)
SHELL_MAJOR=$(echo "${SHELL_VERSION_FULL}" | grep -oP '\d+' | head -n 1)

echo -e "  Detectado: ${GREEN}${SHELL_VERSION_FULL}${NC} (Rama principal: ${SHELL_MAJOR})"

if [[ -n "${SHELL_MAJOR}" ]] && (( SHELL_MAJOR < 45 )); then
    echo -e "${YELLOW}Advertencia: Esta extensión utiliza módulos ESM nativos diseñados para GNOME 45 a 51.${NC}"
    echo -e "${YELLOW}Tu versión de GNOME (${SHELL_MAJOR}) es anterior a 45 y puede no ser compatible.${NC}"
fi

# ------------------------------------------------------------------------------
# b) Instalación de la extensión en el directorio de usuario
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[2/4] Desplegando archivos de la extensión...${NC}"
echo -e "  Destino: ${BLUE}${TARGET_DIR}${NC}"

mkdir -p "${TARGET_DIR}"

if [[ -f "${SCRIPT_DIR}/${ZIP_NAME}" ]]; then
    echo -e "  Instalando desde paquete comprimido: ${ZIP_NAME}"
    if command -v unzip >/dev/null 2>&1; then
        unzip -q -o "${SCRIPT_DIR}/${ZIP_NAME}" -d "${TARGET_DIR}"
    else
        echo -e "${RED}Error: Se requiere el comando 'unzip' para descomprimir ${ZIP_NAME}.${NC}" >&2
        exit 1
    fi
elif [[ -f "${SCRIPT_DIR}/metadata.json" && -f "${SCRIPT_DIR}/extension.js" ]]; then
    echo -e "  Instalando directamente desde código fuente del repositorio..."
    cp -f "${SCRIPT_DIR}/metadata.json" "${TARGET_DIR}/"
    cp -f "${SCRIPT_DIR}/extension.js" "${TARGET_DIR}/"
    if [[ -f "${SCRIPT_DIR}/stylesheet.css" ]]; then
        cp -f "${SCRIPT_DIR}/stylesheet.css" "${TARGET_DIR}/"
    fi
else
    echo -e "${RED}Error: No se encontraron los archivos fuente ni ${ZIP_NAME} en ${SCRIPT_DIR}.${NC}" >&2
    exit 1
fi

echo -e "  ${GREEN}✓ Archivos copiados correctamente.${NC}"

# ------------------------------------------------------------------------------
# c) Activación del escalado fraccionario en Mutter (scale-monitor-framebuffer)
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[3/4] Comprobando soporte de escalado fraccionario en Mutter...${NC}"
MUTTER_SCHEMA="org.gnome.mutter"
FEATURE_NAME="scale-monitor-framebuffer"

CURRENT_FEATURES=$(gsettings get ${MUTTER_SCHEMA} experimental-features 2>/dev/null || echo "@as []")
MUTTER_UPDATED=false

if [[ "${CURRENT_FEATURES}" != *"${FEATURE_NAME}"* ]]; then
    echo -e "  Activando '${FEATURE_NAME}' en ${MUTTER_SCHEMA} experimental-features..."
    if [[ "${CURRENT_FEATURES}" == "@as []" || "${CURRENT_FEATURES}" == "[]" || -z "${CURRENT_FEATURES}" ]]; then
        gsettings set ${MUTTER_SCHEMA} experimental-features "['${FEATURE_NAME}']"
    else
        # Preserva cualquier otra característica preexistente (por ejemplo variable-refresh-rate)
        UPDATED_FEATURES=$(echo "${CURRENT_FEATURES}" | sed "s/]$/, '${FEATURE_NAME}']/")
        gsettings set ${MUTTER_SCHEMA} experimental-features "${UPDATED_FEATURES}"
    fi
    echo -e "  ${GREEN}✓ Escalado fraccionario habilitado en Mutter.${NC}"
    MUTTER_UPDATED=true
else
    echo -e "  ${GREEN}✓ '${FEATURE_NAME}' ya está activo en Mutter.${NC}"
fi

# ------------------------------------------------------------------------------
# d) Habilitación de la extensión
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[4/4] Habilitando extensión en GNOME Shell...${NC}"

# 1. Asegurar registro permanente en GSettings (persiste entre reinicios e inicios de sesión)
SHELL_SCHEMA="org.gnome.shell"
CURRENT_ENABLED=$(gsettings get ${SHELL_SCHEMA} enabled-extensions 2>/dev/null || echo "[]")
if [[ "${CURRENT_ENABLED}" != *"${UUID}"* ]]; then
    if [[ "${CURRENT_ENABLED}" == "@as []" || "${CURRENT_ENABLED}" == "[]" ]]; then
        gsettings set ${SHELL_SCHEMA} enabled-extensions "['${UUID}']"
    else
        UPDATED_ENABLED=$(echo "${CURRENT_ENABLED}" | sed "s/]$/, '${UUID}']/")
        gsettings set ${SHELL_SCHEMA} enabled-extensions "${UPDATED_ENABLED}"
    fi
    echo -e "  ${GREEN}✓ UUID registrado en GSettings (org.gnome.shell.enabled-extensions).${NC}"
else
    echo -e "  ${GREEN}✓ UUID ya registrado en org.gnome.shell.enabled-extensions.${NC}"
fi

# 2. Habilitar o recargar en caliente en la sesión en ejecución
if command -v gnome-extensions >/dev/null 2>&1; then
    gnome-extensions disable "${UUID}" 2>/dev/null || true
    sleep 0.3
    gnome-extensions enable "${UUID}" 2>/dev/null || true
    echo -e "  ${GREEN}✓ Extensión recargada y habilitada con gnome-extensions.${NC}"
fi

# ------------------------------------------------------------------------------
# e) Información y recomendaciones sobre la sesión
# ------------------------------------------------------------------------------
SESSION_TYPE="${XDG_SESSION_TYPE:-wayland}"
echo -e "\n${BOLD}${BLUE}=====================================================${NC}"
echo -e "${BOLD}${GREEN}   ¡Instalación completada con éxito!                ${NC}"
echo -e "${BOLD}${BLUE}=====================================================${NC}"
echo -e "Sesión detectada: ${BOLD}${SESSION_TYPE}${NC}\n"

if [[ "${SESSION_TYPE}" == "wayland" ]]; then
    if [[ "${MUTTER_UPDATED}" == "true" ]]; then
        echo -e "${YELLOW}${BOLD}AVISO IMPORTANTE (Wayland):${NC}"
        echo -e "${YELLOW}Se ha activado la aceleración fraccionaria por primera vez en Mutter.${NC}"
        echo -e "${YELLOW}Debes CERRAR SESIÓN (Log out) y volver a entrar para que el compositor${NC}"
        echo -e "${YELLOW}Wayland inicialice el soporte de framebuffer fraccionario y cargue la extensión.${NC}"
    else
        echo -e "Si la extensión no aparece inmediatamente en el panel superior:"
        echo -e "  1. Abre la app 'Extensiones' (gnome-extensions-app) para verificar que esté activa."
        echo -e "  2. O cierra sesión y vuelve a iniciarla en Wayland."
    fi
else
    echo -e "${GREEN}En sesión X11 puedes recargar GNOME Shell inmediatamente:${NC}"
    echo -e "  Presiona ${BOLD}Alt + F2${NC}, escribe ${BOLD}r${NC} y presiona ${BOLD}Enter${NC}."
fi

echo -e "\nPara desinstalar en el futuro ejecuta:"
echo -e "  ${BOLD}rm -rf ${TARGET_DIR}${NC}\n"
