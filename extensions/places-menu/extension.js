// SPDX-FileCopyrightText: 2011 Vamsi Krishna Brahmajosyula <vamsikrishna.brahmajosyula@gmail.com>
// SPDX-FileCopyrightText: 2011 Giovanni Campagna <gcampagna@src.gnome.org>
// SPDX-FileCopyrightText: 2013 Florian Müllner <fmuellner@gnome.org>
// SPDX-FileCopyrightText: 2016 Rémy Lefevre <lefevreremy@gmail.com>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {PlacesManager} from './placeDisplay.js';

const N_ = x => x;

class PlaceMenuItem extends PopupMenu.PopupImageMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(info) {
        super(info.name, info.icon, {
            style_class: 'place-menu-item',
        });
        this._info = info;

        if (info.isRemovable()) {
            this._ejectIcon = new St.Icon({
                icon_name: 'media-eject-symbolic',
                style_class: 'popup-menu-icon',
            });
            this._ejectButton = new St.Button({
                child: this._ejectIcon,
                style_class: 'button',
            });
            this._ejectButton.connect('clicked', info.eject.bind(info));
            this.add_child(this._ejectButton);
        }

        info.connectObject('changed',
            this._propertiesChanged.bind(this), this);
    }

    activate(event) {
        this._info.launch(event.get_time());

        super.activate(event);
    }

    _propertiesChanged(info) {
        this.setIcon(info.icon);
        this.label.text = info.name;
    }
}

const SECTIONS = [
    'special',
    'devices',
    'bookmarks',
    'network',
];

class PlacesMenu extends PanelMenu.Button {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super(0.5, _('Places'));

        let label = new St.Label({
            text: _('Places'),
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(label);

        this.placesManager = new PlacesManager();

        this._sections = { };

        for (let i = 0; i < SECTIONS.length; i++) {
            let id = SECTIONS[i];
            this._sections[id] = new PopupMenu.PopupMenuSection();
            this.placesManager.connect(`${id}-updated`, () => {
                this._redisplay(id);
            });

            this._create(id);
            this.menu.addMenuItem(this._sections[id]);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
    }

    _onDestroy() {
        this.placesManager.destroy();

        super._onDestroy();
    }

    _redisplay(id) {
        this._sections[id].removeAll();
        this._create(id);
    }

    _create(id) {
        let places = this.placesManager.get(id);

        for (let i = 0; i < places.length; i++)
            this._sections[id].addMenuItem(new PlaceMenuItem(places[i]));

        this._sections[id].actor.visible = places.length > 0;
    }
}

export default class PlacesMenuExtension extends Extension {
    enable() {
        this._indicator = new PlacesMenu();

        let pos = Main.sessionMode.panel.left.length;
        if ('apps-menu' in Main.panel.statusArea)
            pos++;
        Main.panel.addToStatusArea('places-menu', this._indicator, pos, 'left');
    }

    disable() {
        this._indicator.destroy();
        delete this._indicator;
    }
}
