/* -*- mode: js2 - indent-tabs-mode: nil - js2-basic-offset: 4 -*- */
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const St = imports.gi.St;

const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const GnomeSession = imports.misc.gnomeSession;
const UserMenu = imports.ui.userMenu;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

function updateSuspend(object, pspec, item) {
    item.actor.visible = object.get_can_suspend();
}

function updateHibernate(object, pspec, item) {
    item.actor.visible = object.get_can_hibernate();
}

function onSuspendActivate(item) {
    Main.overview.hide();

    this._screenSaverProxy.LockRemote(Lang.bind(this, function() {
        this._upClient.suspend_sync(null);
    }));
}

function onHibernateActivate(item) {
    Main.overview.hide();

    this._screenSaverProxy.LockRemote(Lang.bind(this, function() {
        this._upClient.hibernate_sync(null);
    }));
}

function createSubMenu() {
    let item;

    item = new UserMenu.IMStatusChooserItem();
    item.connect('activate', Lang.bind(this, this._onMyAccountActivate));
    this.menu.addMenuItem(item);

    item = new PopupMenu.PopupSwitchMenuItem(_("Notifications"));
    item.connect('activate', Lang.bind(this, this._updatePresenceStatus));
    this.menu.addMenuItem(item);
    this._notificationsSwitch = item;

    item = new PopupMenu.PopupSeparatorMenuItem();
    this.menu.addMenuItem(item);

    item = new PopupMenu.PopupMenuItem(_("Online Accounts"));
    item.connect('activate', Lang.bind(this, this._onOnlineAccountsActivate));
    this.menu.addMenuItem(item);

    item = new PopupMenu.PopupMenuItem(_("System Settings"));
    item.connect('activate', Lang.bind(this, this._onPreferencesActivate));
    this.menu.addMenuItem(item);

    item = new PopupMenu.PopupSeparatorMenuItem();
    this.menu.addMenuItem(item);

    item = new PopupMenu.PopupMenuItem(_("Lock Screen"));
    item.connect('activate', Lang.bind(this, this._onLockScreenActivate));
    this.menu.addMenuItem(item);
    this._lockScreenItem = item;

    item = new PopupMenu.PopupMenuItem(_("Switch User"));
    item.connect('activate', Lang.bind(this, this._onLoginScreenActivate));
    this.menu.addMenuItem(item);
    this._loginScreenItem = item;

    item = new PopupMenu.PopupMenuItem(_("Log Out..."));
    item.connect('activate', Lang.bind(this, this._onQuitSessionActivate));
    this.menu.addMenuItem(item);
    this._logoutItem = item;

    item = new PopupMenu.PopupSeparatorMenuItem();
    this.menu.addMenuItem(item);

    item = new PopupMenu.PopupMenuItem(_("Suspend"));
    item.connect('activate', Lang.bind(this, onSuspendActivate));
    this._upClient.connect('notify::can-suspend', Lang.bind(this, updateSuspend, item));
    updateSuspend(this._upClient, null, item);
    this.menu.addMenuItem(item);

    item = new PopupMenu.PopupMenuItem(_("Hibernate"));
    item.connect('activate', Lang.bind(this, onHibernateActivate));
    this._upClient.connect('notify::can-hibernate', Lang.bind(this, updateHibernate, item));
    updateHibernate(this._upClient, null, item);
    this.menu.addMenuItem(item);

    item = new PopupMenu.PopupMenuItem(_("Power Off..."));
    item.connect('activate', Lang.bind(this, function() {
	this._session.ShutdownRemote();
    }));
    this.menu.addMenuItem(item);
}

// Put your extension initialization code here
function init(metadata) {
    imports.gettext.bindtextdomain('gnome-shell-extensions', GLib.build_filenamev([metadata.path, 'locale']));
}

function predestroy(statusMenu) {
    // HACK! disconnect signals to avoid references to destroyed objects
    let imstatusitem = statusMenu.menu._getMenuItems()[0];
    imstatusitem._user.disconnect(imstatusitem._userLoadedId);
    imstatusitem._user.disconnect(imstatusitem._userChangedId);
}

function reset(statusMenu) {
    statusMenu._updateSwitchUser();
    statusMenu._updateLogout();
    statusMenu._updateLockScreen();

    statusMenu._presence.getStatus(Lang.bind(statusMenu, statusMenu._updateSwitch));

    // HACK! Obtain the IMStatusChooserItem and force a _updateUser
    statusMenu.menu._getMenuItems()[0]._updateUser();
}

function enable() {
    let statusMenu = Main.panel._statusArea.userMenu;

    predestroy(statusMenu);
    statusMenu.menu.removeAll();

    createSubMenu.call(statusMenu);
    reset(statusMenu);
}

function disable() {
    // not guarranteed to work, if more extensions operate in the same place
    let statusMenu = Main.panel._statusArea.userMenu;

    predestroy(statusMenu);
    statusMenu.menu.removeAll();

    statusMenu._createSubMenu();
    reset(statusMenu);
}
