# Quick Scale & Font Switcher (`quick-scale-switcher@local`)

Extensión ultracompacta y moderna para **GNOME Shell** (compatible con **GNOME 45 a 51**, arquitectura ESM nativa sobre Wayland y X11) que añade un menú en el panel superior para cambiar con un solo clic la escala de pantalla (fraccionaria) y el tamaño de fuentes del sistema.

---

## 📸 Interfaz del Menú

```text
┌──────────────────────────────────────────────┐
│  🖥️ Escala de pantalla              133%     │
│  ┌──────────┬──────────┬──────────┐          │
│  │   100%   │   125%   │  133% *  │  (Azul)  │
│  ├──────────┼──────────┼──────────┤          │
│  │   150%   │   166%   │   200%   │          │
│  └──────────┴──────────┴──────────┘          │
│                                              │
│  🔤 Escala de fuentes                1.00    │
│  ┌───────┬───────┬───────┬────────┐          │
│  │ 0.66  │ 1.00* │ 1.25  │  1.33  │  (Azul)  │
│  ├───────┼───────┼───────┼────────┤          │
│  │ 1.50  │ 1.66  │ 2.00  │  ↺ 1x  │  (Reset) │
│  └───────┴───────┴───────┴────────┘          │
├──────────────────────────────────────────────┤
│  🛡️ Confirmar cambios (20s)   [ OFF/ON ]     │
│  ⚙️ Configuración de pantalla…               │
└──────────────────────────────────────────────┘
```

---

## 🚀 Características

1. **Cuadrícula de pastillas segmentadas (Un solo clic):**
   - **Escala de Pantalla:** Botones dedicados para **100%**, **125%**, **133%**, **150%**, **166%** y **200%**.
   - **Escala de Fuentes:** Botones dedicados para **0.66**, **1.00**, **1.25**, **1.33**, **1.50**, **1.66** y **2.00**.
   - El botón seleccionado se ilumina automáticamente en **azul de acento Adwaita (`#3584e4`)**.

2. **Botón de reinicio rápido `[ ↺ 1x ]`:**
   - Integrado directamente en la cuadrícula de fuentes para restablecer tanto la pantalla al 100% como las fuentes a 1.00 con un solo toque.

3. **Modo Seguro / Confirmación en 20s configurable:**
   - **Desactivado (por defecto - Instantáneo):** El cambio se aplica al instante sin ninguna ventana modal.
   - **Activado:** Desencadena el diálogo de confirmación nativo de GNOME (*"¿Quiere mantener esta configuración de la pantalla? La configuración se revertirá en 20 segundos"*).

4. **Integración nativa con Mutter D-Bus y GSettings:**
   - Comunicación completamente asíncrona (1-2 ms de latencia, 0% de uso de CPU en reposo).
   - Ajuste de precisión a las escalas soportadas por Mutter (por ejemplo `1.33333337` o `1.66666663`).
   - Reposicionamiento automático en configuraciones multimonitor para evitar solapamientos.

---

## 📦 Instalación

### Método 1: Desde GitHub Releases (Recomendado)
1. Descarga el paquete `quick-scale-switcher@local.shell-extension.zip` desde la sección de [Releases de GitHub](https://github.com/maestebanc/EscalaGnome/releases).
2. Abre un terminal en la carpeta donde descargaste el archivo y ejecuta:
   ```bash
   gnome-extensions install --force quick-scale-switcher@local.shell-extension.zip
   gnome-extensions enable quick-scale-switcher@local
   ```
3. Cierra la sesión y vuelve a iniciarla (en Wayland) para que GNOME Shell cargue la extensión.

### Método 2: Clonando el repositorio
```bash
git clone https://github.com/maestebanc/EscalaGnome.git
cd EscalaGnome
./install.sh
```

El script `install.sh` se encarga automáticamente de:
- Habilitar el soporte de escalado fraccionario en Mutter (`scale-monitor-framebuffer`).
- Copiar los archivos a `~/.local/share/gnome-shell/extensions/quick-scale-switcher@local/`.
- Habilitar la extensión en GNOME Shell.

---

## 🛠️ Requisitos del Sistema

- **GNOME Shell 45 a 51** (Fedora, Arch Linux, Ubuntu 23.10+, Debian 13+, etc.).
- **Wayland** (recomendado para escalado fraccionario independiente por monitor) o **X11**.

---

## 📂 Estructura del Proyecto

```text
EscalaGnome/
├── metadata.json       # Manifiesto de la extensión (GNOME 45-51)
├── extension.js        # Lógica de la extensión (GJS / ESM nativo)
├── stylesheet.css      # Estilos Adwaita y pastillas segmentadas
├── pack.sh             # Script para empaquetar el .zip oficial
├── install.sh          # Instalador automatizado universal
├── .gitignore          # Archivos excluidos de Git
└── README.md           # Documentación
```

---

## 📦 Generar nuevo paquete .zip

Si haces modificaciones en el código, puedes generar el paquete actualizado ejecutando:

```bash
./pack.sh
```

---

## 🗑️ Desinstalación

```bash
gnome-extensions disable quick-scale-switcher@local
rm -rf ~/.local/share/gnome-shell/extensions/quick-scale-switcher@local
```
