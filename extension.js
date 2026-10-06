import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const { gettext: _ } = Extension.defineTranslationFunctions(import.meta.url);

// Mutter DisplayConfig D-Bus constants
const MUTTER_BUS_NAME = 'org.gnome.Mutter.DisplayConfig';
const MUTTER_OBJECT_PATH = '/org/gnome/Mutter/DisplayConfig';
const MUTTER_INTERFACE = 'org.gnome.Mutter.DisplayConfig';

// Display scale options
const DISPLAY_SCALES = [
    { label: '100%', target: 1.0 },
    { label: '125%', target: 1.25 },
    { label: '133%', target: 4 / 3 }, // Mutter: 1.3333333730697632
    { label: '150%', target: 1.5 },
    { label: '166%', target: 5 / 3 }, // Mutter: 1.6666666269302368
    { label: '200%', target: 2.0 },
];

// Font scale options
const FONT_SCALES = [
    { label: '0.66', value: 0.66 },
    { label: '1.00', value: 1.0 },
    { label: '1.25', value: 1.25 },
    { label: '1.33', value: 1.33 },
    { label: '1.50', value: 1.50 },
    { label: '1.66', value: 1.66 },
    { label: '2.00', value: 2.00 },
];

// Mutter monitor configuration methods for ApplyMonitorsConfig
// Method 1 (TEMPORARY): Apply changes directly and instantly without modal prompt
// Method 2 (PERSISTENT): Triggers GNOME Shell's native confirmation dialog (20s countdown)
const METHOD_INSTANT = 1;
const METHOD_CONFIRM_20S = 2;

// Local directory and file path to persist preferences
const CONFIG_DIR = GLib.build_filenamev([GLib.get_user_config_dir(), 'quick-scale-switcher']);
const CONFIG_FILE = GLib.build_filenamev([CONFIG_DIR, 'config.json']);

function loadSafeMode() {
    try {
        if (GLib.file_test(CONFIG_FILE, GLib.FileTest.EXISTS)) {
            const [ok, contents] = GLib.file_get_contents(CONFIG_FILE);
            if (ok) {
                const data = JSON.parse(new TextDecoder().decode(contents));
                return !!data.safeMode;
            }
        }
    } catch (e) {
        console.error(`[QuickScale] Failed to load configuration: ${e.message}`);
    }
    return false;
}

function saveSafeMode(val) {
    try {
        GLib.mkdir_with_parents(CONFIG_DIR, 0o755);
        GLib.file_set_contents(CONFIG_FILE, JSON.stringify({ safeMode: val }));
    } catch (e) {
        console.error(`[QuickScale] Failed to save configuration: ${e.message}`);
    }
}

const QuickScaleIndicator = GObject.registerClass(
class QuickScaleIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'Quick Scale & Font Switcher', false);
        this._extension = extension;
        this._destroyed = false;
        this._safeMode = loadSafeMode();

        this._displayButtons = [];
        this._fontButtons = [];

        this._monitorsChangedId = null;
        this._fontSettingChangedId = null;
        this._openStateId = null;

        // Main top panel container with native styling
        const box = new St.BoxLayout({
            style_class: 'panel-status-indicators-box',
            reactive: true,
            can_focus: true,
            track_hover: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        // Top bar panel icon
        const icon = new St.Icon({
            gicon: new Gio.ThemedIcon({
                names: [
                    'preferences-desktop-display-symbolic',
                    'video-display-symbolic',
                    'display-symbolic',
                ],
            }),
            style_class: 'system-status-icon quick-scale-panel-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(icon);
        this.add_child(box);

        // Initialize font scaling GSettings
        try {
            this._interfaceSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
        } catch (e) {
            console.error(`[QuickScale] Failed to connect to org.gnome.desktop.interface: ${e.message}`);
            this._interfaceSettings = null;
        }

        // Build interface (Compact segmented grid layout)
        this._buildMenu();

        // Connect D-Bus and GSettings signal handlers
        this._connectSignals();

        // Load initial state
        this._syncFontScale();
        this._syncDisplayScale();
    }

    _buildMenu() {
        // =========================================================================
        // SECTION 1: Display Scale Grid (3 columns x 2 rows)
        // =========================================================================
        const displaySection = new PopupMenu.PopupMenuSection();

        // Header: Icon, Title, and Badge with active value
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
            gicon: new Gio.ThemedIcon({
                names: [
                    'video-display-symbolic',
                    'preferences-desktop-display-symbolic',
                    'display-symbolic',
                ],
            }),
            style_class: 'popup-menu-icon quick-scale-header-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        displayHeaderBox.add_child(displayIcon);

        const displayTitle = new St.Label({
            text: _('Display scale'),
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

        // Display scale button grid
        const displayGridItem = new PopupMenu.PopupBaseMenuItem({
            activate: false,
            can_focus: false,
            reactive: true,
            style_class: 'quick-scale-grid-item',
        });
        const displayGridBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: 'quick-scale-grid-container',
        });

        // Row 1: 100%, 125%, 133%
        const displayRow1 = new St.BoxLayout({
            x_expand: true,
            style_class: 'quick-scale-row',
        });
        // Row 2: 150%, 166%, 200%
        const displayRow2 = new St.BoxLayout({
            x_expand: true,
            style_class: 'quick-scale-row',
        });

        this._displayButtons = [];
        DISPLAY_SCALES.forEach((scale, index) => {
            const btn = new St.Button({
                label: scale.label,
                style_class: 'button quick-scale-btn',
                can_focus: true,
                x_expand: true,
                track_hover: true,
            });
            if (btn.child) {
                btn.child.x_align = Clutter.ActorAlign.CENTER;
                btn.child.y_align = Clutter.ActorAlign.CENTER;
            }
            btn.connect('clicked', () => {
                this._onDisplayScaleSelected(scale);
            });
            this._displayButtons.push(btn);

            if (index < 3) {
                displayRow1.add_child(btn);
            } else {
                displayRow2.add_child(btn);
            }
        });

        displayGridBox.add_child(displayRow1);
        displayGridBox.add_child(displayRow2);
        displayGridItem.add_child(displayGridBox);
        displaySection.addMenuItem(displayGridItem);
        this.menu.addMenuItem(displaySection);

        // =========================================================================
        // SECTION 2: Font Scale Grid (4 columns x 2 rows + Reset)
        // =========================================================================
        const fontSection = new PopupMenu.PopupMenuSection();

        // Header: Icon, Title, and Badge
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
            gicon: new Gio.ThemedIcon({
                names: [
                    'format-text-larger-symbolic',
                    'font-size-symbolic',
                    'preferences-desktop-font-symbolic',
                    'font-x-generic-symbolic',
                ],
            }),
            style_class: 'popup-menu-icon quick-scale-header-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        fontHeaderBox.add_child(fontIcon);

        const fontTitle = new St.Label({
            text: _('Font scale'),
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

        // Font button grid
        const fontGridItem = new PopupMenu.PopupBaseMenuItem({
            activate: false,
            can_focus: false,
            reactive: true,
            style_class: 'quick-scale-grid-item',
        });
        const fontGridBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: 'quick-scale-grid-container',
        });

        // Row 1: 0.66, 1.00, 1.25, 1.33
        const fontRow1 = new St.BoxLayout({
            x_expand: true,
            style_class: 'quick-scale-row',
        });
        // Row 2: 1.50, 1.66, 2.00, [↺ 1x]
        const fontRow2 = new St.BoxLayout({
            x_expand: true,
            style_class: 'quick-scale-row',
        });

        this._fontButtons = [];
        FONT_SCALES.forEach((scale, index) => {
            const btn = new St.Button({
                label: scale.label,
                style_class: 'button quick-scale-btn',
                can_focus: true,
                x_expand: true,
                track_hover: true,
            });
            if (btn.child) {
                btn.child.x_align = Clutter.ActorAlign.CENTER;
                btn.child.y_align = Clutter.ActorAlign.CENTER;
            }
            btn.connect('clicked', () => {
                this._onFontScaleSelected(scale.value);
            });
            this._fontButtons.push(btn);

            if (index < 4) {
                fontRow1.add_child(btn);
            } else {
                fontRow2.add_child(btn);
            }
        });

        // Quick reset button [↺ 1x] in the 4th position of Row 2
        const resetBox = new St.BoxLayout({
            style_class: 'quick-scale-reset-box',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const resetIcon = new St.Icon({
            gicon: new Gio.ThemedIcon({
                names: [
                    'view-refresh-symbolic',
                    'edit-undo-symbolic',
                    'document-revert-symbolic',
                ],
            }),
            style_class: 'popup-menu-icon quick-scale-reset-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        const resetLabel = new St.Label({
            text: '1x',
            y_align: Clutter.ActorAlign.CENTER,
        });
        resetBox.add_child(resetIcon);
        resetBox.add_child(resetLabel);

        const resetBtn = new St.Button({
            child: resetBox,
            style_class: 'button quick-scale-btn quick-scale-reset-btn',
            can_focus: true,
            x_expand: true,
            track_hover: true,
            accessible_name: _('Reset to defaults (100% / 1.00)'),
        });
        resetBtn.connect('clicked', () => {
            this._onFontScaleSelected(1.0);
            const defaultDisplay = DISPLAY_SCALES.find(s => s.target === 1.0) || DISPLAY_SCALES[0];
            this._onDisplayScaleSelected(defaultDisplay);
        });
        fontRow2.add_child(resetBtn);

        fontGridBox.add_child(fontRow1);
        fontGridBox.add_child(fontRow2);
        fontGridItem.add_child(fontGridBox);
        fontSection.addMenuItem(fontGridItem);
        this.menu.addMenuItem(fontSection);

        // =========================================================================
        // SECTION 3: Separator, Safe Mode, and Display Settings
        // =========================================================================
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Safe Mode switch / 20s confirmation countdown
        const safeModeItem = new PopupMenu.PopupSwitchMenuItem(
            _('Confirm display changes (20s)'),
            this._safeMode
        );

        const safeIcon = new St.Icon({
            gicon: new Gio.ThemedIcon({
                names: [
                    'security-high-symbolic',
                    'channel-secure-symbolic',
                    'dialog-password-symbolic',
                    'preferences-system-privacy-symbolic',
                ],
            }),
            style_class: 'popup-menu-icon quick-scale-safe-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        safeModeItem.insert_child_below(safeIcon, safeModeItem.label);

        // Allow toggling the switch without closing the popup menu
        safeModeItem.activate = function (_event) {
            this.toggle();
        };

        safeModeItem.connect('toggled', (item, state) => {
            this._safeMode = state;
            saveSafeMode(state);
        });
        this.menu.addMenuItem(safeModeItem);

        // Shortcut to GNOME Display Settings
        const settingsGIcon = new Gio.ThemedIcon({
            names: [
                'preferences-desktop-display-symbolic',
                'video-display-symbolic',
                'preferences-system-symbolic',
            ],
        });
        const settingsItem = new PopupMenu.PopupImageMenuItem(
            _('Display Settings…'),
            settingsGIcon
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
                console.error(`[QuickScale] Failed to open gnome-control-center: ${err.message}`);
            }
        });
        this.menu.addMenuItem(settingsItem);
    }

    _connectSignals() {
        // Synchronize on demand when menu opens (0% idle CPU overhead)
        this._openStateId = this.menu.connect('open-state-changed', (menu, isOpen) => {
            if (isOpen && !this._destroyed) {
                this._syncDisplayScale();
                this._syncFontScale();
            }
        });

        // Fully asynchronous Mutter D-Bus signal subscription
        try {
            this._monitorsChangedId = Gio.DBus.session.signal_subscribe(
                MUTTER_BUS_NAME,
                MUTTER_INTERFACE,
                'MonitorsChanged',
                MUTTER_OBJECT_PATH,
                null,
                Gio.DBusSignalFlags.NONE,
                () => {
                    if (!this._destroyed) {
                        this._syncDisplayScale();
                    }
                }
            );
        } catch (e) {
            console.error(`[QuickScale] Failed to subscribe to MonitorsChanged: ${e.message}`);
            this._monitorsChangedId = null;
        }

        // Synchronize external changes to font scaling factor
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

            if (this._fontBadge) {
                this._fontBadge.text = FONT_SCALES[closestIndex].label;
            }

            this._fontButtons.forEach((btn, idx) => {
                if (idx === closestIndex) {
                    btn.add_style_class_name('quick-scale-btn-active');
                } else {
                    btn.remove_style_class_name('quick-scale-btn-active');
                }
            });
        } catch (err) {
            console.error(`[QuickScale] Failed to read text-scaling-factor: ${err.message}`);
        }
    }

    _onFontScaleSelected(scaleValue) {
        if (!this._interfaceSettings || this._destroyed) return;

        const targetIndex = FONT_SCALES.findIndex(s => s.value === scaleValue);
        if (targetIndex >= 0) {
            if (this._fontBadge) {
                this._fontBadge.text = FONT_SCALES[targetIndex].label;
            }
            this._fontButtons.forEach((btn, idx) => {
                if (idx === targetIndex) {
                    btn.add_style_class_name('quick-scale-btn-active');
                } else {
                    btn.remove_style_class_name('quick-scale-btn-active');
                }
            });
        }

        try {
            this._interfaceSettings.set_double('text-scaling-factor', scaleValue);
        } catch (err) {
            console.error(`[QuickScale] Failed to write text-scaling-factor: ${err.message}`);
            Main.notify('Quick Scale Switcher', _('Error setting font scale: %s').format(err.message));
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

                    if (this._displayBadge) {
                        this._displayBadge.text = DISPLAY_SCALES[closestIndex].label;
                    }

                    this._displayButtons.forEach((btn, idx) => {
                        if (idx === closestIndex) {
                            btn.add_style_class_name('quick-scale-btn-active');
                        } else {
                            btn.remove_style_class_name('quick-scale-btn-active');
                        }
                    });
                } catch (err) {
                    console.error(`[QuickScale] Failed to get display state: ${err.message}`);
                }
            }
        );
    }

    _onDisplayScaleSelected(scaleOption) {
        if (this._destroyed) return;

        const targetIndex = DISPLAY_SCALES.findIndex(s => s === scaleOption || s.target === scaleOption.target);
        if (targetIndex >= 0) {
            if (this._displayBadge) {
                this._displayBadge.text = DISPLAY_SCALES[targetIndex].label;
            }
            this._displayButtons.forEach((btn, idx) => {
                if (idx === targetIndex) {
                    btn.add_style_class_name('quick-scale-btn-active');
                } else {
                    btn.remove_style_class_name('quick-scale-btn-active');
                }
            });
        }

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
                    const tIndex = primaryIndex >= 0 ? primaryIndex : 0;
                    const primaryLm = logicalMonitors[tIndex];
                    const primaryConnector = primaryLm[5]?.[0]?.[0];

                    // Find current mode of the primary monitor to get resolution and supported_scales
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

                    // Snap to exact scale supported by Mutter
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

                    // Multi-monitor coordinate shift calculation to prevent invalid overlap
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

                    // Reconstruct logical monitors config preserving native mode and refresh rate
                    const newLogicalMonitors = logicalMonitors.map((lm, idx) => {
                        const [x, y, scale, transform, isPrimary, lmMonitors] = lm;
                        const isTarget = idx === tIndex;

                        let newX = x;
                        let newY = y;

                        // Shift adjacent monitors right or down if primary monitor logical size changes
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

                    const method = this._safeMode ? METHOD_CONFIRM_20S : METHOD_INSTANT;

                    // Apply in Mutter according to selected mode (instant or 20s confirmation countdown)
                    Gio.DBus.session.call(
                        MUTTER_BUS_NAME,
                        MUTTER_OBJECT_PATH,
                        MUTTER_INTERFACE,
                        'ApplyMonitorsConfig',
                        new GLib.Variant('(uua(iiduba(ssa{sv}))a{sv})', [
                            serial,
                            method,
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
                                console.error(`[QuickScale] Failed to apply display configuration: ${err2.message}`);
                                Main.notify(
                                    'Quick Scale Switcher',
                                    _('Error applying display scale. Make sure fractional scaling is enabled in Mutter:\n%s').format(err2.message)
                                );
                            }
                        }
                    );
                } catch (err) {
                    console.error(`[QuickScale] Failed to prepare ApplyMonitorsConfig: ${err.message}`);
                }
            }
        );
    }

    destroy() {
        this._destroyed = true;

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

        this._displayButtons = [];
        this._fontButtons = [];

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
