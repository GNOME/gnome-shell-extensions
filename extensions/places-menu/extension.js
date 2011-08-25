/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Gdk = imports.gi.Gdk;
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

const PLACE_ICON_SIZE = 22;

function PlacesMenu() {
    this._init.apply(this, arguments);
}

PlacesMenu.prototype = {
    __proto__: PanelMenu.SystemStatusButton.prototype,

    _init: function() {
        PanelMenu.SystemStatusButton.prototype._init.call(this, 'folder');

        this.defaultItems = [];
        this.bookmarkItems = [];
        this.deviceItems = [];
        this._createDefaultPlaces();
        this._bookmarksSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._bookmarksSection);
        this._createBookmarks();
        this._devicesMenuItem = new PopupMenu.PopupSubMenuMenuItem('Removable Devices');
        this.menu.addMenuItem(this._devicesMenuItem);
        this._createDevices();
        Main.placesManager.connect('bookmarks-updated',Lang.bind(this,this._redisplayBookmarks));
        Main.placesManager.connect('mounts-updated',Lang.bind(this,this._redisplayDevices));
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
        this.defaultPlaces = Main.placesManager.getDefaultPlaces();

        for (let placeid = 0; placeid < this.defaultPlaces.length; placeid++) {
            this.defaultItems[placeid] = new PopupMenu.PopupMenuItem(_(this.defaultPlaces[placeid].name));
            let icon = this.defaultPlaces[placeid].iconFactory(PLACE_ICON_SIZE);
            this.defaultItems[placeid].addActor(icon, { align: St.Align.END});
            this.defaultItems[placeid].place = this.defaultPlaces[placeid];
            this.menu.addMenuItem(this.defaultItems[placeid]);
            this.defaultItems[placeid].connect('activate', function(actor,event) {
                actor.place.launch();
            });

        }
    },

    _createBookmarks : function() {
        this.bookmarks = Main.placesManager.getBookmarks();

        for (let bookmarkid = 0; bookmarkid < this.bookmarks.length; bookmarkid++) {
            this.bookmarkItems[bookmarkid] = new PopupMenu.PopupMenuItem(_(this.bookmarks[bookmarkid].name));
            let icon = this.bookmarks[bookmarkid].iconFactory(PLACE_ICON_SIZE);
            this.bookmarkItems[bookmarkid].addActor(icon, { align: St.Align.END});
            this.bookmarkItems[bookmarkid].place = this.bookmarks[bookmarkid];
            this._bookmarksSection.addMenuItem(this.bookmarkItems[bookmarkid]);
            this.bookmarkItems[bookmarkid].connect('activate', function(actor,event) {
                actor.place.launch();
            });
        }
    },

    _createDevices : function() {
        this.devices = Main.placesManager.getMounts();

        for (let devid = 0; devid < this.devices.length; devid++) {
            this.deviceItems[devid] = new PopupMenu.PopupMenuItem(_(this.devices[devid].name));
            let icon = this.devices[devid].iconFactory(PLACE_ICON_SIZE);
            this.deviceItems[devid].addActor(icon, { align: St.Align.END});
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
        this.DeviceItems = [];
    },
};


function init(metadata) {
    imports.gettext.bindtextdomain('gnome-shell-extensions', metadata.localedir);
}

let _indicator;

function enable() {
    _indicator = new PlacesMenu;
    Main.panel.addToStatusArea('places-menu', _indicator);
}

function disable() {
    _indicator.destroy();
}
