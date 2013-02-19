/* -*- mode: js2 - indent-tabs-mode: nil - js2-basic-offset: 4 -*- */

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const St = imports.gi.St;

const BoxPointer = imports.ui.boxpointer;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const LOCK_ENABLED_KEY = 'lock-enabled';

let extension;

// Need to reimplement here the missing bits from LoginManager

function loginManager_hibernate() {
    if (this._proxy) {
        // systemd path
        this._proxy.call("Hibernate",
                         GLib.Variant.new('(b)', [true]),
                         Gio.DBusCallFlags.NONE,
                         -1, null, null);
    } else {
        // Can't do in ConsoleKit
        this.emit('prepare-for-sleep', true);
        this.emit('prepare-for-sleep', false);
    }
}

function loginManager_canHibernate(asyncCallback) {
    if (this._proxy) {
        // systemd path
        this._proxy.call("CanHibernate",
                         null,
                         Gio.DBusCallFlags.NONE,
                         -1, null, function(proxy, asyncResult) {
                             let result, error;

                             try {
                                 result = proxy.call_finish(asyncResult);
                             } catch(e) {
                                 error = e;
                             }

                             if (error)
                                 asyncCallback(false);
                             else
                                 asyncCallback(result[0] != 'no');
                         });
    } else {
        Mainloop.idle_add(Lang.bind(this, function() {
            asyncCallback(false);
            return false;
        }));
    }
}

function statusMenu_updateHaveHibernate() {
    loginManager_canHibernate.call(this._loginManager, Lang.bind(this,
        function(result) {
            this._haveHibernate = result;
            this._updateSuspendOrPowerOff();
        }));
}

function statusMenu_updateSuspendOrPowerOff() {
    this._suspendOrPowerOffItem.actor.hide();

    extension.suspendItem.actor.visible = this._haveSuspend;
    extension.hibernateItem.actor.visible = this._haveHibernate;
    extension.powerOffItem.actor.visible = this._haveShutdown;
}

function onSuspendActivate(item) {
    Main.overview.hide();

    this.menu.close(BoxPointer.PopupAnimation.NONE);
    this._loginManager.suspend();
}

function onHibernateActivate(item) {
    Main.overview.hide();

    this.menu.close(BoxPointer.PopupAnimation.NONE);
    loginManager_hibernate.call(this._loginManager);
}

const Extension = new Lang.Class({
    Name: 'AlternativeStatusMenu.Extension',

    _init: function() {
        this.suspendItem = null;
        this.hibernateItem = null;
        this.powerOffItem = null;

        Convenience.initTranslations();
        this._settings = Convenience.getSettings();
    },

    enable: function() {
        let statusMenu = Main.panel.statusArea.userMenu;

        let children = statusMenu.menu._getMenuItems();
        let index = children.length;

        /* find the old entry */
        for (let i = children.length - 1; i >= 0; i--) {
            if (children[i] == statusMenu._suspendOrPowerOffItem) {
                index = i;
                break;
            }
        }

        /* add the new entries */
        this.suspendItem = new PopupMenu.PopupMenuItem(_("Suspend"));
        this.suspendItem.connect('activate', Lang.bind(statusMenu, onSuspendActivate));

        this.hibernateItem = new PopupMenu.PopupMenuItem(_("Hibernate"));
        this.hibernateItem.connect('activate', Lang.bind(statusMenu, onHibernateActivate));

        this.powerOffItem = new PopupMenu.PopupMenuItem(_("Power Off"));
        this.powerOffItem.connect('activate', Lang.bind(statusMenu, function() {
	    this._session.ShutdownRemote();
        }));

        /* insert the entries at the found position */
        statusMenu.menu.addMenuItem(this.suspendItem, index);
        statusMenu.menu.addMenuItem(this.hibernateItem, index + 1);
        statusMenu.menu.addMenuItem(this.powerOffItem, index + 2);

        this._openStateChangedId = statusMenu.menu.connect('open-state-changed', function() {
            statusMenu_updateHaveHibernate.call(statusMenu);
        });

        this._previousUpdateSuspendOrPowerOff = statusMenu._updateSuspendOrPowerOff;
        statusMenu._updateSuspendOrPowerOff = statusMenu_updateSuspendOrPowerOff;

        this._settingsChangedId = this._settings.connect('changed', function() {
            statusMenu._updateSuspendOrPowerOff();
        });
    },

    disable: function() {
        let statusMenu = Main.panel.statusArea.userMenu;

        this.suspendItem.destroy();
        this.hibernateItem.destroy();
        this.powerOffItem.destroy();

        statusMenu.menu.disconnect(this._openStateChangedId);
        this._settings.disconnect(this._settingsChangedId);

        statusMenu._updateSuspendOrPowerOff = this._previousUpdateSuspendOrPowerOff;
        statusMenu._updateSuspendOrPowerOff();
    },
});

// Put your extension initialization code here
function init(metadata) {
    return (extension = new Extension());
}

