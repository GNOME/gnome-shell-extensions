// Drive menu extension
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const St = imports.gi.St;
const Shell = imports.gi.Shell;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const Main = imports.ui.main;
const Panel = imports.ui.panel;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

function DriveMenuItem(place) {
    this._init(place);
}

DriveMenuItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function(place) {
	PopupMenu.PopupBaseMenuItem.prototype._init.call(this);

	this.place = place;

	this.label = new St.Label({ text: place.name });
	this.addActor(this.label);

	let ejectIcon = new St.Icon({ icon_name: 'media-eject',
				      icon_type: St.IconType.SYMBOLIC,
				      style_class: 'popup-menu-icon ' });
	let ejectButton = new St.Button({ child: ejectIcon });
	ejectButton.connect('clicked', Lang.bind(this, this._eject));
	this.addActor(ejectButton);
    },

    _eject: function() {
	this.place.remove();
    },

    activate: function(event) {
	this.place.launch({ timestamp: event.get_time() });

	PopupMenu.PopupBaseMenuItem.prototype.activate.call(this, event);
    }
};

function DriveMenu() {
    this._init();
}

DriveMenu.prototype = {
    __proto__: PanelMenu.SystemStatusButton.prototype,

    _init: function() {
	// is 'media-eject' better?
	PanelMenu.SystemStatusButton.prototype._init.call(this, 'media-optical');

	this._manager = Main.placesManager;
	this._manager.connect('mounts-updated', Lang.bind(this, this._update));

	this._contentSection = new PopupMenu.PopupMenuSection();
	this.menu.addMenuItem(this._contentSection);

	this._update();

	this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
	this.menu.addAction(_("Open file manager"), function(event) {
	    let appSystem = Shell.AppSystem.get_default();
	    let app = appSystem.lookup_app('nautilus.desktop');
	    app.activate_full(-1, event.get_time());
	});
    },

    _update: function() {
	this._contentSection.removeAll();

	let mounts = this._manager.getMounts();
	let any = false;
	for (let i = 0; i < mounts.length; i++) {
	    if (mounts[i].isRemovable()) {
		this._contentSection.addMenuItem(new DriveMenuItem(mounts[i]));
		any = true;
	    }
	}

	this.actor.visible = any;
    },
}

// Put your extension initialization code here
function init(metadata) {
    imports.gettext.bindtextdomain('gnome-shell-extensions', metadata.localedir);
}

let _indicator;

function enable() {
    _indicator = new DriveMenu;
    Main.panel.addToStatusArea('drive-menu', _indicator);
}

function disable() {
    _indicator.destroy();
}
