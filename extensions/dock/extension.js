/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Clutter = imports.gi.Clutter;
const Pango = imports.gi.Pango;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Shell = imports.gi.Shell;
const Lang = imports.lang;
const Signals = imports.signals;
const St = imports.gi.St;
const Mainloop = imports.mainloop;

const AppFavorites = imports.ui.appFavorites;
const DND = imports.ui.dnd;
const Main = imports.ui.main;
const Overview = imports.ui.overview;
const PopupMenu = imports.ui.popupMenu;
const Search = imports.ui.search;
const Tweener = imports.ui.tweener;
const Workspace = imports.ui.workspace;
const AppDisplay = imports.ui.appDisplay;
const AltTab = imports.ui.altTab;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

// Settings
const DOCK_SETTINGS_SCHEMA = 'org.gnome.shell.extensions.dock';
const DOCK_POSITION_KEY = 'position';
const DOCK_SIZE_KEY = 'size';

// Keep enums in sync with GSettings schemas
const PositionMode = {
    LEFT: 0,
    RIGHT: 1
};

let position = PositionMode.RIGHT;
let dockicon_size = 48;
const DND_RAISE_APP_TIMEOUT = 500;

function Dock() {
    this._init();
}

Dock.prototype = {
    _init : function() {
        this._placeholderText = null;
        this._menus = [];
        this._menuDisplays = [];

        this._favorites = [];

        // Load Settings
        this._settings = new Gio.Settings({ schema: DOCK_SETTINGS_SCHEMA });
        position = this._settings.get_enum(DOCK_POSITION_KEY);
        dockicon_size = this._settings.get_int(DOCK_SIZE_KEY);
        //global.log("POSITION: " + position);
        //global.log("dockicon_size: " + dockicon_size);


        this._spacing = 4;
        this._item_size = dockicon_size;

        this.actor = new St.BoxLayout({ name: 'dock', vertical: true, reactive: true });

        this._grid = new Shell.GenericContainer();
        this.actor.add(this._grid, { expand: true, y_align: St.Align.START });
        this.actor.connect('style-changed', Lang.bind(this, this._onStyleChanged));

        this._grid.connect('get-preferred-width', Lang.bind(this, this._getPreferredWidth));
        this._grid.connect('get-preferred-height', Lang.bind(this, this._getPreferredHeight));
        this._grid.connect('allocate', Lang.bind(this, this._allocate));

        this._workId = Main.initializeDeferredWork(this.actor, Lang.bind(this, this._redisplay));

        this._tracker = Shell.WindowTracker.get_default();
        this._appSystem = Shell.AppSystem.get_default();

        this._appSystem.connect('installed-changed', Lang.bind(this, this._queueRedisplay));
        AppFavorites.getAppFavorites().connect('changed', Lang.bind(this, this._queueRedisplay));
        this._tracker.connect('app-state-changed', Lang.bind(this, this._queueRedisplay));

        Main.chrome.addActor(this.actor, { visibleInOverview: false });
        this.actor.lower_bottom();
    },

    _appIdListToHash: function(apps) {
        let ids = {};
        for (let i = 0; i < apps.length; i++)
            ids[apps[i].get_id()] = apps[i];
        return ids;
    },

    _queueRedisplay: function () {
        Main.queueDeferredWork(this._workId);
    },

    _redisplay: function () {
        this.removeAll();

        let favorites = AppFavorites.getAppFavorites().getFavoriteMap();

        /* hardcode here pending some design about how exactly desktop contexts behave */
        let contextId = '';

        let running = this._tracker.get_running_apps(contextId);
        let runningIds = this._appIdListToHash(running);

        let icons = 0;

        let nFavorites = 0;
        for (let id in favorites) {
            let app = favorites[id];
            let display = new DockIcon(app);
            this.addItem(display.actor);
            nFavorites++;
            icons++;
        }

        for (let i = 0; i < running.length; i++) {
            let app = running[i];
            if (app.get_id() in favorites)
                continue;
            let display = new DockIcon(app);
            icons++;
            this.addItem(display.actor);
        }
        if (this._placeholderText) {
            this._placeholderText.destroy();
            this._placeholderText = null;
        }

        if (running.length == 0 && nFavorites == 0) {
            this._placeholderText = new St.Label({ text: _("Drag here to add favorites") });
            this.actor.add_actor(this._placeholderText);
        }

        let primary = global.get_primary_monitor();
        let height = (icons)*(this._item_size + this._spacing) + 2*this._spacing;
        let width = (icons)*(this._item_size + this._spacing) + 2*this._spacing;
        
        switch (position) {
            case PositionMode.LEFT:
                this.actor.set_size(this._item_size + 4*this._spacing, height);
                this.actor.set_position(0-this._spacing-4, (primary.height-height)/2);
                break;
            case PositionMode.RIGHT:
            default:
                this.actor.set_size(this._item_size + 4*this._spacing, height);
                this.actor.set_position(primary.width-this._item_size-this._spacing-2, (primary.height-height)/2);
        }
    },

    _getPreferredWidth: function (grid, forHeight, alloc) {
        alloc.min_size = this._item_size;
        alloc.natural_size = this._item_size + this._spacing;
    },

    _getPreferredHeight: function (grid, forWidth, alloc) {
        let children = this._grid.get_children();
        let nRows = children.length;
        let totalSpacing = Math.max(0, nRows - 1) * this._spacing;
        let height = nRows * this._item_size + totalSpacing;
        alloc.min_size = height;
        alloc.natural_size = height;
    },

    _allocate: function (grid, box, flags) {
        let children = this._grid.get_children();

        let x = box.x1 + this._spacing;
        if (position == PositionMode.LEFT)
            x = box.x1 + 2*this._spacing;
        let y = box.y1 + this._spacing;

        for (let i = 0; i < children.length; i++) {
            let childBox = new Clutter.ActorBox();
            childBox.x1 = x;
            childBox.y1 = y;
            childBox.x2 = childBox.x1 + this._item_size;
            childBox.y2 = childBox.y1 + this._item_size;
            children[i].allocate(childBox, flags);
            y += this._item_size + this._spacing;
        }
    },


    _onStyleChanged: function() {
        let themeNode = this.actor.get_theme_node();
        let [success, len] = themeNode.get_length('spacing', false);
        if (success)
            this._spacing = len;
        [success, len] = themeNode.get_length('-shell-grid-item-size', false);
        if (success)
            this._item_size = len;
        this._grid.queue_relayout();
    },

    removeAll: function () {
        this._grid.get_children().forEach(Lang.bind(this, function (child) {
            child.destroy();
        }));
    },

    addItem: function(actor) {
        this._grid.add_actor(actor);
    }
};
Signals.addSignalMethods(Dock.prototype);

function DockIcon(app) {
    this._init(app);
}

DockIcon.prototype = {
    _init : function(app) {
        this.app = app;
        this.actor = new St.Button({ style_class: 'dock-app',
                                     button_mask: St.ButtonMask.ONE | St.ButtonMask.TWO,
                                     reactive: true,
                                     x_fill: true,
                                     y_fill: true });
        this.actor._delegate = this;
        this.actor.set_size(dockicon_size, dockicon_size);

        this._icon = this.app.create_icon_texture(dockicon_size);
        this.actor.set_child(this._icon);

        this.actor.connect('clicked', Lang.bind(this, this._onClicked));

        this._menu = null;
        this._menuManager = new PopupMenu.PopupMenuManager(this);

        this._has_focus = false;

        let tracker = Shell.WindowTracker.get_default();
        tracker.connect('notify::focus-app', Lang.bind(this, this._onStateChanged));

        this.actor.connect('button-press-event', Lang.bind(this, this._onButtonPress));
        this.actor.connect('destroy', Lang.bind(this, this._onDestroy));
        this.actor.connect('notify::hover', Lang.bind(this, this._hoverChanged));

        this._menuTimeoutId = 0;
        this._stateChangedId = this.app.connect('notify::state',
                                                Lang.bind(this, this._onStateChanged));
        this._onStateChanged();
    },

    _onDestroy: function() {
        if (this._stateChangedId > 0)
            this.app.disconnect(this._stateChangedId);
        this._stateChangedId = 0;
        this._removeMenuTimeout();
    },

    _removeMenuTimeout: function() {
        if (this._menuTimeoutId > 0) {
            Mainloop.source_remove(this._menuTimeoutId);
            this._menuTimeoutId = 0;
        }
    },

    _hoverChanged: function(actor) {
        if (actor != this.actor)
            this._has_focus = false;
        else
            this._has_focus = true;
        return false;
    },

    _onStateChanged: function() {
        let tracker = Shell.WindowTracker.get_default();
        let focusedApp = tracker.focus_app;
        if (this.app.state != Shell.AppState.STOPPED) {
            this.actor.add_style_class_name('running');
            if (this.app == focusedApp) {
                this.actor.add_style_class_name('focused');
            } else {
                this.actor.remove_style_class_name('focused');
            }
        } else {
            this.actor.remove_style_class_name('focused');
            this.actor.remove_style_class_name('running');
        }
    },

    _onButtonPress: function(actor, event) {
        let button = event.get_button();
        if (button == 1) {
            this._removeMenuTimeout();
            this._menuTimeoutId = Mainloop.timeout_add(AppDisplay.MENU_POPUP_TIMEOUT, Lang.bind(this, function() {
                this.popupMenu();
            }));
        } else if (button == 3) {
            this.popupMenu();
        }
    },

    _onClicked: function(actor, button) {
        this._removeMenuTimeout();

        if (button == 1) {
            this._onActivate(Clutter.get_current_event());
        } else if (button == 2) {
            // Last workspace is always empty
            let launchWorkspace = global.screen.get_workspace_by_index(global.screen.n_workspaces - 1);
            launchWorkspace.activate(global.get_current_time());
            this.emit('launching');
            this.app.open_new_window(-1);
        }
        return false;
    },

    getId: function() {
        return this.app.get_id();
    },

    popupMenu: function() {
        this._removeMenuTimeout();
        this.actor.fake_release();

        if (!this._menu) {
            this._menu = new DockIconMenu(this);
            this._menu.connect('activate-window', Lang.bind(this, function (menu, window) {
                this.activateWindow(window);
            }));
            this._menu.connect('popup', Lang.bind(this, function (menu, isPoppedUp) {
                if (!isPoppedUp)
                    this._onMenuPoppedDown();
            }));

            this._menuManager.addMenu(this._menu, true);
        }

        this._menu.popup();

        return false;
    },

    activateWindow: function(metaWindow) {
        if (metaWindow) {
            this._didActivateWindow = true;
            Main.activateWindow(metaWindow);
        }
    },

    setSelected: function (isSelected) {
        this._selected = isSelected;
        if (this._selected)
            this.actor.add_style_class_name('selected');
        else
            this.actor.remove_style_class_name('selected');
    },

    _onMenuPoppedDown: function() {
        this.actor.sync_hover();
    },

    _getRunning: function() {
        return this.app.state != Shell.AppState.STOPPED;
    },

    _onActivate: function (event) {
        this.emit('launching');
        let modifiers = Shell.get_event_state(event);

        if (modifiers & Clutter.ModifierType.CONTROL_MASK
            && this.app.state == Shell.AppState.RUNNING) {
            let current_workspace = global.screen.get_active_workspace().index();
            this.app.open_new_window(current_workspace);
        } else {
            let tracker = Shell.WindowTracker.get_default();
            let focusedApp = tracker.focus_app;

            if (this.app == focusedApp) {
                let windows = this.app.get_windows();
                let current_workspace = global.screen.get_active_workspace();
                for (let i = 0; i < windows.length; i++) {
                    let w = windows[i];
                    if (w.get_workspace() == current_workspace)
                        w.minimize();
                }
            } else {
                this.app.activate(-1);
            }
        }
        Main.overview.hide();
    },

    shellWorkspaceLaunch : function() {
        this.app.open_new_window();
    }
};
Signals.addSignalMethods(DockIcon.prototype);

function DockIconMenu(source) {
    this._init(source);
}

DockIconMenu.prototype = {
    __proto__: AppDisplay.AppIconMenu.prototype,

    _init: function(source) {
        switch (position) {
            case PositionMode.LEFT:
                PopupMenu.PopupMenu.prototype._init.call(this, source.actor, St.Align.MIDDLE, St.Side.LEFT, 0);
                break;
            case PositionMode.RIGHT:
            default:
                PopupMenu.PopupMenu.prototype._init.call(this, source.actor, St.Align.MIDDLE, St.Side.RIGHT, 0);
        }

        this._source = source;

        this.connect('activate', Lang.bind(this, this._onActivate));
        this.connect('open-state-changed', Lang.bind(this, this._onOpenStateChanged));

        this.actor.add_style_class_name('dock-menu');

        // Chain our visibility and lifecycle to that of the source
        source.actor.connect('notify::mapped', Lang.bind(this, function () {
            if (!source.actor.mapped)
                this.close();
        }));
        source.actor.connect('destroy', Lang.bind(this, function () { this.actor.destroy(); }));

        Main.chrome.addActor(this.actor);
    },

    _redisplay: function() {
        this.removeAll();

        let windows = this._source.app.get_windows();

        // Display the app windows menu items and the separator between windows
        // of the current desktop and other windows.
        let activeWorkspace = global.screen.get_active_workspace();
        let separatorShown = windows.length > 0 && windows[0].get_workspace() != activeWorkspace;

        for (let i = 0; i < windows.length; i++) {
            if (!separatorShown && windows[i].get_workspace() != activeWorkspace) {
                this._appendSeparator();
                separatorShown = true;
            }
            let item = this._appendMenuItem(windows[i].title);
            item._window = windows[i];
        }

        if (windows.length > 0)
            this._appendSeparator();

        let isFavorite = AppFavorites.getAppFavorites().isFavorite(this._source.app.get_id());

        this._newWindowMenuItem = windows.length > 0 ? this._appendMenuItem(_("New Window")) : null;

        this._quitAppMenuItem = windows.length >0 ? this._appendMenuItem(_("Quit Application")) : null;

        if (windows.length > 0)
            this._appendSeparator();
        this._toggleFavoriteMenuItem = this._appendMenuItem(isFavorite ?
                                                            _("Remove from Favorites")
                                                            : _("Add to Favorites"));

        this._highlightedItem = null;
    },

    _onActivate: function (actor, child) {
        if (child._window) {
            let metaWindow = child._window;
            this.emit('activate-window', metaWindow);
        } else if (child == this._newWindowMenuItem) {
            let current_workspace = global.screen.get_active_workspace().index();
            this._source.app.open_new_window(current_workspace);
            this.emit('activate-window', null);
        } else if (child == this._quitAppMenuItem) {
            this._source.app.request_quit();
        } else if (child == this._toggleFavoriteMenuItem) {
            let favs = AppFavorites.getAppFavorites();
            let isFavorite = favs.isFavorite(this._source.app.get_id());
            if (isFavorite)
                favs.removeFavorite(this._source.app.get_id());
            else
                favs.addFavorite(this._source.app.get_id());
        }
        this.close();
    }
}

function main(extensionMeta) {
    imports.gettext.bindtextdomain('gnome-shell-extensions', extensionMeta.localedir);

    let dock = new Dock();
}
