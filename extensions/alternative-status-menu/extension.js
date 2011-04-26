/* -*- mode: js2 - indent-tabs-mode: nil - js2-basic-offset: 4 -*- */
const Lang = imports.lang;
const St = imports.gi.St;

const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const GnomeSession = imports.misc.gnomeSession;

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

    item = new PopupMenu.PopupImageMenuItem(_("Available"), 'user-available');
    item.connect('activate', Lang.bind(this, this._setPresenceStatus, GnomeSession.PresenceStatus.AVAILABLE));
    this.menu.addMenuItem(item);
    this._presenceItems[GnomeSession.PresenceStatus.AVAILABLE] = item;

    item = new PopupMenu.PopupImageMenuItem(_("Busy"), 'user-busy');
    item.connect('activate', Lang.bind(this, this._setPresenceStatus, GnomeSession.PresenceStatus.BUSY));
    this.menu.addMenuItem(item);
    this._presenceItems[GnomeSession.PresenceStatus.BUSY] = item;

    item = new PopupMenu.PopupSeparatorMenuItem();
    this.menu.addMenuItem(item);

    item = new PopupMenu.PopupMenuItem(_("My Account"));
    item.connect('activate', Lang.bind(this, this._onMyAccountActivate));
    this.menu.addMenuItem(item);

    item = new PopupMenu.PopupMenuItem(_("System Settings"));
    item.connect('activate', Lang.bind(this, this._onPreferencesActivate));
    this.menu.addMenuItem(item);

    item = new PopupMenu.PopupSeparatorMenuItem();
    this.menu.addMenuItem(item);

    item = new PopupMenu.PopupMenuItem(_("Lock Screen"));
    item.connect('activate', Lang.bind(this, this._onLockScreenActivate));
    this.menu.addMenuItem(item);

    item = new PopupMenu.PopupMenuItem(_("Switch User"));
    item.connect('activate', Lang.bind(this, this._onLoginScreenActivate));
    this.menu.addMenuItem(item);
    this._loginScreenItem = item;

    item = new PopupMenu.PopupMenuItem(_("Log Out..."));
    item.connect('activate', Lang.bind(this, this._onQuitSessionActivate));
    this.menu.addMenuItem(item);

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
function main(metadata) {
    imports.gettext.bindtextdomain('gnome-shell-extensions', metadata.localedir);

    let statusMenu = Main.panel._userMenu;
    statusMenu.menu.removeAll();
    createSubMenu.call(statusMenu);
}
