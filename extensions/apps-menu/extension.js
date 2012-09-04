/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const GMenu = imports.gi.GMenu;
const Lang = imports.lang;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const ICON_SIZE = 28;

const AppMenuItem = new Lang.Class({
    Name: 'AppsMenu.AppMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function (app, params) {
        this.parent(params);

        this._app = app;
        this.label = new St.Label({ text: app.get_name() });
        this.addActor(this.label);
        this._icon = app.create_icon_texture(ICON_SIZE);
        this.addActor(this._icon, { expand: false });
    },

    activate: function (event) {
        this._app.activate_full(-1, event.get_time());

        this.parent(event);
    }

});

const ApplicationsButton = new Lang.Class({
    Name: 'AppsMenu.ApplicationsButton',
    Extends: PanelMenu.SystemStatusButton,

    _init: function() {
        this.parent('start-here-symbolic');

        this._appSys = Shell.AppSystem.get_default();
        this._installedChangedId = this._appSys.connect('installed-changed', Lang.bind(this, this._refresh));

        this._display();
    },

    destroy: function() {
        this._appSys.disconnect(this._installedChangedId);

        this.parent();
    },

    _refresh: function() {
        this._clearAll();
        this._display();
    },

    _clearAll: function() {
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
                var app = this._appSys.lookup_app_by_tree_entry(entry);
                if (!entry.get_app_info().get_nodisplay())
                    menu.addMenuItem(new AppMenuItem(app));
            } else if (nextType == GMenu.TreeItemType.DIRECTORY) {
                this._loadCategory(iter.get_directory(), menu);
            }
        }
    },

    _display : function() {
        let tree = this._appSys.get_tree();
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
});

let appsMenuButton;

function enable() {
    appsMenuButton = new ApplicationsButton();
    Main.panel.addToStatusArea('apps-menu', appsMenuButton, 1, 'left');
}

function disable() {
    appsMenuButton.destroy();
}

function init() {
    /* do nothing */
}
