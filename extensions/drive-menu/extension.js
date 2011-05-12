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

function DriveMenuItem(drive) {
    this._init(drive);
}

DriveMenuItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function(drive) {
	PopupMenu.PopupBaseMenuItem.prototype._init.call(this);

	this.label = new St.Label();
	this.addActor(this.label);

	this.drive = drive;
	this._driveChangedId = this.drive.connect('changed', Lang.bind(this, this._updatePrimaryVolume));
	this._updatePrimaryVolume();

	let ejectIcon = new St.Icon({ icon_name: 'media-eject',
				      icon_type: St.IconType.SYMBOLIC,
				      style_class: 'popup-menu-icon ' });
	let ejectButton = new St.Button({ child: ejectIcon });
	ejectButton.connect('clicked', Lang.bind(this, this._eject));
	this.addActor(ejectButton);
    },

    _updatePrimaryVolume: function() {
	// this should never fail, for the kind of GDrives we support
	this._volumes = this.drive.get_volumes();

	if (this._volumes && this._volumes.length) {
	    // any better idea, in case an external USB drive is partitioned?
	    this._primaryVolume = this._volumes[0];
	    this.label.text = this._primaryVolume.get_name();
	} else {
	    this._primaryVolume = null;
	    this.label.text = this.drive.get_name();
	}
    },

    _eject: function() {
	if (this.drive.can_eject())
	    this.drive.eject_with_operation(Gio.MountUnmountFlags.NONE,
					    null, // Gio.MountOperation
					    null, // Gio.Cancellable
					    Lang.bind(this, this._ejectFinish));
	else
	    this.drive.stop(Gio.MountUnmountFlags.NONE,
			    null, // Gio.MountOperation
			    null, // Gio.Cancellable
			    Lang.bind(this, this._stopFinish));
    },

    _stopFinish: function(drive, result) {
	try {
	    drive.stop_finish(result);
	} catch(e) {
	    this._reportFailure(e);
	}
    },

    _ejectFinish: function(drive, result) {
	try {
	    drive.eject_with_operation_finish(result);
	} catch(e) {
	    this._reportFailure(e);
	}
    },

    _reportFailure: function(exception) {
	let msg = _("Ejecting drive '%s' failed:").format(this.drive.get_name());
	Main.notifyError(msg, exception.message);
    },

    _launchMount: function(mount) {
	let root = mount.get_root();
	// most of times will be nautilus, but it can change depending of volume contents
	let appInfo = root.query_default_handler(null);
	appInfo.launch([root], new Gio.AppLaunchContext());
    },

    destroy: function() {
	if (this._driveChangedId) {
	    this.drive.disconnect(this._driveChangedId);
	    this._driveChangedId = 0;
	}

	PopupMenu.PopupBaseMenuItem.prototype.destroy.call(this);
    },

    activate: function(event) {
	if (!this._primaryVolume) {
	    // can't do anything
	    PopupMenu.PopupBaseMenuItem.prototype.activate.call(this, event);
	    return;
	}

	let mount = this._primaryVolume.get_mount();
	if (mount) {
	    this._launchMount(mount);
	} else {
	    // try mounting the volume
	    this._primaryVolume.mount(Gio.MountMountFlags.NONE, null, null, Lang.bind(this, function(volume, result) {
		try {
		    volume.mount_finish(result);
		    this._launchMount(volume.get_mount());
		} catch(e) {
		    let msg = _("Mounting drive '%s' failed:").format(this.drive.get_name());
		    Main.notifyError(msg, e.message);
		}
	    }));
	}

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

	this._monitor = Gio.VolumeMonitor.get();
	this._monitor.connect('drive-connected', Lang.bind(this, function(monitor, drive) {
	    this._addDrive(drive);
	    this._updateMenuVisibility();
	}));
	this._monitor.connect('drive-disconnected', Lang.bind(this, function(monitor, drive) {
	    this._removeDrive(drive);
	    this._updateMenuVisibility();
	}));

	this._drives = [ ];

	this._monitor.get_connected_drives().forEach(Lang.bind(this, this._addDrive));

	this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
	this.menu.addAction(_("Open file manager"), function(event) {
	    let appSystem = Shell.AppSystem.get_default();
	    let app = appSystem.get_app('nautilus.desktop');
	    app.activate(-1);
	});

	this._updateMenuVisibility();
    },

    _isDriveInteresting: function(drive) {
	// We show only drives that are physically removable
	// (no network drives, no lvm/mdraid, no optical drives)
	return drive.can_stop() && drive.get_start_stop_type() == Gio.DriveStartStopType.SHUTDOWN;
    },

    _addDrive: function(drive) {
	if (!this._isDriveInteresting(drive))
	    return;

	let item = new DriveMenuItem(drive);
	this._drives.unshift(item);
	this.menu.addMenuItem(item, 0);
    },

    _removeDrive: function(drive) {
	if (!this._isDriveInteresting(drive))
	    return;

	for (let i = 0; i < this._drives.length; i++) {
	    let item = this._drives[i];
	    if (item.drive == drive) {
		item.destroy();
		this._drives.splice(i, 1);
		return;
	    }
	}
	log ('Removing a drive that was never added to the menu');
    },

    _updateMenuVisibility: function() {
	if (this._drives.length > 0)
	    this.actor.show();
	else
	    this.actor.hide();
    }
}

// Put your extension initialization code here
function main(metadata) {
    imports.gettext.bindtextdomain('gnome-shell-extensions', metadata.localedir);

    Panel.STANDARD_TRAY_ICON_ORDER.unshift('drive-menu');
    Panel.STANDARD_TRAY_ICON_SHELL_IMPLEMENTATION['drive-menu'] = DriveMenu;
}
