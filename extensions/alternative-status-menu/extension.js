/* -*- mode: js2 - indent-tabs-mode: nil - js2-basic-offset: 4 -*- */
const Lang = imports.lang;
const St = imports.gi.St;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const LOCK_ENABLED_KEY = 'lock-enabled';

let suspend_item = null;
let hibernate_item = null;
let poweroff_item = null;
let suspend_signal_id = 0, hibernate_signal_id = 0;
let settings = null;
let setting_changed_id = 0;

function updateSuspend(object, pspec, item) {
    item.actor.visible = object.get_can_suspend() && settings.get_boolean('allow-suspend');
}

function updateHibernate(object, pspec, item) {
    item.actor.visible = object.get_can_hibernate() && settings.get_boolean('allow-hibernate');
}

function onSuspendActivate(item) {
    Main.overview.hide();

    if (this._screenSaverSettings.get_boolean(LOCK_ENABLED_KEY)) {
        let tmpId = Main.screenShield.connect('lock-screen-shown', Lang.bind(this, function() {
            Main.screenShield.disconnect(tmpId);

            this._upClient.suspend_sync(null);
        }));

        Main.screenShield.lock(true);
    } else {
        this._upClient.suspend_sync(null);
    }
}

function onHibernateActivate(item) {
    Main.overview.hide();

    if (this._screenSaverSettings.get_boolean(LOCK_ENABLED_KEY)) {
        let tmpId = Main.screenShield.connect('lock-screen-shown', Lang.bind(this, function() {
            Main.screenShield.disconnect(tmpId);

            this._upClient.hibernate_sync(null);
        }));

        Main.screenShield.lock(true);
    } else {
        this._upClient.hibernate_sync(null);
    }
}

// Put your extension initialization code here
function init(metadata) {
    Convenience.initTranslations();
}

function enable() {
    let statusMenu = Main.panel.statusArea.userMenu;

    settings = Convenience.getSettings();

    let children = statusMenu.menu._getMenuItems();
    let index = children.length;

    /* find and destroy the old entry */
    for (let i = children.length - 1; i >= 0; i--) {
        if (children[i] == statusMenu._suspendOrPowerOffItem) {
            children[i].destroy();
            index = i;
            break;
        }
    }

    /* add the new entries */
    suspend_item = new PopupMenu.PopupMenuItem(_("Suspend"));
    suspend_item.connect('activate', Lang.bind(statusMenu, onSuspendActivate));
    suspend_signal_id = statusMenu._upClient.connect('notify::can-suspend', Lang.bind(statusMenu, updateSuspend, suspend_item));
    updateSuspend(statusMenu._upClient, null, suspend_item);
    
    hibernate_item = new PopupMenu.PopupMenuItem(_("Hibernate"));
    hibernate_item.connect('activate', Lang.bind(statusMenu, onHibernateActivate));
    hibernate_signal_id = statusMenu._upClient.connect('notify::can-hibernate', Lang.bind(statusMenu, updateHibernate, hibernate_item));
    updateHibernate(statusMenu._upClient, null, hibernate_item);
    
    poweroff_item = new PopupMenu.PopupMenuItem(_("Power Off"));
    poweroff_item.connect('activate', Lang.bind(statusMenu, function() {
	    this._session.ShutdownRemote();
    }));

    /* insert the entries at the found position */
    statusMenu.menu.addMenuItem(suspend_item, index);
    statusMenu.menu.addMenuItem(hibernate_item, index + 1);
    statusMenu.menu.addMenuItem(poweroff_item, index + 2);

    // clear out this to avoid criticals (we don't mess with
    // updateSuspendOrPowerOff)
    statusMenu._suspendOrPowerOffItem = null;

    setting_changed_id = settings.connect('changed', function() {
	updateSuspend(statusMenu._upClient, null, suspend_item);
	updateHibernate(statusMenu._upClient, null, hibernate_item);
    });
}

function disable() {
    let statusMenu = Main.panel.statusArea.userMenu;

    let children = statusMenu.menu._getMenuItems();
    let index = children.length;

    /* find the index for the previously created suspend entry */
    for (let i = children.length - 1; i >= 0; i--) {
        if (children[i] == suspend_item) {
            index = i;
            break;
        }
    }

    /* disconnect signals */
    statusMenu._upClient.disconnect(suspend_signal_id);
    statusMenu._upClient.disconnect(hibernate_signal_id);
    suspend_signal_id = hibernate_signal_id = 0;

    settings.disconnect(setting_changed_id);
    setting_changed_id = 0;
    settings = null;

    /* destroy the entries we had created */
    suspend_item.destroy();
    hibernate_item.destroy();
    poweroff_item.destroy();

    /* create a new suspend/poweroff entry */
    /* empty strings are fine for the labels, since we immediately call updateSuspendOrPowerOff */
    let item = new PopupMenu.PopupAlternatingMenuItem("", "");
    /* restore the userMenu field */
    statusMenu._suspendOrPowerOffItem = item;
    statusMenu.menu.addMenuItem(item, index);
    item.connect('activate', Lang.bind(statusMenu, statusMenu._onSuspendOrPowerOffActivate));
    statusMenu._updateSuspendOrPowerOff();
}
