import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

// D-Bus XML specification for Mutter DisplayConfig
const MutterDisplayConfigXml = `
<node>
  <interface name="org.gnome.Mutter.DisplayConfig">
    <method name="GetCurrentState">
      <arg type="u" name="serial" direction="out" />
      <arg type="a((ssss)a(siiddada{sv})a{sv})" name="monitors" direction="out" />
      <arg type="a(iiduba(ssss)a{sv})" name="logical_monitors" direction="out" />
      <arg type="a{sv}" name="properties" direction="out" />
    </method>
    <method name="ApplyMonitorsConfig">
      <arg type="u" name="serial" direction="in" />
      <arg type="u" name="method" direction="in" />
      <arg type="a(iiduba(ssa{sv}))" name="logical_monitors" direction="in" />
      <arg type="a{sv}" name="properties" direction="in" />
    </method>
    <signal name="MonitorsChanged" />
  </interface>
</node>`;

const DisplayConfigProxy = Gio.DBusProxy.makeProxyWrapper(MutterDisplayConfigXml);

// Display scaling options (Mutter fractional scaling values)
const DISPLAY_SCALES = [
    { label: '100% (1.00)', target: 1.0 },
    { label: '125% (1.25)', target: 1.25 },
    { label: '133% (1.33)', target: 4 / 3 }, // Mutter uses 1.3333333730697632
    { label: '150% (1.50)', target: 1.5 },
    { label: '166% (1.66)', target: 5 / 3 }, // Mutter uses 1.6666666269302368
    { label: '200% (2.00)', target: 2.0 },
];

// Font scaling options (org.gnome.desktop.interface text-scaling-factor)
const FONT_SCALES = [
    { label: '0.66', value: 0.66 },
    { label: '1.00 (Normal)', value: 1.0 },
    { label: '1.25', value: 1.25 },
    { label: '1.33', value: 1.33 },
    { label: '1.50', value: 1.50 },
    { label: '1.66', value: 1.66 },
    { label: '2.00', value: 2.00 },
];

// Method 2 corresponds to META_MONITORS_CONFIG_METHOD_PERSISTENT
const METHOD_PERSISTENT = 2;

const QuickScaleIndicator = GObject.registerClass(
class QuickScaleIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'Quick Scale & Font Switcher', false);
        this._extension = extension;
        this._destroyed = false;

        this._displayMenuItems = [];
        this._fontMenuItems = [];
        this._monitorsChangedId = null;
        this._fontSettingChangedId = null;
        this._openStateId = null;

        // Icono en la barra superior (Top Bar)
        const icon = new St.Icon({
            icon_name: 'preferences-desktop-display-symbolic',
            style_class: 'system-status-icon quick-scale-panel-icon',
        });
        this.add_child(icon);

        // Inicializar configuraciones GSettings de fuentes
        try {
            this._interfaceSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
        } catch (e) {
            console.error(`[QuickScale] Error conectando con org.gnome.desktop.interface: ${e.message}`);
            this._interfaceSettings = null;
        }

        // Inicializar proxy D-Bus de Mutter
        try {
            this._proxy = new DisplayConfigProxy(
                Gio.DBus.session,
                'org.gnome.Mutter.DisplayConfig',
                '/org/gnome/Mutter/DisplayConfig'
            );
        } catch (e) {
            console.error(`[QuickScale] Error inicializando DisplayConfigProxy: ${e.message}`);
            this._proxy = null;
        }

        // Construir interfaz del menú desplegable
        this._buildMenu();

        // Conectar señales para sincronización bidireccional en tiempo real
        this._connectSignals();

        // Cargar estado inicial
        this._syncDisplayScale();
        this._syncFontScale();
    }

    _buildMenu() {
        // --- Sección 1: Escala de Pantalla (Display Scaling) ---
        const displaySectionHeader = new PopupMenu.PopupSeparatorMenuItem(_('Escala de pantalla'));
        displaySectionHeader.actor.add_style_class_name('quick-scale-header');
        this.menu.addMenuItem(displaySectionHeader);

        for (const scaleOpt of DISPLAY_SCALES) {
            const item = new PopupMenu.PopupMenuItem(scaleOpt.label);
            item.connect('activate', () => this._onDisplayScaleSelected(scaleOpt));
            this.menu.addMenuItem(item);
            this._displayMenuItems.push({ item, target: scaleOpt.target });
        }

        // --- Sección 2: Escala de Fuentes (Text Scaling Factor) ---
        const fontSectionHeader = new PopupMenu.PopupSeparatorMenuItem(_('Escala de fuentes'));
        fontSectionHeader.actor.add_style_class_name('quick-scale-header');
        this.menu.addMenuItem(fontSectionHeader);

        for (const fontOpt of FONT_SCALES) {
            const item = new PopupMenu.PopupMenuItem(fontOpt.label);
            item.connect('activate', () => this._onFontScaleSelected(fontOpt.value));
            this.menu.addMenuItem(item);
            this._fontMenuItems.push({ item, value: fontOpt.value });
        }

        // --- Separador y acceso a Configuración de Pantalla de GNOME ---
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const settingsItem = new PopupMenu.PopupMenuItem(_('Configuración de pantalla…'));
        settingsItem.connect('activate', () => {
            try {
                const app = Gio.AppInfo.create_from_commandline(
                    'gnome-control-center display',
                    null,
                    Gio.AppInfoCreateFlags.NONE
                );
                app.launch([], null);
            } catch (err) {
                console.error(`[QuickScale] Error abriendo gnome-control-center: ${err.message}`);
            }
        });
        this.menu.addMenuItem(settingsItem);
    }

    _connectSignals() {
        // Sincronizar al abrir el menú
        this._openStateId = this.menu.connect('open-state-changed', (menu, isOpen) => {
            if (isOpen && !this._destroyed) {
                this._syncDisplayScale();
                this._syncFontScale();
            }
        });

        // Sincronizar cambios externos en Mutter (MonitorsChanged)
        if (this._proxy) {
            this._monitorsChangedId = this._proxy.connectSignal('MonitorsChanged', () => {
                if (!this._destroyed) {
                    this._syncDisplayScale();
                }
            });
        }

        // Sincronizar cambios externos en factor de escala de fuentes
        if (this._interfaceSettings) {
            this._fontSettingChangedId = this._interfaceSettings.connect(
                'changed::text-scaling-factor',
                () => {
                    if (!this._destroyed) {
                        this._syncFontScale();
                    }
                }
            );
        }
    }

    _syncFontScale() {
        if (!this._interfaceSettings || this._destroyed) return;

        try {
            const currentFontScale = this._interfaceSettings.get_double('text-scaling-factor');
            for (const { item, value } of this._fontMenuItems) {
                const isActive = Math.abs(currentFontScale - value) < 0.02;
                item.setOrnament(isActive ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
            }
        } catch (err) {
            console.error(`[QuickScale] Error al leer text-scaling-factor: ${err.message}`);
        }
    }

    _onFontScaleSelected(scaleValue) {
        if (!this._interfaceSettings || this._destroyed) return;

        try {
            this._interfaceSettings.set_double('text-scaling-factor', scaleValue);
        } catch (err) {
            console.error(`[QuickScale] Error al escribir text-scaling-factor: ${err.message}`);
            Main.notify('Quick Scale Switcher', _('Error ajustando escala de fuentes: %s').format(err.message));
        }
    }

    _syncDisplayScale() {
        if (!this._proxy || this._destroyed) return;

        this._proxy.GetCurrentStateRemote((result, error) => {
            if (error || this._destroyed) {
                if (error) {
                    console.error(`[QuickScale] Error en GetCurrentState: ${error.message}`);
                }
                return;
            }

            try {
                const [, , logicalMonitors] = result;
                if (!logicalMonitors || logicalMonitors.length === 0) return;

                // Identificar el monitor principal
                const primaryLm = logicalMonitors.find(lm => lm[4] === true) || logicalMonitors[0];
                const currentScale = primaryLm[2];

                for (const { item, target } of this._displayMenuItems) {
                    const isActive = Math.abs(currentScale - target) < 0.04;
                    item.setOrnament(isActive ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
                }
            } catch (err) {
                console.error(`[QuickScale] Error procesando estado de pantallas: ${err.message}`);
            }
        });
    }

    _onDisplayScaleSelected(scaleOption) {
        if (!this._proxy || this._destroyed) return;

        this._proxy.GetCurrentStateRemote((result, error) => {
            if (error || this._destroyed) {
                if (error) {
                    console.error(`[QuickScale] Error al obtener estado previo a aplicar escala: ${error.message}`);
                }
                return;
            }

            try {
                const [serial, monitors, logicalMonitors] = result;
                if (!logicalMonitors || logicalMonitors.length === 0) return;

                const primaryIndex = logicalMonitors.findIndex(lm => lm[4] === true);
                const targetIndex = primaryIndex >= 0 ? primaryIndex : 0;
                const primaryLm = logicalMonitors[targetIndex];
                const primaryConnector = primaryLm[5]?.[0]?.[0];

                // Buscar el modo actual del monitor principal para obtener resolución y supported_scales
                let primaryCurrentMode = null;
                for (const m of monitors) {
                    if (m[0][0] === primaryConnector) {
                        for (const mode of m[1]) {
                            const modeProps = mode[6];
                            const isCurrent = modeProps['is-current']?.deepUnpack?.() ?? (modeProps['is-current'] === true);
                            if (isCurrent) {
                                primaryCurrentMode = mode;
                                break;
                            }
                        }
                        break;
                    }
                }

                // Ajustar al valor exacto soportado por Mutter (por ej. 1.3333333730697632 o 1.6666666269302368)
                let exactScale = scaleOption.target;
                if (primaryCurrentMode && Array.isArray(primaryCurrentMode[5])) {
                    const supported = primaryCurrentMode[5].map(s => (s?.deepUnpack ? s.deepUnpack() : s));
                    let closest = null;
                    let minDiff = Infinity;
                    for (const s of supported) {
                        const diff = Math.abs(s - scaleOption.target);
                        if (diff < minDiff) {
                            minDiff = diff;
                            closest = s;
                        }
                    }
                    if (minDiff < 0.05 && closest !== null) {
                        exactScale = closest;
                    }
                }

                // Cálculo de desplazamiento en layouts multimonitor para evitar superposiciones inválidas
                const oldScale = primaryLm[2];
                const modeW = primaryCurrentMode ? primaryCurrentMode[1] : 0;
                const modeH = primaryCurrentMode ? primaryCurrentMode[2] : 0;

                let deltaW = 0;
                let deltaH = 0;
                if (modeW > 0 && oldScale > 0 && exactScale > 0) {
                    const oldLogicalW = Math.round(modeW / oldScale);
                    const newLogicalW = Math.round(modeW / exactScale);
                    deltaW = newLogicalW - oldLogicalW;

                    const oldLogicalH = Math.round(modeH / oldScale);
                    const newLogicalH = Math.round(modeH / exactScale);
                    deltaH = newLogicalH - oldLogicalH;
                }

                // Reconstruir la configuración de monitores lógicos preservando resolución nativa y refresco
                const newLogicalMonitors = logicalMonitors.map((lm, idx) => {
                    const [x, y, scale, transform, isPrimary, lmMonitors] = lm;
                    const isTarget = idx === targetIndex;

                    let newX = x;
                    let newY = y;

                    // Desplazar monitores adyacentes a la derecha o abajo si la escala del principal cambia
                    if (!isTarget && deltaW !== 0 && oldScale > 0) {
                        if (x >= Math.round(modeW / oldScale)) {
                            newX = Math.max(0, x + deltaW);
                        }
                    }
                    if (!isTarget && deltaH !== 0 && oldScale > 0) {
                        if (y >= Math.round(modeH / oldScale)) {
                            newY = Math.max(0, y + deltaH);
                        }
                    }

                    const newScale = isTarget ? exactScale : scale;

                    const newLmMonitors = lmMonitors.map(mon => {
                        const connector = mon[0];
                        let currentModeId = '';

                        for (const m of monitors) {
                            if (m[0][0] === connector) {
                                for (const mode of m[1]) {
                                    const mProps = mode[6];
                                    const isCur = mProps['is-current']?.deepUnpack?.() ?? (mProps['is-current'] === true);
                                    if (isCur) {
                                        currentModeId = mode[0];
                                        break;
                                    }
                                }
                                if (!currentModeId && m[1].length > 0) {
                                    currentModeId = m[1][0][0];
                                }
                                break;
                            }
                        }

                        return [connector, currentModeId, {}];
                    });

                    return [newX, newY, newScale, transform, isPrimary, newLmMonitors];
                });

                // Aplicar de forma persistente en Mutter
                this._proxy.ApplyMonitorsConfigRemote(
                    serial,
                    METHOD_PERSISTENT,
                    newLogicalMonitors,
                    {},
                    (applyResult, applyError) => {
                        if (applyError) {
                            console.error(`[QuickScale] Error aplicando configuración de pantalla: ${applyError.message}`);
                            Main.notify(
                                'Quick Scale Switcher',
                                _('Error aplicando escala. Asegúrate de habilitar el escalado fraccionario en Mutter:\n%s').format(applyError.message)
                            );
                            return;
                        }
                        this._syncDisplayScale();
                    }
                );
            } catch (err) {
                console.error(`[QuickScale] Error preparando ApplyMonitorsConfig: ${err.message}`);
            }
        });
    }

    destroy() {
        this._destroyed = true;

        if (this._openStateId) {
            this.menu.disconnect(this._openStateId);
            this._openStateId = null;
        }

        if (this._monitorsChangedId && this._proxy) {
            this._proxy.disconnectSignal(this._monitorsChangedId);
            this._monitorsChangedId = null;
        }
        this._proxy = null;

        if (this._fontSettingChangedId && this._interfaceSettings) {
            this._interfaceSettings.disconnect(this._fontSettingChangedId);
            this._fontSettingChangedId = null;
        }
        this._interfaceSettings = null;

        this._displayMenuItems = [];
        this._fontMenuItems = [];

        super.destroy();
    }
});

export default class QuickScaleExtension extends Extension {
    enable() {
        this._indicator = new QuickScaleIndicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator, 1, 'right');
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
