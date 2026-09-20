# Quick Scale & Font Switcher (`quick-scale-switcher@local`)

Extensión para **GNOME Shell** (compatible con **GNOME 45 a 51**, arquitectura ESM nativa sobre Wayland y X11) que añade un menú en el panel superior para alternar con rapidez la escala de pantalla (fraccionaria) y el tamaño de fuentes del sistema.

---

## 🚀 Características

1. **Escala de Pantalla (Display Fractional Scaling):**
   - Opciones: **100% (1.00)**, **125% (1.25)**, **133% (1.33)**, **150% (1.50)**, **166% (1.66)** y **200% (2.00)**.
   - **Backend:** Comunicación nativa por D-Bus con `org.gnome.Mutter.DisplayConfig` (`GetCurrentState` y `ApplyMonitorsConfig`), preservando la resolución nativa, tasa de refresco y disposición geométrica del monitor principal activo.
   - Ajuste inteligente de valores exactos de Mutter (por ejemplo `1.33333337` o `1.66666663`) y reposicionamiento automático en configuraciones multimonitor para evitar solapamientos.

2. **Escala de Fuentes (Text Scaling Factor):**
   - Opciones: **0.66**, **1.00 (Normal)**, **1.25**, **1.33**, **1.50**, **1.66** y **2.00**.
   - **Backend:** `Gio.Settings` en el esquema `org.gnome.desktop.interface` (clave `text-scaling-factor`).

3. **Sincronización Bidireccional en Tiempo Real:**
   - Indicador visual (`✓` checkmark) junto a la opción activa.
   - Escucha reactiva de las señales `MonitorsChanged` de Mutter y `changed::text-scaling-factor` de GSettings si los valores cambian desde la configuración del sistema.
   - Limpieza rigurosa de señales y referencias en `disable()` para evitar fugas de memoria o llamadas huérfanas.

---

## 📂 Estructura del Repositorio

```text
/home/maec/GIT/EscalaGnome/
├── metadata.json       # Manifiesto de la extensión (GNOME 45-51)
├── extension.js        # Lógica ESM nativa e integración con Mutter / GSettings
├── stylesheet.css      # Estilos Adwaita (adaptación claro/oscuro)
├── pack.sh             # Script de empaquetado (.shell-extension.zip)
├── install.sh          # Script universal de instalación y despliegue
├── .gitignore          # Reglas de exclusión de Git
└── README.md           # Documentación del proyecto
```

---

## 🛠️ Requisitos Previos

- **GNOME Shell 45 o superior** (45, 46, 47, 48, 49, 50, 51).
- **Wayland** (recomendado para escalado fraccionario independiente por monitor) o **X11**.
- Herramientas estándar del sistema: `gsettings`, `gnome-shell`, `unzip` (opcional: `gnome-extensions`).

---

## ⚡ Instalación Rápida Local

Ejecuta el script de instalación en este equipo:

```bash
cd /home/maec/GIT/EscalaGnome
./install.sh
```

El script se encargará automáticamente de:
1. Validar la versión de GNOME Shell instalada.
2. Copiar los archivos a `~/.local/share/gnome-shell/extensions/quick-scale-switcher@local/`.
3. Activar el soporte de escalado fraccionario en Mutter si no estaba activo:
   ```bash
   gsettings set org.gnome.mutter experimental-features "['scale-monitor-framebuffer']"
   ```
4. Habilitar la extensión con `gnome-extensions enable quick-scale-switcher@local`.

> [!NOTE]
> En sesiones **Wayland**, si es la primera vez que activas el escalado fraccionario en Mutter o instalas la extensión, es necesario **cerrar la sesión** y volver a iniciarla para que el compositor active el soporte de framebuffer fraccionario.

---

## 📦 Empaquetado

Para generar el paquete `.zip` listo para distribución o instalación offline:

```bash
./pack.sh
```

Esto generará el archivo:
```text
quick-scale-switcher@local.shell-extension.zip
```

El script utiliza de forma preferente `gnome-extensions pack` y dispone de un fallback automático con `zip` excluyendo archivos de control de versiones y scripts auxiliares.

---

## 🌐 Despliegue en Otras Máquinas

Para instalar esta extensión en cualquier otro ordenador con GNOME 45 a 51:

### Opción A: Mediante el repositorio Git
```bash
git clone https://github.com/maec/EscalaGnome.git
cd EscalaGnome
./install.sh
```

### Opción B: Copiando solo el paquete `.zip` e `install.sh`
1. Copia a la otra máquina `quick-scale-switcher@local.shell-extension.zip` e `install.sh` en una misma carpeta.
2. Ejecuta en esa carpeta:
   ```bash
   chmod +x install.sh
   ./install.sh
   ```

### Opción C: Instalación manual con `gnome-extensions`
```bash
gnome-extensions install --force quick-scale-switcher@local.shell-extension.zip
gnome-extensions enable quick-scale-switcher@local
```

---

## 🔍 Depuración y Registro de Logs

Para ver los registros en tiempo real emitidos por la extensión:

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep QuickScale
```

---

## 🗑️ Desinstalación

Para desinstalar la extensión de tu usuario:

```bash
gnome-extensions disable quick-scale-switcher@local
rm -rf ~/.local/share/gnome-shell/extensions/quick-scale-switcher@local
```
