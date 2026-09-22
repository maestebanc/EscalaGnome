import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

// Constantes D-Bus de Mutter DisplayConfig
const MUTTER_BUS_NAME = 'org.gnome.Mutter.DisplayConfig';
const MUTTER_OBJECT_PATH = '/org/gnome/Mutter/DisplayConfig';
const MUTTER_INTERFACE = 'org.gnome.Mutter.DisplayConfig';

// Pasos discretos de escala de pantalla
const DISPLAY_SCALES = [
    { label: '100% (1.00)', target: 1.0 },
    { label: '125% (1.25)', target: 1.25 },
    { label: '133% (1.33)', target: 4 / 3 }, // Mutter: 1.3333333730697632
    { label: '150% (1.50)', target: 1.5 },
    { label: '166% (1.66)', target: 5 / 3 }, // Mutter: 1.6666666269302368
    { label: '200% (2.00)', target: 2.0 },
];

// Pasos discretos de escala de fuentes
const FONT_SCALES = [
    { label: '0.66', value: 0.66 },
    { label: '1.00 (Normal)', value: 1.0 },
    { label: '1.25', value: 1.25 },
    { label: '1.33', value: 1.33 },
    { label: '1.50', value: 1.50 },
    { label: '1.66', value: 1.66 },
    { label: '2.00', value: 2.00 },
];

// Método 2 = META_MONITORS_CONFIG_METHOD_PERSISTENT
const METHOD_PERSISTENT = 2;

const QuickScaleIndicator = GObject.registerClass(
class QuickScaleIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'Quick Scale & Font Switcher', false);
        this._extension = extension;
        this._destroyed = false;

        // Índices activos y flags de bloqueo para sincronización de sliders
        this._displayCurrentIndex = 0;
        this._fontCurrentIndex = 1;
        this._blockDisplaySliderSignal = false;
        this._blockFontSliderSignal = false;
        this._displayScaleTimeoutId = null;
        this._fontScaleTimeoutId = null;

        this._monitorsChangedId = null;
        this._fontSettingChangedId = null;
        this._openStateId = null;

        // Contenedor principal con estilo nativo de panel
        const box = new St.BoxLayout({
            style_class: 'panel-status-indicators-box',
            reactive: true,
            can_focus: true,
            track_hover: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        // Icono en la barra superior (Top Bar)
        const icon = new St.Icon({
            icon_name: 'preferences-desktop-display-symbolic',
            style_class: 'system-status-icon quick-scale-panel-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(icon);
        this.add_child(box);

        // Inicializar GSettings de fuentes
        try {
            this._interfaceSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
        } catch (e) {
            console.error(`[QuickScale] Error conectando con org.gnome.desktop.interface: ${e.message}`);
            this._interfaceSettings = null;
        }

        // Construir interfaz rediseñada con deslizadores y botones paso a paso
        this._buildMenu();

        // Conectar señales D-Bus y GSettings
        this._connectSignals();

        // Cargar estado inicial
        this._syncFontScale();
        this._syncDisplayScale();
    }

    _buildMenu() {
        // =========================================================================
        // SECCIÓN 1: Deslizador de Escala de Pantalla
        // =========================================================================
        const displaySection = new PopupMenu.PopupMenuSection();

        // Fila 1: Encabezado con Icono, Título y Badge con valor actual
        const displayHeaderItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'quick-scale-header-item',
        });
        const displayHeaderBox = new St.BoxLayout({
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'quick-scale-header-box',
        });

        const displayIcon = new St.Icon({
            icon_name: 'video-display-symbolic',
            style_class: 'popup-menu-icon quick-scale-header-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        displayHeaderBox.add_child(displayIcon);

        const displayTitle = new St.Label({
            text: _('Escala de pantalla'),
            style_class: 'quick-scale-header-title',
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        displayHeaderBox.add_child(displayTitle);

        this._displayBadge = new St.Label({
            text: DISPLAY_SCALES[0].label,
            style_class: 'quick-scale-badge',
            y_align: Clutter.ActorAlign.CENTER,
        });
        displayHeaderBox.add_child(this._displayBadge);

        displayHeaderItem.add_child(displayHeaderBox);
        displaySection.addMenuItem(displayHeaderItem);

        // Fila 2: Controles [-] Deslizador [+]
        const displaySliderItem = new PopupMenu.PopupBaseMenuItem({
            activate: false,
            can_focus: false,
            style_class: 'quick-scale-slider-item',
        });
        const displaySliderBox = new St.BoxLayout({
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'quick-scale-slider-box',
        });

        const displayMinusBtn = new St.Button({
            style_class: 'button quick-scale-step-button',
            child: new St.Icon({
                icon_name: 'zoom-out-symbolic',
                style_class: 'popup-menu-icon',
            }),
            y_align: Clutter.ActorAlign.CENTER,
            can_focus: true,
        });
        displayMinusBtn.connect('clicked', () => this._stepDisplayScale(-1));
        displaySliderBox.add_child(displayMinusBtn);

        this._displaySlider = new Slider.Slider(0);
        this._displaySlider.x_expand = true;
        this._displaySlider.y_align = Clutter.ActorAlign.CENTER;
        for (let i = 0; i < DISPLAY_SCALES.length; i++) {
            this._displaySlider.addMark(i / (DISPLAY_SCALES.length - 1));
        }

        this._displaySlider.connect('notify::value', () => {
            if (this._blockDisplaySliderSignal) return;
            const stepIndex = Math.round(this._displaySlider.value * (DISPLAY_SCALES.length - 1));
            this._displayBadge.text = DISPLAY_SCALES[stepIndex].label;
            this._displayCurrentIndex = stepIndex;
            this._scheduleApplyDisplayScale(stepIndex);
        });

        this._displaySlider.connect('drag-end', () => {
            if (this._blockDisplaySliderSignal) return;
            const stepIndex = Math.round(this._displaySlider.value * (DISPLAY_SCALES.length - 1));
            this._blockDisplaySliderSignal = true;
            this._displaySlider.value = stepIndex / (DISPLAY_SCALES.length - 1);
            this._blockDisplaySliderSignal = false;
            this._applyDisplayScaleNow(stepIndex);
        });

        displaySliderBox.add_child(this._displaySlider);

        const displayPlusBtn = new St.Button({
            style_class: 'button quick-scale-step-button',
            child: new St.Icon({
                icon_name: 'zoom-in-symbolic',
                style_class: 'popup-menu-icon',
            }),
            y_align: Clutter.ActorAlign.CENTER,
            can_focus: true,
        });
        displayPlusBtn.connect('clicked', () => this._stepDisplayScale(1));
        displaySliderBox.add_child(displayPlusBtn);

        displaySliderItem.add_child(displaySliderBox);
        displaySection.addMenuItem(displaySliderItem);
        this.menu.addMenuItem(displaySection);

        // =========================================================================
        // SECCIÓN 2: Deslizador de Escala de Fuentes
        // =========================================================================
        const fontSection = new PopupMenu.PopupMenuSection();

        // Fila 1: Encabezado con Icono, Título y Badge de fuentes
        const fontHeaderItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'quick-scale-header-item',
        });
        const fontHeaderBox = new St.BoxLayout({
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'quick-scale-header-box',
        });

        const fontIcon = new St.Icon({
            icon_name: 'format-text-larger-symbolic',
            style_class: 'popup-menu-icon quick-scale-header-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        fontHeaderBox.add_child(fontIcon);

        const fontTitle = new St.Label({
            text: _('Escala de fuentes'),
            style_class: 'quick-scale-header-title',
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        fontHeaderBox.add_child(fontTitle);

        this._fontBadge = new St.Label({
            text: FONT_SCALES[1].label,
            style_class: 'quick-scale-badge',
            y_align: Clutter.ActorAlign.CENTER,
        });
        fontHeaderBox.add_child(this._fontBadge);

        fontHeaderItem.add_child(fontHeaderBox);
        fontSection.addMenuItem(fontHeaderItem);

        // Fila 2: Controles [a-] Deslizador [A+]
        const fontSliderItem = new PopupMenu.PopupBaseMenuItem({
            activate: false,
            can_focus: false,
            style_class: 'quick-scale-slider-item',
        });
        const fontSliderBox = new St.BoxLayout({
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'quick-scale-slider-box',
        });

        const fontMinusBtn = new St.Button({
            style_class: 'button quick-scale-step-button',
            child: new St.Icon({
                icon_name: 'format-text-smaller-symbolic',
                style_class: 'popup-menu-icon',
            }),
            y_align: Clutter.ActorAlign.CENTER,
            can_focus: true,
        });
        fontMinusBtn.connect('clicked', () => this._stepFontScale(-1));
        fontSliderBox.add_child(fontMinusBtn);

        this._fontSlider = new Slider.Slider(0);
        this._fontSlider.x_expand = true;
        this._fontSlider.y_align = Clutter.ActorAlign.CENTER;
        for (let i = 0; i < FONT_SCALES.length; i++) {
            this._fontSlider.addMark(i / (FONT_SCALES.length - 1));
        }

        this._fontSlider.connect('notify::value', () => {
            if (this._blockFontSliderSignal) return;
            const stepIndex = Math.round(this._fontSlider.value * (FONT_SCALES.length - 1));
            this._fontBadge.text = FONT_SCALES[stepIndex].label;
            this._fontCurrentIndex = stepIndex;
            this._scheduleApplyFontScale(stepIndex);
        });

        this._fontSlider.connect('drag-end', () => {
            if (this._blockFontSliderSignal) return;
            const stepIndex = Math.round(this._fontSlider.value * (FONT_SCALES.length - 1));
            this._blockFontSliderSignal = true;
            this._fontSlider.value = stepIndex / (FONT_SCALES.length - 1);
            this._blockFontSliderSignal = false;
            this._applyFontScaleNow(stepIndex);
        });

        fontSliderBox.add_child(this._fontSlider);

        const fontPlusBtn = new St.Button({
            style_class: 'button quick-scale-step-button',
            child: new St.Icon({
                icon_name: 'format-text-larger-symbolic',
                style_class: 'popup-menu-icon',
            }),
            y_align: Clutter.ActorAlign.CENTER,
            can_focus: true,
        });
        fontPlusBtn.connect('clicked', () => this._stepFontScale(1));
        fontSliderBox.add_child(fontPlusBtn);

        fontSliderItem.add_child(fontSliderBox);
        fontSection.addMenuItem(fontSliderItem);
        this.menu.addMenuItem(fontSection);

        // =========================================================================
        // SECCIÓN 3: Separador y Acciones Rápidas
        // =========================================================================
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Botón Restablecer valores predeterminados (100% y 1.00)
        const resetItem = new PopupMenu.PopupImageMenuItem(
            _('Restablecer valores por defecto (100% / 1.00)'),
            'edit-undo-symbolic'
        );
        resetItem.connect('activate', () => {
            this._onFontScaleSelected(1.0);
            const defaultDisplay = DISPLAY_SCALES.find(s => s.target === 1.0) || DISPLAY_SCALES[0];
            this._onDisplayScaleSelected(defaultDisplay);
        });
        this.menu.addMenuItem(resetItem);

        // Acceso directo a Configuración de Pantalla de GNOME
        const settingsItem = new PopupMenu.PopupImageMenuItem(
            _('Configuración de pantalla…'),
            'preferences-system-symbolic'
        );
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

    _stepDisplayScale(delta) {
        const newIndex = Math.clamp(this._displayCurrentIndex + delta, 0, DISPLAY_SCALES.length - 1);
        if (newIndex === this._displayCurrentIndex) return;

        this._displayCurrentIndex = newIndex;
        this._blockDisplaySliderSignal = true;
        this._displaySlider.value = newIndex / (DISPLAY_SCALES.length - 1);
        this._blockDisplaySliderSignal = false;

        this._displayBadge.text = DISPLAY_SCALES[newIndex].label;
        this._applyDisplayScaleNow(newIndex);
    }

    _scheduleApplyDisplayScale(stepIndex) {
        if (this._displayScaleTimeoutId) {
            GLib.source_remove(this._displayScaleTimeoutId);
            this._displayScaleTimeoutId = null;
        }
        this._displayScaleTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
            this._displayScaleTimeoutId = null;
            this._applyDisplayScaleNow(stepIndex);
            return GLib.SOURCE_REMOVE;
        });
    }

    _applyDisplayScaleNow(stepIndex) {
        if (this._displayScaleTimeoutId) {
            GLib.source_remove(this._displayScaleTimeoutId);
            this._displayScaleTimeoutId = null;
        }
        this._onDisplayScaleSelected(DISPLAY_SCALES[stepIndex]);
    }

    _stepFontScale(delta) {
        const newIndex = Math.clamp(this._fontCurrentIndex + delta, 0, FONT_SCALES.length - 1);
        if (newIndex === this._fontCurrentIndex) return;

        this._fontCurrentIndex = newIndex;
        this._blockFontSliderSignal = true;
        this._fontSlider.value = newIndex / (FONT_SCALES.length - 1);
        this._blockFontSliderSignal = false;

        this._fontBadge.text = FONT_SCALES[newIndex].label;
        this._applyFontScaleNow(newIndex);
    }

    _scheduleApplyFontScale(stepIndex) {
        if (this._fontScaleTimeoutId) {
            GLib.source_remove(this._fontScaleTimeoutId);
            this._fontScaleTimeoutId = null;
        }
        this._fontScaleTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
            this._fontScaleTimeoutId = null;
            this._applyFontScaleNow(stepIndex);
            return GLib.SOURCE_REMOVE;
        });
    }

    _applyFontScaleNow(stepIndex) {
        if (this._fontScaleTimeoutId) {
            GLib.source_remove(this._fontScaleTimeoutId);
            this._fontScaleTimeoutId = null;
        }
        this._onFontScaleSelected(FONT_SCALES[stepIndex].value);
    }

    _connectSignals() {
        // Sincronizar bajo demanda al abrir el menú (0 coste de CPU en reposo)
        this._openStateId = this.menu.connect('open-state-changed', (menu, isOpen) => {
            if (isOpen && !this._destroyed) {
                this._syncDisplayScale();
                this._syncFontScale();
            }
        });

        // Suscripción de señal D-Bus de Mutter totalmente asíncrona
        try {
            this._monitorsChangedId = Gio.DBus.session.signal_subscribe(
                MUTTER_BUS_NAME,
                MUTTER_INTERFACE,
                'MonitorsChanged',
                MUTTER_OBJECT_PATH,
                null,
                Gio.DBusSignalFlags.NONE,
                () => {
                    if (!this._destroyed && this.menu.isOpen) {
                        this._syncDisplayScale();
                    }
                }
            );
        } catch (e) {
            console.error(`[QuickScale] Error suscribiendo a MonitorsChanged: ${e.message}`);
            this._monitorsChangedId = null;
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

            let closestIndex = 0;
            let minDiff = Infinity;
            for (let i = 0; i < FONT_SCALES.length; i++) {
                const diff = Math.abs(currentFontScale - FONT_SCALES[i].value);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestIndex = i;
                }
            }

            this._fontCurrentIndex = closestIndex;
            if (this._fontBadge) {
                this._fontBadge.text = FONT_SCALES[closestIndex].label;
            }

            if (this._fontSlider) {
                this._blockFontSliderSignal = true;
                this._fontSlider.value = closestIndex / (FONT_SCALES.length - 1);
                this._blockFontSliderSignal = false;
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
        if (this._destroyed) return;

        Gio.DBus.session.call(
            MUTTER_BUS_NAME,
            MUTTER_OBJECT_PATH,
            MUTTER_INTERFACE,
            'GetCurrentState',
            null,
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
            (conn, res) => {
                if (this._destroyed) return;

                try {
                    const reply = conn.call_finish(res);
                    const [, , logicalMonitors] = reply.deepUnpack();
                    if (!logicalMonitors || logicalMonitors.length === 0) return;

                    const primaryLm = logicalMonitors.find(lm => lm[4] === true) || logicalMonitors[0];
                    const currentScale = primaryLm[2];

                    let closestIndex = 0;
                    let minDiff = Infinity;
                    for (let i = 0; i < DISPLAY_SCALES.length; i++) {
                        const diff = Math.abs(currentScale - DISPLAY_SCALES[i].target);
                        if (diff < minDiff) {
                            minDiff = diff;
                            closestIndex = i;
                        }
                    }

                    this._displayCurrentIndex = closestIndex;
                    if (this._displayBadge) {
                        this._displayBadge.text = DISPLAY_SCALES[closestIndex].label;
                    }

                    if (this._displaySlider) {
                        this._blockDisplaySliderSignal = true;
                        this._displaySlider.value = closestIndex / (DISPLAY_SCALES.length - 1);
                        this._blockDisplaySliderSignal = false;
                    }
                } catch (err) {
                    console.error(`[QuickScale] Error en GetCurrentState: ${err.message}`);
                }
            }
        );
    }

    _onDisplayScaleSelected(scaleOption) {
        if (this._destroyed) return;

        Gio.DBus.session.call(
            MUTTER_BUS_NAME,
            MUTTER_OBJECT_PATH,
            MUTTER_INTERFACE,
            'GetCurrentState',
            null,
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
            (conn, res) => {
                if (this._destroyed) return;

                try {
                    const reply = conn.call_finish(res);
                    const [serial, monitors, logicalMonitors] = reply.deepUnpack();
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
                                const val = mode[6]['is-current']?.deepUnpack?.() ?? mode[6]['is-current'];
                                if (val === true) {
                                    primaryCurrentMode = mode;
                                    break;
                                }
                            }
                            break;
                        }
                    }

                    // Ajustar al valor exacto soportado por Mutter
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
                                        const val = mode[6]['is-current']?.deepUnpack?.() ?? mode[6]['is-current'];
                                        if (val === true) {
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
                    Gio.DBus.session.call(
                        MUTTER_BUS_NAME,
                        MUTTER_OBJECT_PATH,
                        MUTTER_INTERFACE,
                        'ApplyMonitorsConfig',
                        new GLib.Variant('(uua(iiduba(ssa{sv}))a{sv})', [
                            serial,
                            METHOD_PERSISTENT,
                            newLogicalMonitors,
                            {}
                        ]),
                        null,
                        Gio.DBusCallFlags.NONE,
                        -1,
                        null,
                        (conn2, res2) => {
                            if (this._destroyed) return;

                            try {
                                conn2.call_finish(res2);
                                this._syncDisplayScale();
                            } catch (err2) {
                                console.error(`[QuickScale] Error aplicando configuración de pantalla: ${err2.message}`);
                                Main.notify(
                                    'Quick Scale Switcher',
                                    _('Error aplicando escala. Asegúrate de habilitar el escalado fraccionario en Mutter:\n%s').format(err2.message)
                                );
                            }
                        }
                    );
                } catch (err) {
                    console.error(`[QuickScale] Error preparando ApplyMonitorsConfig: ${err.message}`);
                }
            }
        );
    }

    destroy() {
        this._destroyed = true;

        if (this._displayScaleTimeoutId) {
            GLib.source_remove(this._displayScaleTimeoutId);
            this._displayScaleTimeoutId = null;
        }

        if (this._fontScaleTimeoutId) {
            GLib.source_remove(this._fontScaleTimeoutId);
            this._fontScaleTimeoutId = null;
        }

        if (this._openStateId) {
            this.menu.disconnect(this._openStateId);
            this._openStateId = null;
        }

        if (this._monitorsChangedId) {
            Gio.DBus.session.signal_unsubscribe(this._monitorsChangedId);
            this._monitorsChangedId = null;
        }

        if (this._fontSettingChangedId && this._interfaceSettings) {
            this._interfaceSettings.disconnect(this._fontSettingChangedId);
            this._fontSettingChangedId = null;
        }
        this._interfaceSettings = null;

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
