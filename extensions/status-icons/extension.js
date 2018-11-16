// SPDX-FileCopyrightText: 2018 Adel Gadllah <adel.gadllah@gmail.com>
// SPDX-FileCopyrightText: 2018 Florian Müllner <fmuellner@gnome.org>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Button as PanelButton} from 'resource:///org/gnome/shell/ui/panelMenu.js';

const PANEL_ICON_SIZE = 16;

const STANDARD_TRAY_ICON_IMPLEMENTATIONS = [
    'bluetooth-applet',
    'gnome-sound-applet',
    'nm-applet',
    'gnome-power-manager',
    'keyboard',
    'a11y-keyboard',
    'kbd-scrolllock',
    'kbd-numlock',
    'kbd-capslock',
    'ibus-ui-gtk',
];

export default class SysTray {
    constructor() {
        this._icons = new Map();
        this._tray = null;
    }

    _onTrayIconAdded(o, icon) {
        let wmClass = icon.wm_class ? icon.wm_class.toLowerCase() : '';
        if (STANDARD_TRAY_ICON_IMPLEMENTATIONS.includes(wmClass))
            return;

        let button = new PanelButton(0.5, null, true);

        let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        let iconSize = PANEL_ICON_SIZE * scaleFactor;

        icon.set({
            width: iconSize,
            height: iconSize,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        let iconBin = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            style_class: 'system-status-icon',
        });
        iconBin.add_child(icon);
        button.add_child(iconBin);

        this._icons.set(icon, button);

        button.connect('button-release-event',
            (actor, event) => icon.click(event));
        button.connect('key-press-event',
            (actor, event) => icon.click(event));

        const role = `${icon}`;
        Main.panel.addToStatusArea(role, button);
    }

    _onTrayIconRemoved(o, icon) {
        const button = this._icons.get(icon);
        button?.destroy();
        this._icons.delete(icon);
    }

    enable() {
        this._tray = new Shell.TrayManager();
        this._tray.connect('tray-icon-added',
            this._onTrayIconAdded.bind(this));
        this._tray.connect('tray-icon-removed',
            this._onTrayIconRemoved.bind(this));
        this._tray.manage_screen(Main.panel);
    }

    disable() {
        this._icons.forEach(button => button.destroy());
        this._icons.clear();

        this._tray.unmanage_screen();
        this._tray = null;
    }
}
