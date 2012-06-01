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
const PlaceDisplay = imports.ui.placeDisplay;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const DriveMenuItem = new Lang.Class({
    Name: 'DriveMenu.DriveMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function(place) {
	this.parent();

	this.place = place;

	this.label = new St.Label({ text: place.name });
	this.addActor(this.label);
        this.actor.label_actor = this.label;

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

	this.parent(event);
    }
});

const DriveMenu = new Lang.Class({
    Name: 'DriveMenu.DriveMenu',
    Extends: PanelMenu.SystemStatusButton,

    _init: function() {
	this.parent('media-eject', _("Removable devices"));

	this._manager = new PlaceDisplay.PlacesManager();
	this._updatedId = this._manager.connect('mounts-updated', Lang.bind(this, this._update));

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

    destroy: function() {
	this._manager.disconnect(this._updatedId);

	this.parent();
    },
});

function init() {
    Convenience.initTranslations();
}

let _indicator;

function enable() {
    _indicator = new DriveMenu;
    Main.panel.addToStatusArea('drive-menu', _indicator);
}

function disable() {
    _indicator.destroy();
}
