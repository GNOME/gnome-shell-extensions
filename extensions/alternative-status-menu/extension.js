/* -*- mode: js2 - indent-tabs-mode: nil - js2-basic-offset: 4 -*- */
const Lang = imports.lang;
const St = imports.gi.St;


const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const GnomeSession = imports.misc.gnomeSession;

const Gettext = imports.gettext.domain('gnome-shell');
const _ = Gettext.gettext;

function updateSuspendOrHibernate(object, pspec, item) {
    let canSuspend = this._upClient.get_can_suspend();
    let canHibernate = this._upClient.get_can_hibernate();

    if (!canSuspend && !canHibernate) {
	item.actor.hide();
	return;
    } else
	item.actor.show();
    if (!canSuspend && canHibernate) {
	item.updateText(_("Hibernate"), null);
	return;
    }
    let suspendText = _("Suspend");
    let hibernateText = canHibernate ? _("Hibernate") : null;
    item.updateText(suspendText, hibernateText);
}

function onSuspendOrHibernateActivate(item) {
    Main.overview.hide();

    let haveSuspend = this._upClient.get_can_suspend();
    let haveHibernate = this._upClient.get_can_hibernate();

    if (haveSuspend &&
        item.state == PopupMenu.PopupAlternatingMenuItemState.DEFAULT) {
        this._screenSaverProxy.LockRemote(Lang.bind(this, function() {
            this._upClient.suspend_sync(null);
        }));
    } else {
        this._screenSaverProxy.LockRemote(Lang.bind(this, function() {
            this._upClient.hibernate_sync(null);
        }));
    }
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

    item = new PopupMenu.PopupAlternatingMenuItem(_("Suspend"),
                                                  _("Hibernate"));
    this.menu.addMenuItem(item);
    item.connect('activate', Lang.bind(this, onSuspendOrHibernateActivate));
    this._upClient.connect('notify::can-suspend', Lang.bind(this, updateSuspendOrHibernate, item));
    this._upClient.connect('notify::can-hibernate', Lang.bind(this, updateSuspendOrHibernate, item));
    updateSuspendOrHibernate.call(this, null, null, item);

    item = new PopupMenu.PopupMenuItem(_("Power Off..."));
    item.connect('activate', Lang.bind(this, function() {
	this._session.ShutdownRemote();
    }));
    this.menu.addMenuItem(item);
}

// Put your extension initialization code here
function main(metadata) {
    let statusMenu = Main.panel._statusmenu;
    statusMenu.menu.removeAll();
    createSubMenu.call(statusMenu);
}
