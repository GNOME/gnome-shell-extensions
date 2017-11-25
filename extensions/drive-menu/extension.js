// Drive menu extension
const Clutter = imports.gi.Clutter;
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
const ShellMountOperation = imports.ui.shellMountOperation;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const MountMenuItem = new Lang.Class({
    Name: 'DriveMenu.MountMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function(mount) {
        this.parent();

        this.label = new St.Label({ text: mount.get_name() });
        this.actor.add(this.label, { expand: true });
        this.actor.label_actor = this.label;

        this.mount = mount;

        let ejectIcon = new St.Icon({ icon_name: 'media-eject-symbolic',
                                      style_class: 'popup-menu-icon ' });
        let ejectButton = new St.Button({ child: ejectIcon });
        ejectButton.connect('clicked', Lang.bind(this, this._eject));
        this.actor.add(ejectButton);

        this._changedId = mount.connect('changed', Lang.bind(this, this._syncVisibility));
        this._syncVisibility();
    },

    destroy: function() {
        if (this._changedId) {
            this.mount.disconnect(this._changedId);
            this._changedId = 0;
        }

        this.parent();
    },

    _isInteresting: function() {
        if (!this.mount.can_eject() && !this.mount.can_unmount())
            return false;
        if (this.mount.is_shadowed())
            return false;

        let volume = this.mount.get_volume();

        if (volume == null) {
            // probably a GDaemonMount, could be network or
            // local, but we can't tell; assume it's local for now
            return true;
        }

        return volume.get_identifier('class') != 'network';
    },

    _syncVisibility: function() {
        this.actor.visible = this._isInteresting();
    },

    _eject: function() {
        let mountOp = new ShellMountOperation.ShellMountOperation(this.mount);

        if (this.mount.can_eject())
            this.mount.eject_with_operation(Gio.MountUnmountFlags.NONE,
                                            mountOp.mountOp,
                                            null, // Gio.Cancellable
                                            Lang.bind(this, this._ejectFinish));
        else
            this.mount.unmount_with_operation(Gio.MountUnmountFlags.NONE,
                                              mountOp.mountOp,
                                              null, // Gio.Cancellable
                                              Lang.bind(this, this._unmountFinish));
    },

    _unmountFinish: function(mount, result) {
        try {
            mount.unmount_with_operation_finish(result);
        } catch(e) {
            this._reportFailure(e);
        }
    },

    _ejectFinish: function(mount, result) {
        try {
            mount.eject_with_operation_finish(result);
        } catch(e) {
            this._reportFailure(e);
        }
    },

    _reportFailure: function(exception) {
        // TRANSLATORS: %s is the filesystem name
        let msg = _("Ejecting drive “%s” failed:").format(this.mount.get_name());
        Main.notifyError(msg, exception.message);
    },

    activate: function(event) {
        let context = global.create_app_launch_context(event.get_time(), -1);
        Gio.AppInfo.launch_default_for_uri(this.mount.get_root().get_uri(),
                                           context);

        this.parent(event);
    }
});

const DriveMenu = new Lang.Class({
    Name: 'DriveMenu.DriveMenu',
    Extends: PanelMenu.Button,

    _init: function() {
        this.parent(0.0, _("Removable devices"));

        let hbox = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
        let icon = new St.Icon({ icon_name: 'media-eject-symbolic',
                                 style_class: 'system-status-icon' });

        hbox.add_child(icon);
        hbox.add_child(PopupMenu.arrowIcon(St.Side.BOTTOM));
        this.actor.add_child(hbox);

        this._monitor = Gio.VolumeMonitor.get();
        this._addedId = this._monitor.connect('mount-added', (monitor, mount) => {
            this._addMount(mount);
            this._updateMenuVisibility();
        });
        this._removedId = this._monitor.connect('mount-removed', (monitor, mount) => {
            this._removeMount(mount);
            this._updateMenuVisibility();
        });

        this._mounts = [ ];

        this._monitor.get_mounts().forEach(Lang.bind(this, this._addMount));

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction(_("Open Files"), event => {
            let appSystem = Shell.AppSystem.get_default();
            let app = appSystem.lookup_app('org.gnome.Nautilus.desktop');
            app.activate_full(-1, event.get_time());
        });

        this._updateMenuVisibility();
    },

    _updateMenuVisibility: function() {
        if (this._mounts.filter(i => i.actor.visible).length > 0)
            this.actor.show();
        else
            this.actor.hide();
    },

    _addMount: function(mount) {
        let item = new MountMenuItem(mount);
        this._mounts.unshift(item);
        this.menu.addMenuItem(item, 0);
    },

    _removeMount: function(mount) {
        for (let i = 0; i < this._mounts.length; i++) {
            let item = this._mounts[i];
            if (item.mount == mount) {
                item.destroy();
                this._mounts.splice(i, 1);
                return;
            }
        }
        log ('Removing a mount that was never added to the menu');
    },

    destroy: function() {
        if (this._connectedId) {
            this._monitor.disconnect(this._connectedId);
            this._monitor.disconnect(this._disconnectedId);
            this._connectedId = 0;
            this._disconnectedId = 0;
        }

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
