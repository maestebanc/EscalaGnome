# Quick Scale & Font Switcher (`quick-scale-switcher@local`)

[![GNOME Shell](https://img.shields.io/badge/GNOME%20Shell-45%20to%2051-blue.svg)](https://gitlab.gnome.org/GNOME/gnome-shell)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPLv3-green.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Platform](https://img.shields.io/badge/Platform-Wayland%20%7C%20X11-purple.svg)]()

An ultra-compact, native GNOME Shell extension that provides a top panel menu to instantly switch display scaling (fractional scaling via Mutter D-Bus) and text scaling factor in a single click.

---

## 📸 Menu Layout

```text
┌──────────────────────────────────────────────┐
│  🖥️ Display scale                    133%    │
│  ┌──────────┬──────────┬──────────┐          │
│  │   100%   │   125%   │  133% *  │  (Blue)  │
│  ├──────────┼──────────┼──────────┤          │
│  │   150%   │   166%   │   200%   │          │
│  └──────────┴──────────┴──────────┘          │
│                                              │
│  🔤 Font scale                       1.00    │
│  ┌───────┬───────┬───────┬────────┐          │
│  │ 0.66  │ 1.00* │ 1.25  │  1.33  │  (Blue)  │
│  ├───────┼───────┼───────┼────────┤          │
│  │ 1.50  │ 1.66  │ 2.00  │  ↺ 1x  │  (Reset) │
│  └───────┴───────┴───────┴────────┘          │
├──────────────────────────────────────────────┤
│  🛡️ Confirm display changes (20s) [OFF/ON]   │
│  ⚙️ Display Settings…                        │
└──────────────────────────────────────────────┘
```

---

## 🚀 Features

* **Segmented Pill Grid (Single-click access):**
  - **Display Scaling:** Dedicated buttons for **100%**, **125%**, **133%**, **150%**, **166%**, and **200%**.
  - **Font Scaling:** Dedicated buttons for **0.66**, **1.00**, **1.25**, **1.33**, **1.50**, **1.66**, and **2.00**.
  - The currently active scale is illuminated with GNOME's native Adwaita blue accent (`#3584e4`).
* **Quick Reset Button `[ ↺ 1x ]`:**
  - Integrated into the font grid to reset both display scaling to 100% and text scale to 1.00 in a single tap.
* **Configurable Safe Mode (20s Confirmation):**
  - **Off (Default / Instant):** Applies scale changes immediately without any modal prompts.
  - **On (Safe Mode):** Triggers GNOME Shell's native confirmation dialog (*"Keep these display settings? The settings will revert in 20 seconds"*).
* **Internationalization (i18n):**
  - Adapts automatically to your system locale.
  - Built-in support for **English** and **Spanish** (`es`).
  - English is the default fallback for all other languages.
* **High Performance Mutter D-Bus Integration:**
  - Fully asynchronous D-Bus communication (`org.gnome.Mutter.DisplayConfig`), operating with 1–2 ms latency and 0% CPU consumption when idle.
  - Automatic precision alignment with Mutter's exact supported scales (e.g. `1.33333337` or `1.66666663`).
  - Multi-monitor coordinate adjustment to prevent logical monitor overlap.

---

## 📦 Installation

### Method 1: From GitHub Releases (Recommended)

1. Download `quick-scale-switcher@local.shell-extension.zip` from [GitHub Releases](https://github.com/maestebanc/EscalaGnome/releases).
2. Open a terminal in your download folder and run:
   ```bash
   gnome-extensions install --force quick-scale-switcher@local.shell-extension.zip
   gnome-extensions enable quick-scale-switcher@local
   ```
3. On Wayland sessions, log out and log back in for GNOME Shell to load the extension module.

### Method 2: Clone and Run Installer

```bash
git clone https://github.com/maestebanc/EscalaGnome.git
cd EscalaGnome
./install.sh
```

The `./install.sh` script automatically:
* Enables Mutter fractional scaling support (`scale-monitor-framebuffer`).
* Compiles gettext translations.
* Deploys files to `~/.local/share/gnome-shell/extensions/quick-scale-switcher@local/`.
* Registers and enables the extension in GNOME Shell.

---

## 🛠️ System Requirements

* **GNOME Shell:** Versions 45, 46, 47, 48, 49, 50, and 51.
* **Display Server:** Wayland (recommended for per-monitor fractional scaling) or X11.

---

## 📂 Repository Structure

```text
EscalaGnome/
├── metadata.json       # Extension manifest (GNOME 45-51, gettext domain)
├── extension.js        # Core extension logic (native ESM, Mutter D-Bus, GSettings)
├── stylesheet.css      # Adwaita-themed styles and pill buttons
├── po/                 # Translation sources (POTFILES.in, template, es.po)
├── locale/             # Compiled gettext catalogs (LC_MESSAGES)
├── pack.sh             # Extension packaging script (.shell-extension.zip)
├── install.sh          # Universal installation script
└── README.md           # Documentation
```

---

## 🔨 Packaging

To build the extension archive:

```bash
./pack.sh
```

This generates `quick-scale-switcher@local.shell-extension.zip` with all compiled translation catalogs ready for distribution.

---

## 🗑️ Uninstallation

```bash
gnome-extensions disable quick-scale-switcher@local
rm -rf ~/.local/share/gnome-shell/extensions/quick-scale-switcher@local
```

---

## 📄 License

GPL-3.0-or-later. See GNOME Shell extension licensing guidelines.
