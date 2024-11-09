/*
 * SPDX-FileCopyrightText: 2023 Florian Müllner <fmuellner@gnome.org>
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import GTop from 'gi://GTop';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const THRESHOLD_HIGH = 0.80;

// adapted from load-graph.cpp in gnome-system-monitor
/**
 * @param {string} str
 * @returns {number}
 */
function strHash(str) {
    let hash = 0xcbf29ce484222325n;

    for (const c of str)
        hash = (hash * 0x00000100000001B3n) ^ BigInt(c.codePointAt(0));
    return hash;
}

class StatSection extends St.BoxLayout {
    static {
        GObject.registerClass(this);
    }

    constructor(iconName, accessibleName) {
        super({
            style_class: 'system-monitor-stat-section',
            accessibleName,
        });

        const ext = Extension.lookupByURL(import.meta.url);
        const file =
            ext.dir.resolve_relative_path(`icons/${iconName}.svg`);

        this._icon = new St.Icon({
            style_class: 'system-monitor-stat-section-icon',
            gicon: new Gio.FileIcon({file}),
        });
        this.add_child(this._icon);

        this.label = new St.Label({
            style_class: 'system-monitor-stat-section-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.label.clutter_text.set({
            ellipsize: Pango.EllipsizeMode.NONE,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this.label);

        this.connect('destroy', () => this._clearTimeout());
        this.connect('notify::visible', () => this._sync());
        this._sync();
    }

    _ensureTimeout() {
        if (this._updateId)
            return;

        this._updateId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1,
            () => {
                this._update();
                return GLib.SOURCE_CONTINUE;
            });
    }

    _clearTimeout() {
        if (this._updateId)
            GLib.source_remove(this._updateId);
        delete this._updateId;
    }

    _sync() {
        if (this.visible)
            this._ensureTimeout();
        else
            this._clearTimeout();

        if (this.visible)
            this._update();
    }

    _update() {
    }
}

class LoadStatSection extends StatSection {
    static {
        GObject.registerClass(this);
    }

    #formatter = new Intl.NumberFormat(undefined, {
        style: 'percent',
    });

    _getLoadValue() {
    }

    _update() {
        const load = this._getLoadValue();
        this.label.text = this.#formatter.format(load);

        if (load >= THRESHOLD_HIGH)
            this.add_style_class_name('high-usage');
        else
            this.remove_style_class_name('high-usage');
    }
}

class CpuSection extends LoadStatSection {
    static {
        GObject.registerClass(this);
    }

    #prevCpu = new GTop.glibtop_cpu();

    constructor() {
        super('processor-symbolic', _('CPU stats'));
    }

    _getLoadValue() {
        const cpu = new GTop.glibtop_cpu();
        GTop.glibtop_get_cpu(cpu);

        const total = cpu.total - this.#prevCpu.total;
        const user = cpu.user - this.#prevCpu.user;
        const sys = cpu.sys - this.#prevCpu.sys;
        const nice = cpu.nice - this.#prevCpu.nice;

        this.#prevCpu = cpu;

        return (user + sys + nice) / Math.max(total, 1.0);
    }
}

class MemSection extends LoadStatSection {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super('memory-symbolic', _('Memory stats'));
    }

    _getLoadValue() {
        const mem = new GTop.glibtop_mem();
        GTop.glibtop_get_mem(mem);

        const {user, total} = mem;
        return user / Math.max(total, 1.0);
    }
}

class SwapSection extends LoadStatSection {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super('swap-symbolic', _('Swap stats'));
    }

    _getLoadValue() {
        const swap = new GTop.glibtop_swap();
        GTop.glibtop_get_swap(swap);

        const {used, total} = swap;
        return used / Math.max(total, 1.0);
    }
}

class NetStatSection extends StatSection {
    static {
        GObject.registerClass(this);
    }

    #formats = [{
        factor: 1000,
        unitFactor: 1000,
        formatter: new Intl.NumberFormat(undefined, {
            style: 'unit',
            unit: 'kilobyte',
            maximumFractionDigits: 1,
            minimumFractionDigits: 1,
        }),
    }, {
        factor: 1000 * 10,
        unitFactor: 1000,
        formatter: new Intl.NumberFormat(undefined, {
            style: 'unit',
            unit: 'kilobyte',
            maximumFractionDigits: 0,
        }),
    }, {
        factor: 1000 * 1000,
        unitFactor: 1000 * 1000,
        formatter: new Intl.NumberFormat(undefined, {
            style: 'unit',
            unit: 'megabyte',
            maximumFractionDigits: 1,
            minimumFractionDigits: 1,
        }),
    }, {
        factor: 1000 * 1000 * 10,
        unitFactor: 1000 * 1000,
        formatter: new Intl.NumberFormat(undefined, {
            style: 'unit',
            unit: 'megabyte',
            maximumFractionDigits: 0,
        }),
    }, {
        factor: 1000 * 1000 * 1000,
        unitFactor: 1000 * 1000 * 1000,
        formatter: new Intl.NumberFormat(undefined, {
            style: 'unit',
            unit: 'gigabyte',
            maximumFractionDigits: 1,
            minimumFractionDigits: 1,
        }),
    }, {
        factor: 1000 * 1000 * 1000 * 10,
        unitFactor: 1000 * 1000 * 1000,
        formatter: new Intl.NumberFormat(undefined, {
            style: 'unit',
            unit: 'gigabyte',
            maximumFractionDigits: 0,
        }),
    }, {
        factor: 1000 * 1000 * 1000 * 1000,
        unitFactor: 1000 * 1000 * 1000 * 1000,
        formatter: new Intl.NumberFormat(undefined, {
            style: 'unit',
            unit: 'terabyte',
            maximumFractionDigits: 1,
            minimumFractionDigits: 1,
        }),
    }, {
        factor: 1000 * 1000 * 1000 * 1000 * 10,
        unitFactor: 1000 * 1000 * 1000 * 1000,
        formatter: new Intl.NumberFormat(undefined, {
            style: 'unit',
            unit: 'terabyte',
            maximumFractionDigits: 0,
        }),
    }, {
        factor: 1000 * 1000 * 1000 * 1000 * 1000,
        unitFactor: 1000 * 1000 * 1000 * 1000 * 1000,
        formatter: new Intl.NumberFormat(undefined, {
            style: 'unit',
            unit: 'petabyte',
            maximumFractionDigits: 1,
            minimumFractionDigits: 1,
        }),
    }];

    #lastBytes = 0;
    #lastHash = 0;
    #lastTime = 0;

    _getBytes(_netload) {
    }

    _getFormat(bytes) {
        for (let i = 1; i < this.#formats.length; i++) {
            if (bytes < this.#formats.at(i).factor)
                return this.#formats.at(i - 1);
        }
        return this.#formats.at(-1);
    }

    _update() {
        const FLAG_LOOPBACK = 1 << 4; // GTop sucks

        const netlist = new GTop.glibtop_netlist();
        const ifnames = GTop.glibtop_get_netlist(netlist);

        let bytes = 0;
        let hash = 1n;

        for (const ifname of ifnames) {
            const netload = new GTop.glibtop_netload();
            GTop.glibtop_get_netload(netload, ifname);

            if (netload.if_flags & FLAG_LOOPBACK)
                continue;

            bytes += this._getBytes(netload);
            hash += strHash(ifname);
        }

        const time = GLib.get_monotonic_time();

        let dbytes = 0;

        // Skip calculation if new data is less than old (interface
        // removed, counters reset, ...) or if it is the first time
        if (bytes >= this.#lastBytes &&
            hash === this.#lastHash &&
            this.#lastTime !== 0) {
            const dtime = (time - this.#lastTime) / GLib.USEC_PER_SEC;
            dbytes = (bytes - this.#lastBytes) / dtime;
        }

        this.#lastBytes = bytes;
        this.#lastTime = time;
        this.#lastHash = hash;

        const {unitFactor, formatter} = this._getFormat(dbytes);
        this.label.text = formatter.format(dbytes / unitFactor);
    }
}

class UploadSection extends NetStatSection {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super('upload-symbolic', _('Upload stats'));
    }

    _getBytes(netload) {
        return netload.bytes_out;
    }
}

class DownloadSection extends NetStatSection {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super('download-symbolic', _('Download stats'));
    }

    _getBytes(netload) {
        return netload.bytes_in;
    }
}

class Indicator extends PanelMenu.Button {
    static {
        GObject.registerClass(this);
    }

    constructor(settings) {
        GTop.glibtop_init();
        super(0.5, _('System stats'));

        this._settings = settings;
        this.connect('destroy',
            () => (this._settings = null));

        const box = new St.BoxLayout({
            styleClass: 'system-monitor-stat-sections',
        });

        this.add_child(box);

        this._placeholder = new St.Icon({
            styleClass: 'system-status-icon system-monitor-placeholder',
        });
        box.add_child(this._placeholder);

        this._cpuSection = new CpuSection();
        this._settings.bind('show-cpu',
            this._cpuSection, 'visible',
            Gio.SettingsBindFlags.GET);
        box.add_child(this._cpuSection);

        this._memSection = new MemSection();
        this._settings.bind('show-memory',
            this._memSection, 'visible',
            Gio.SettingsBindFlags.GET);
        box.add_child(this._memSection);

        this._swapSection = new SwapSection();
        this._settings.bind('show-swap',
            this._swapSection, 'visible',
            Gio.SettingsBindFlags.GET);
        box.add_child(this._swapSection);

        this._ulSection = new UploadSection();
        this._settings.bind('show-upload',
            this._ulSection, 'visible',
            Gio.SettingsBindFlags.GET);
        box.add_child(this._ulSection);

        this._dlSection = new DownloadSection();
        this._settings.bind('show-download',
            this._dlSection, 'visible',
            Gio.SettingsBindFlags.GET);
        box.add_child(this._dlSection);

        this.menu.addMenuItem(
            new PopupMenu.PopupSeparatorMenuItem(_('Show')));

        this._cpuItem = this.menu.addAction(_('CPU'),
            () => this._toggleSettings('show-cpu'));
        this._memItem = this.menu.addAction(_('Memory'),
            () => this._toggleSettings('show-memory'));
        this._swapItem = this.menu.addAction(_('Swap'),
            () => this._toggleSettings('show-swap'));
        this._ulItem = this.menu.addAction(_('Upload'),
            () => this._toggleSettings('show-upload'));
        this._dlItem = this.menu.addAction(_('Download'),
            () => this._toggleSettings('show-download'));

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._appMenuItem = this.menu.addAction(_('Open System Monitor'),
            () => this._openSystemMonitor());

        const appSystem = Shell.AppSystem.get_default();
        appSystem.connectObject('installed-changed',
            () => this._updateSystemMonitorApp(), this);
        this._updateSystemMonitorApp();

        this._settings.connectObject('changed',
            () => this._sync(), this);
        this._sync();
    }

    _updateSystemMonitorApp() {
        const appSystem = Shell.AppSystem.get_default();
        this._systemMonitorApp =
            appSystem.lookup_app('org.gnome.SystemMonitor.desktop');
        this._placeholder.gicon = this._systemMonitorApp?.icon ?? null;
        this.visible = this._systemMonitorApp != null;
    }

    _openSystemMonitor() {
        this._systemMonitorApp.activate();
        Main.overview.hide();
    }

    _toggleSettings(key) {
        this._settings.set_boolean(key, !this._settings.get_boolean(key));
    }

    _sync() {
        this._cpuItem.setOrnament(this._settings.get_boolean('show-cpu')
            ? PopupMenu.Ornament.CHECK
            : PopupMenu.Ornament.NONE);
        this._memItem.setOrnament(this._settings.get_boolean('show-memory')
            ? PopupMenu.Ornament.CHECK
            : PopupMenu.Ornament.NONE);
        this._swapItem.setOrnament(this._settings.get_boolean('show-swap')
            ? PopupMenu.Ornament.CHECK
            : PopupMenu.Ornament.NONE);
        this._ulItem.setOrnament(this._settings.get_boolean('show-upload')
            ? PopupMenu.Ornament.CHECK
            : PopupMenu.Ornament.NONE);
        this._dlItem.setOrnament(this._settings.get_boolean('show-download')
            ? PopupMenu.Ornament.CHECK
            : PopupMenu.Ornament.NONE);

        this._placeholder.visible =
            this._settings.list_keys().every(key => !this._settings.get_boolean(key));
    }
}

export default class SystemMonitorExtension extends Extension {
    enable() {
        this._indicator = new Indicator(this.getSettings());
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
    }
}
