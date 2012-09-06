/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Panel = imports.ui.panel;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;
const N_ = function(x) { return x; }

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const PlaceDisplay = Me.imports.placeDisplay;

const PLACE_ICON_SIZE = 16;

const PlaceMenuItem = new Lang.Class({
    Name: 'PlaceMenuItem',
    Extends: PopupMenu.PopupMenuItem,

    _init: function(info) {
	this.parent(info.name);
	this._info = info;

	this.addActor(new St.Icon({ gicon: info.icon,
				    icon_size: PLACE_ICON_SIZE }),
		     { align: St.Align.END, span: -1 });
    },

    activate: function(event) {
	this._info.launch(event.get_time());

	this.parent(event);
    },
});

const SECTIONS = {
    'special': N_("Places"),
    'devices': N_("Devices"),
    'bookmarks': N_("Bookmarks"),
    'network': N_("Network")
}

const PlacesMenu = new Lang.Class({
    Name: 'PlacesMenu.PlacesMenu',
    Extends: PanelMenu.SystemStatusButton,

    _init: function() {
        this.parent('folder-symbolic');
        this.placesManager = new PlaceDisplay.PlacesManager();

	this._sections = { };

	for (let foo in SECTIONS) {
	    let id = foo; // stupid JS closure semantics...
	    this._sections[id] = { section: new PopupMenu.PopupMenuSection(),
				   title: Gettext.gettext(SECTIONS[id]) };
	    this.placesManager.connect(id + '-updated', Lang.bind(this, function() {
		this._redisplay(id);
	    }));

	    this._create(id);
	    this.menu.addMenuItem(this._sections[id].section);
	}
    },

    destroy: function() {
	this.placesManager.destroy();

        this.parent();
    },

    _redisplay: function(id) {
	this._sections[id].section.removeAll();
        this._create(id);
    },

    _create: function(id) {
	let title = new PopupMenu.PopupMenuItem(this._sections[id].title,
						{ reactive: false,
                                                  style_class: 'popup-subtitle-menu-item' });
	this._sections[id].section.addMenuItem(title);

        let places = this.placesManager.get(id);

        for (let i = 0; i < places.length; i++)
            this._sections[id].section.addMenuItem(new PlaceMenuItem(places[i]));

	this._sections[id].section.actor.visible = places.length > 0;
    }
});

function init() {
    Convenience.initTranslations();
}

let _indicator;

function enable() {
    _indicator = new PlacesMenu;

    let pos = 1;
    if ('apps-menu' in Main.panel.statusArea)
	pos = 2;
    Main.panel.addToStatusArea('places-menu', _indicator, pos, 'left');
}

function disable() {
    _indicator.destroy();
}
