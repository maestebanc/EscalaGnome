#!/usr/bin/env bash
# ==============================================================================
# Universal installation script for Quick Scale & Font Switcher
# Compatible with GNOME 45 through GNOME 51 (Wayland / X11)
# ==============================================================================

set -euo pipefail

# Terminal colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UUID="quick-scale-switcher@local"
DOMAIN="quick-scale-switcher"
TARGET_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"
ZIP_NAME="${UUID}.shell-extension.zip"

echo -e "${BOLD}${BLUE}=====================================================${NC}"
echo -e "${BOLD}${BLUE}   Quick Scale & Font Switcher Installer             ${NC}"
echo -e "${BOLD}${BLUE}=====================================================${NC}"

# ------------------------------------------------------------------------------
# 1) GNOME Shell version detection
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[1/4] Checking GNOME Shell environment...${NC}"
if ! command -v gnome-shell >/dev/null 2>&1; then
    echo -e "${RED}Error: 'gnome-shell' is not installed or not in PATH.${NC}" >&2
    exit 1
fi

SHELL_VERSION_FULL=$(gnome-shell --version)
SHELL_MAJOR=$(echo "${SHELL_VERSION_FULL}" | grep -oP '\d+' | head -n 1)

echo -e "  Detected: ${GREEN}${SHELL_VERSION_FULL}${NC} (Major: ${SHELL_MAJOR})"

if [[ -n "${SHELL_MAJOR}" ]] && (( SHELL_MAJOR < 45 )); then
    echo -e "${YELLOW}Warning: This extension uses native ESM modules designed for GNOME 45 to 51.${NC}"
    echo -e "${YELLOW}Your GNOME version (${SHELL_MAJOR}) is older than 45 and may not be compatible.${NC}"
fi

# ------------------------------------------------------------------------------
# 2) Deploy extension files
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[2/4] Deploying extension files...${NC}"
echo -e "  Target: ${BLUE}${TARGET_DIR}${NC}"

mkdir -p "${TARGET_DIR}"

if [[ -f "${SCRIPT_DIR}/${ZIP_NAME}" ]]; then
    echo -e "  Installing from package: ${ZIP_NAME}"
    if command -v unzip >/dev/null 2>&1; then
        unzip -q -o "${SCRIPT_DIR}/${ZIP_NAME}" -d "${TARGET_DIR}"
    else
        echo -e "${RED}Error: 'unzip' is required to extract ${ZIP_NAME}.${NC}" >&2
        exit 1
    fi
elif [[ -f "${SCRIPT_DIR}/metadata.json" && -f "${SCRIPT_DIR}/extension.js" ]]; then
    echo -e "  Installing directly from source files..."
    cp -f "${SCRIPT_DIR}/metadata.json" "${TARGET_DIR}/"
    cp -f "${SCRIPT_DIR}/extension.js" "${TARGET_DIR}/"
    if [[ -f "${SCRIPT_DIR}/stylesheet.css" ]]; then
        cp -f "${SCRIPT_DIR}/stylesheet.css" "${TARGET_DIR}/"
    fi

    # Compile translations if available
    if command -v msgfmt >/dev/null 2>&1 && [[ -d "${SCRIPT_DIR}/po" ]]; then
        for po in "${SCRIPT_DIR}/po"/*.po; do
            if [[ -f "${po}" ]]; then
                lang="$(basename "${po}" .po)"
                localedir="${TARGET_DIR}/locale/${lang}/LC_MESSAGES"
                mkdir -p "${localedir}"
                msgfmt -c "${po}" -o "${localedir}/${DOMAIN}.mo"
            fi
        done
    elif [[ -d "${SCRIPT_DIR}/locale" ]]; then
        cp -rf "${SCRIPT_DIR}/locale" "${TARGET_DIR}/"
    fi
else
    echo -e "${RED}Error: Source files or ${ZIP_NAME} not found in ${SCRIPT_DIR}.${NC}" >&2
    exit 1
fi

echo -e "  ${GREEN}✓ Files successfully deployed.${NC}"

# ------------------------------------------------------------------------------
# 3) Enable fractional scaling in Mutter (scale-monitor-framebuffer)
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[3/4] Checking Mutter fractional scaling support...${NC}"
MUTTER_SCHEMA="org.gnome.mutter"
FEATURE_NAME="scale-monitor-framebuffer"

CURRENT_FEATURES=$(gsettings get ${MUTTER_SCHEMA} experimental-features 2>/dev/null || echo "@as []")
MUTTER_UPDATED=false

if [[ "${CURRENT_FEATURES}" != *"${FEATURE_NAME}"* ]]; then
    echo -e "  Enabling '${FEATURE_NAME}' in ${MUTTER_SCHEMA} experimental-features..."
    if [[ "${CURRENT_FEATURES}" == "@as []" || "${CURRENT_FEATURES}" == "[]" || -z "${CURRENT_FEATURES}" ]]; then
        gsettings set ${MUTTER_SCHEMA} experimental-features "['${FEATURE_NAME}']"
    else
        UPDATED_FEATURES=$(echo "${CURRENT_FEATURES}" | sed "s/]$/, '${FEATURE_NAME}']/")
        gsettings set ${MUTTER_SCHEMA} experimental-features "${UPDATED_FEATURES}"
    fi
    echo -e "  ${GREEN}✓ Fractional scaling enabled in Mutter.${NC}"
    MUTTER_UPDATED=true
else
    echo -e "  ${GREEN}✓ '${FEATURE_NAME}' is already enabled in Mutter.${NC}"
fi

# ------------------------------------------------------------------------------
# 4) Enable extension in GNOME Shell
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}[4/4] Enabling extension in GNOME Shell...${NC}"

SHELL_SCHEMA="org.gnome.shell"
CURRENT_ENABLED=$(gsettings get ${SHELL_SCHEMA} enabled-extensions 2>/dev/null || echo "[]")
if [[ "${CURRENT_ENABLED}" != *"${UUID}"* ]]; then
    if [[ "${CURRENT_ENABLED}" == "@as []" || "${CURRENT_ENABLED}" == "[]" ]]; then
        gsettings set ${SHELL_SCHEMA} enabled-extensions "['${UUID}']"
    else
        UPDATED_ENABLED=$(echo "${CURRENT_ENABLED}" | sed "s/]$/, '${UUID}']/")
        gsettings set ${SHELL_SCHEMA} enabled-extensions "${UPDATED_ENABLED}"
    fi
    echo -e "  ${GREEN}✓ UUID registered in GSettings (${SHELL_SCHEMA}.enabled-extensions).${NC}"
else
    echo -e "  ${GREEN}✓ UUID is already registered in ${SHELL_SCHEMA}.enabled-extensions.${NC}"
fi

if command -v gnome-extensions >/dev/null 2>&1; then
    gnome-extensions disable "${UUID}" 2>/dev/null || true
    sleep 0.3
    gnome-extensions enable "${UUID}" 2>/dev/null || true
    echo -e "  ${GREEN}✓ Extension reloaded and enabled via gnome-extensions.${NC}"
fi

# ------------------------------------------------------------------------------
# Session info and recommendations
# ------------------------------------------------------------------------------
SESSION_TYPE="${XDG_SESSION_TYPE:-wayland}"
echo -e "\n${BOLD}${BLUE}=====================================================${NC}"
echo -e "${BOLD}${GREEN}   Installation completed successfully!              ${NC}"
echo -e "${BOLD}${BLUE}=====================================================${NC}"
echo -e "Detected session: ${BOLD}${SESSION_TYPE}${NC}\n"

if [[ "${SESSION_TYPE}" == "wayland" ]]; then
    if [[ "${MUTTER_UPDATED}" == "true" ]]; then
        echo -e "${YELLOW}${BOLD}IMPORTANT NOTICE (Wayland):${NC}"
        echo -e "${YELLOW}Fractional scaling was enabled for the first time in Mutter.${NC}"
        echo -e "${YELLOW}You must LOG OUT and log back in for the Wayland compositor${NC}"
        echo -e "${YELLOW}to initialize fractional framebuffer support and load the extension.${NC}"
    else
        echo -e "If the extension does not appear immediately in the top bar:"
        echo -e "  1. Open the 'Extensions' app (gnome-extensions-app) to confirm it is active."
        echo -e "  2. Or log out and log back in (Wayland)."
    fi
else
    echo -e "${GREEN}On an X11 session, you can reload GNOME Shell immediately:${NC}"
    echo -e "  Press ${BOLD}Alt + F2${NC}, type ${BOLD}r${NC} and press ${BOLD}Enter${NC}."
fi

echo -e "\nTo uninstall in the future run:"
echo -e "  ${BOLD}rm -rf ${TARGET_DIR}${NC}\n"
