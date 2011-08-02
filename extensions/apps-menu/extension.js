/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const St = imports.gi.St;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;
const Shell = imports.gi.Shell;
const Lang = imports.lang;
const ICON_SIZE = 28;

let appsys = Shell.AppSystem.get_default();

function AppMenuItem(appInfo,params) {
    this._init(appInfo,params);
}

AppMenuItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,
    _init: function (appInfo, params) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, params);
        let app = appsys.get_app(appInfo.get_id());
        this.label = new St.Label({ text: appInfo.get_name() });
        this.addActor(this.label);
        this._icon = app.create_icon_texture(ICON_SIZE);
        this.addActor(this._icon,{expand : false});
        this._appInfo = appInfo;
    },
    _onButtonReleaseEvent: function (actor, event) {
        let id = this._appInfo.get_id();
        appsys.get_app(id).activate(-1);
        this.activate(event);
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
        appsys.connect('installed-changed', Lang.bind(this,this.reDisplay));
    },

    reDisplay : function() {
        this._clearAll();
        this._display();
    },

    _clearAll : function() {
        this.menu.removeAll();
    },

    _display : function() {
        let id;
        this.appItems = [];
        this.categories =  appsys.get_sections();
        for ( id = 0; id < this.categories.length; id++) {
            this.appItems[this.categories[id]] = new PopupMenu.PopupSubMenuMenuItem(this.categories[id]);
            this.menu.addMenuItem(this.appItems[this.categories[id]]);
        }
        this._addSubMenuItems();
        for ( id = 0; id < this.categories.length; id++) {
            let item = this.appItems[this.categories[id]];
            if(item.menu._getMenuItems().length == 0){
                item.actor.hide();
            }
        }
    },
    _addSubMenuItems: function() {
        let appInfos = appsys.get_flattened_apps().filter(function(app) {
            return !app.get_is_nodisplay();
        });
        for (let appid = appInfos.length-1 ; appid >= 0; appid--) {
            let appInfo = appInfos[appid];
            let appItem = new AppMenuItem(appInfo);
            this.appItems[appInfo.get_section()].menu.addMenuItem(appItem);
        }
    },
    _onDestroy: function() {
        this._clearAll();
    }
};


function init(metadata) {
    // nothing to do here
}

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