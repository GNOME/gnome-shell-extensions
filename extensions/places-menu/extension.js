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
const PlaceDisplay = imports.ui.placeDisplay;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const PLACE_ICON_SIZE = 16;

function iconForPlace(place) {
    let split = place.id.split(':');
    let kind = split.shift();
    let uri = split.join(':');

    let gicon = new Gio.ThemedIcon({ name: 'folder-symbolic' });
    switch(kind) {
    case 'special':
	switch(uri) {
	case 'home':
	    gicon = new Gio.ThemedIcon({ name: 'user-home-symbolic' });
	    break;
	case 'desktop':
	    // FIXME: There is no user-desktop-symbolic
	    gicon = new Gio.ThemedIcon({ name: 'folder-symbolic' });
	    break;
	}
	break;
    case 'bookmark':
	let info = Gio.File.new_for_uri(uri).query_info('standard::symbolic-icon', 0, null);
	gicon = info.get_symbolic_icon(info);
	break;
    case 'mount':
	gicon = place._mount.get_symbolic_icon();
	break;
    }

    return new St.Icon({ gicon: gicon,
			 icon_size: PLACE_ICON_SIZE });
}

const PlacesMenu = new Lang.Class({
    Name: 'PlacesMenu.PlacesMenu',
    Extends: PanelMenu.SystemStatusButton,

    _init: function() {
        this.parent('folder-symbolic');
        this.placesManager = new PlaceDisplay.PlacesManager();

        this.defaultItems = [];
        this.bookmarkItems = [];
        this.deviceItems = [];
        this._createDefaultPlaces();
        this._bookmarksSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._bookmarksSection);
        this._createBookmarks();
        this._devicesMenuItem = new PopupMenu.PopupSubMenuMenuItem(_("Removable Devices"));
        this.menu.addMenuItem(this._devicesMenuItem);
        this._createDevices();

        this._bookmarksId = this.placesManager.connect('bookmarks-updated',Lang.bind(this,this._redisplayBookmarks));
        this._mountsId = this.placesManager.connect('mounts-updated',Lang.bind(this,this._redisplayDevices));
    },

    destroy: function() {
        this.placesManager.disconnect(this._bookmarksId);
        this.placesManager.disconnect(this._mountsId);

        this.parent();
    },

    _redisplayBookmarks: function(){
        this._clearBookmarks();
        this._createBookmarks();
    },

    _redisplayDevices: function(){
        this._clearDevices();
        this._createDevices();
    },

    _createDefaultPlaces : function() {
        this.defaultPlaces = this.placesManager.getDefaultPlaces();

        for (let placeid = 0; placeid < this.defaultPlaces.length; placeid++) {
            this.defaultItems[placeid] = new PopupMenu.PopupMenuItem(this.defaultPlaces[placeid].name);
            let icon = iconForPlace(this.defaultPlaces[placeid]);
            this.defaultItems[placeid].addActor(icon, { align: St.Align.END, span: -1 });
            this.defaultItems[placeid].place = this.defaultPlaces[placeid];
            this.menu.addMenuItem(this.defaultItems[placeid]);
            this.defaultItems[placeid].connect('activate', function(actor,event) {
                actor.place.launch();
            });

        }
    },

    _createBookmarks : function() {
        this.bookmarks = this.placesManager.getBookmarks();

        for (let bookmarkid = 0; bookmarkid < this.bookmarks.length; bookmarkid++) {
            this.bookmarkItems[bookmarkid] = new PopupMenu.PopupMenuItem(this.bookmarks[bookmarkid].name);
            let icon = iconForPlace(this.bookmarks[bookmarkid]);
            this.bookmarkItems[bookmarkid].addActor(icon, { align: St.Align.END, span: -1 });
            this.bookmarkItems[bookmarkid].place = this.bookmarks[bookmarkid];
            this._bookmarksSection.addMenuItem(this.bookmarkItems[bookmarkid]);
            this.bookmarkItems[bookmarkid].connect('activate', function(actor,event) {
                actor.place.launch();
            });
        }
    },

    _createDevices : function() {
        this.devices = this.placesManager.getMounts();

        for (let devid = 0; devid < this.devices.length; devid++) {
            this.deviceItems[devid] = new PopupMenu.PopupMenuItem(this.devices[devid].name);
            let icon = iconForPlace(this.devices[devid]);
            this.deviceItems[devid].addActor(icon, { align: St.Align.END, span: -1 });
            this.deviceItems[devid].place = this.devices[devid];
            this._devicesMenuItem.menu.addMenuItem(this.deviceItems[devid]);
            this.deviceItems[devid].connect('activate', function(actor,event) {
                actor.place.launch();
            });
        }

        if (this.devices.length == 0)
            this._devicesMenuItem.actor.hide();
        else
            this._devicesMenuItem.actor.show();
    },

    _clearBookmarks : function(){
        this._bookmarksSection.removeAll();
        this.bookmarkItems = [];
    },

    _clearDevices : function(){
        this._devicesMenuItem.menu.removeAll();
        this.deviceItems = [];
    },
});

function init() {
    Convenience.initTranslations();
}

let _indicator;

function enable() {
    _indicator = new PlacesMenu;
    Main.panel.addToStatusArea('places-menu', _indicator);
}

function disable() {
    _indicator.destroy();
}
