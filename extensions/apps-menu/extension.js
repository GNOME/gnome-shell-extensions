/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const GMenu = imports.gi.GMenu;
const Lang = imports.lang;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const ICON_SIZE = 28;
let appsys = Shell.AppSystem.get_default();

function AppMenuItem() {
    this._init.apply(this, arguments);
}

AppMenuItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function (app, params) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, params);

        this._app = app;
        this.label = new St.Label({ text: app.get_name() });
        this.addActor(this.label);
        this._icon = app.create_icon_texture(ICON_SIZE);
        this.addActor(this._icon, { expand: false });
    },

    activate: function (event) {
        this._app.activate_full(-1, event.get_time());

        PopupMenu.PopupBaseMenuItem.prototype.activate.call(this, event);
    }

};

function ApplicationsButton() {
    this._init();
}

ApplicationsButton.prototype = {
    __proto__: PanelMenu.SystemStatusButton.prototype,

    _init: function() {
        PanelMenu.SystemStatusButton.prototype._init.call(this, 'start-here');
        this._display();
        appsys.connect('installed-changed', Lang.bind(this, this.reDisplay));
    },

    reDisplay : function() {
        this._clearAll();
        this._display();
    },

    _clearAll : function() {
        this.menu.removeAll();
    },

    // Recursively load a GMenuTreeDirectory; we could put this in ShellAppSystem too
    // (taken from js/ui/appDisplay.js in core shell)
    _loadCategory: function(dir, menu) {
        var iter = dir.iter();
        var nextType;
        while ((nextType = iter.next()) != GMenu.TreeItemType.INVALID) {
            if (nextType == GMenu.TreeItemType.ENTRY) {
                var entry = iter.get_entry();
                var app = appsys.lookup_app_by_tree_entry(entry);
                menu.addMenuItem(new AppMenuItem(app));
            } else if (nextType == GMenu.TreeItemType.DIRECTORY) {
                this._loadCategory(iter.get_directory(), appList);
            }
        }
    },

    _display : function() {
        let tree = appsys.get_tree();
        let root = tree.get_root_directory();

        let iter = root.iter();
        let nextType;
        while ((nextType = iter.next()) != GMenu.TreeItemType.INVALID) {
            if (nextType == GMenu.TreeItemType.DIRECTORY) {
                let dir = iter.get_directory();
                let item = new PopupMenu.PopupSubMenuMenuItem(dir.get_name());
                this._loadCategory(dir, item.menu);
                this.menu.addMenuItem(item);
            }
        }
    }
};

let appsMenuButton;

function enable() {
    appsMenuButton = new ApplicationsButton();
    Main.panel._leftBox.insert_actor(appsMenuButton.actor, 1);
    Main.panel._leftBox.child_set(appsMenuButton.actor, { y_fill : true } );
    Main.panel._menus.addMenu(appsMenuButton.menu);
}

function disable() {
    appsMenuButton.destroy();
}

function init() {
    /* do nothing */
}
