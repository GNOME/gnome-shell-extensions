const Clutter = imports.gi.Clutter;
const Gtk = imports.gi.Gtk;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const Hash = imports.misc.hash;
const Lang = imports.lang;
const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;
const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const ICON_TEXTURE_SIZE = 24;

const GroupingMode = {
    NEVER: 0,
    ALWAYS: 1
};


function _minimizeOrActivateWindow(window) {
        let focusWindow = global.display.focus_window;
        if (focusWindow == window ||
            focusWindow && focusWindow.get_transient_for() == window)
            window.minimize();
        else
            window.activate(global.get_current_time());
}


const WindowTitle = new Lang.Class({
    Name: 'WindowTitle',

    _init: function(metaWindow) {
        this._metaWindow = metaWindow;
        this.actor = new St.BoxLayout();

        let app = Shell.WindowTracker.get_default().get_window_app(metaWindow);
        this._icon = new St.Bin({ style_class: 'window-button-icon',
                                  child: app.create_icon_texture(ICON_TEXTURE_SIZE) });
        this.actor.add(this._icon);
        this._label = new St.Label();
        this.actor.add(this._label);

        this.actor.connect('destroy', Lang.bind(this, this._onDestroy));

        this._notifyTitleId =
            this._metaWindow.connect('notify::title',
                                    Lang.bind(this, this._updateTitle));
        this._notifyMinimizedId =
            this._metaWindow.connect('notify::minimized',
                                    Lang.bind(this, this._minimizedChanged));
        this._minimizedChanged();
    },

    _minimizedChanged: function() {
        this._icon.opacity = this._metaWindow.minimized ? 128 : 255;
        this._updateTitle();
    },

    _updateTitle: function() {
        if (this._metaWindow.minimized)
            this._label.text = '[%s]'.format(this._metaWindow.title);
        else
            this._label.text = this._metaWindow.title;
    },

    _onDestroy: function() {
        this._metaWindow.disconnect(this._notifyTitleId);
        this._metaWindow.disconnect(this._notifyMinimizedId);
    }
});


const WindowButton = new Lang.Class({
    Name: 'WindowButton',

    _init: function(metaWindow) {
        this.metaWindow = metaWindow;

        this._windowTitle = new WindowTitle(this.metaWindow);
        this.actor = new St.Button({ style_class: 'window-button',
                                     x_fill: true,
                                     can_focus: true,
                                     child: this._windowTitle.actor });
        this.actor._delegate = this;

        this.actor.connect('allocation-changed',
                           Lang.bind(this, this._updateIconGeometry));
        this.actor.connect('clicked', Lang.bind(this, this._onClicked));
        this.actor.connect('destroy', Lang.bind(this, this._onDestroy));

        this._switchWorkspaceId =
            global.window_manager.connect('switch-workspace',
                                          Lang.bind(this, this._updateVisibility));
        this._updateVisibility();

        this._notifyFocusId =
            global.display.connect('notify::focus-window',
                                   Lang.bind(this, this._updateStyle));
        this._updateStyle();
    },

    _onClicked: function() {
        _minimizeOrActivateWindow(this.metaWindow);
    },

    _updateStyle: function() {
        if (this.metaWindow.minimized)
            this.actor.add_style_class_name('minimized');
        else
            this.actor.remove_style_class_name('minimized');

        if (global.display.focus_window == this.metaWindow)
            this.actor.add_style_class_name('focused');
        else
            this.actor.remove_style_class_name('focused');
    },

    _updateVisibility: function() {
        let workspace = global.screen.get_active_workspace();
        this.actor.visible = this.metaWindow.located_on_workspace(workspace);
    },

    _updateIconGeometry: function() {
        let rect = new Meta.Rectangle();

        [rect.x, rect.y] = this.actor.get_transformed_position();
        [rect.width, rect.height] = this.actor.get_transformed_size();

        this.metaWindow.set_icon_geometry(rect);
    },

    _onDestroy: function() {
        global.window_manager.disconnect(this._switchWorkspaceId);
        global.display.disconnect(this._notifyFocusId);
    }
});


const AppButton = new Lang.Class({
    Name: 'AppButton',

    _init: function(app) {
        this.app = app;

        let stack = new St.Widget({ layout_manager: new Clutter.BinLayout() });
        this.actor = new St.Button({ style_class: 'window-button',
                                     x_fill: true,
                                     can_focus: true,
                                     child: stack });
        this.actor._delegate = this;

        this.actor.connect('allocation-changed',
                           Lang.bind(this, this._updateIconGeometry));

        this._singleWindowTitle = new St.Bin({ x_expand: true,
                                               x_align: St.Align.START });
        stack.add_actor(this._singleWindowTitle);

        this._multiWindowTitle = new St.BoxLayout({ x_expand: true });
        stack.add_actor(this._multiWindowTitle);

        let icon = new St.Bin({ style_class: 'window-button-icon',
                                child: app.create_icon_texture(ICON_TEXTURE_SIZE) });
        this._multiWindowTitle.add(icon);
        this._multiWindowTitle.add(new St.Label({ text: app.get_name() }));

        this._menuManager = new PopupMenu.PopupMenuManager(this);
        this._menu = new PopupMenu.PopupMenu(this.actor, 0.5, St.Side.BOTTOM);
        this._menu.actor.hide();
        this._menu.connect('activate', Lang.bind(this, this._onMenuActivate));
        this._menuManager.addMenu(this._menu);
        Main.uiGroup.add_actor(this._menu.actor);

        this.actor.connect('clicked', Lang.bind(this, this._onClicked));
        this.actor.connect('destroy', Lang.bind(this, this._onDestroy));

        this._switchWorkspaceId =
            global.window_manager.connect('switch-workspace',
                                          Lang.bind(this, this._updateVisibility));
        this._updateVisibility();

        this._windowsChangedId =
            this.app.connect('windows-changed',
                             Lang.bind(this, this._windowsChanged));
        this._windowsChanged();

        this._windowTracker = Shell.WindowTracker.get_default();
        this._notifyFocusId =
            this._windowTracker.connect('notify::focus-app',
                                        Lang.bind(this, this._updateStyle));
        this._updateStyle();
    },

    _updateVisibility: function() {
        let workspace = global.screen.get_active_workspace();
        this.actor.visible = this.app.is_on_workspace(workspace);
    },

    _updateStyle: function() {
        if (this._windowTracker.focus_app == this.app)
            this.actor.add_style_class_name('focused');
        else
            this.actor.remove_style_class_name('focused');
    },

    _updateIconGeometry: function() {
        let rect = new Meta.Rectangle();

        [rect.x, rect.y] = this.actor.get_transformed_position();
        [rect.width, rect.height] = this.actor.get_transformed_size();

        let windows = this.app.get_windows();
        windows.forEach(function(w) {
            w.set_icon_geometry(rect);
        });
    },


    _getWindowList: function() {
        let workspace = global.screen.get_active_workspace();
        return this.app.get_windows().filter(function(win) {
            return win.located_on_workspace(workspace);
        });
    },

    _windowsChanged: function() {
        let windows = this._getWindowList();
        this._singleWindowTitle.visible = windows.length == 1;
        this._multiWindowTitle.visible = !this._singleWindowTitle.visible;

        if (this._singleWindowTitle.visible) {
            if (!this._windowTitle) {
                this._windowTitle = new WindowTitle(windows[0]);
                this._singleWindowTitle.child = this._windowTitle.actor;
            }
        } else {
            if (this._windowTitle) {
                this._singleWindowTitle.child = null;
                this._windowTitle = null;
            }
        }
    },

    _onClicked: function() {
        if (this._menu.isOpen) {
            this._menu.close();
            return;
        }

        let windows = this._getWindowList();
        if (windows.length == 1) {
            _minimizeOrActivateWindow(windows[0]);
        } else {
            this._menu.removeAll();

            for (let i = 0; i < windows.length; i++) {
                let windowTitle = new WindowTitle(windows[i]);
                let item = new PopupMenu.PopupBaseMenuItem();
                item.addActor(windowTitle.actor);
                item._window = windows[i];
                this._menu.addMenuItem(item);
            }
            this._menu.open();

            let event = Clutter.get_current_event();
            if (event && event.type() == Clutter.EventType.KEY_RELEASE)
                this._menu.actor.navigate_focus(null, Gtk.DirectionType.TAB_FORWARD, false);
        }
    },

    _onMenuActivate: function(menu, child) {
        child._window.activate(global.get_current_time());
    },

    _onDestroy: function() {
        global.window_manager.disconnect(this._switchWorkspaceId);
        this._windowTracker.disconnect(this._notifyFocusId);
        this.app.disconnect(this._windowsChangedId);
        this._menu.actor.destroy();
    }
});


const TrayButton = new Lang.Class({
    Name: 'TrayButton',

    _init: function() {
        this._counterLabel = new St.Label({ x_align: Clutter.ActorAlign.CENTER,
                                            x_expand: true,
                                            y_align: Clutter.ActorAlign.CENTER,
                                            y_expand: true });
        this.actor = new St.Button({ style_class: 'summary-source-counter',
                                     child: this._counterLabel,
                                     layoutManager: new Clutter.BinLayout() });
        this.actor.set_x_align(Clutter.ActorAlign.END);
        this.actor.set_x_expand(true);
        this.actor.set_y_expand(true);

        this.actor.connect('clicked', Lang.bind(this,
            function() {
                if (Main.messageTray._trayState == MessageTray.State.HIDDEN)
                    Main.messageTray.toggle();
            }));
        this.actor.connect('destroy', Lang.bind(this, this._onDestroy));

        this._trayItemCount = 0;
        Main.messageTray.getSources().forEach(Lang.bind(this,
            function(source) {
                this._sourceAdded(Main.messageTray, source);
            }));
        this._sourceAddedId =
            Main.messageTray.connect('source-added',
                                     Lang.bind(this, this._sourceAdded));
        this._sourceRemovedId =
            Main.messageTray.connect('source-removed',
                                     Lang.bind(this, this._sourceRemoved));
        this._updateVisibility();
    },

    _sourceAdded: function(tray, source) {
        this._trayItemCount++;
        this._updateVisibility();
    },

    _sourceRemoved: function(source) {
        this._trayItemCount--;
        this.actor.checked = false;
        this._updateVisibility();
    },

    _updateVisibility: function() {
        this._counterLabel.text = this._trayItemCount.toString();
        this.actor.visible = this._trayItemCount > 0;
    },

    _onDestroy: function() {
        Main.messageTray.getSources().forEach(Lang.bind(this,
            function(source) {
                if (!source._windowListDestroyId)
                    return;
                source.disconnect(source._windowListDestroyId)
                delete source._windowListDestroyId;
            }));
        Main.messageTray.disconnect(this._sourceAddedId);
        Main.messageTray.disconnect(this._sourceRemovedId);
    }
});


const WindowList = new Lang.Class({
    Name: 'WindowList',

    _init: function() {
        this.actor = new St.Widget({ name: 'panel',
                                     style_class: 'bottom-panel',
                                     reactive: true,
                                     track_hover: true,
                                     layout_manager: new Clutter.BinLayout()});
        this.actor.connect('destroy', Lang.bind(this, this._onDestroy));

        let box = new St.BoxLayout({ x_expand: true, y_expand: true });
        this.actor.add_actor(box);

        let layout = new Clutter.BoxLayout({ homogeneous: true });
        this._windowList = new St.Widget({ style_class: 'window-list',
                                           layout_manager: layout,
                                           x_align: Clutter.ActorAlign.START,
                                           x_expand: true,
                                           y_expand: true });
        box.add(this._windowList, { expand: true });

        this._windowList.connect('style-changed', Lang.bind(this,
            function() {
                let node = this._windowList.get_theme_node();
                let spacing = node.get_length('spacing');
                this._windowList.layout_manager.spacing = spacing;
            }));

        this._trayButton = new TrayButton();
        box.add(this._trayButton.actor);

        Main.layoutManager.addChrome(this.actor, { affectsStruts: true,
                                                   trackFullscreen: true });
        Main.ctrlAltTabManager.addGroup(this.actor, _('Window List'), 'start-here-symbolic');

        this._appSystem = Shell.AppSystem.get_default();
        this._appStateChangedId =
            this._appSystem.connect('app-state-changed',
                                    Lang.bind(this, this._onAppStateChanged));

        this._monitorsChangedId =
            Main.layoutManager.connect('monitors-changed',
                                       Lang.bind(this, this._updatePosition));
        this._updatePosition();

        this._keyboardVisiblechangedId =
            Main.layoutManager.connect('keyboard-visible-changed',
                Lang.bind(this, function(o, state) {
                    Main.layoutManager.keyboardBox.visible = state;
                    Main.uiGroup.set_child_above_sibling(windowList.actor,
                                                         Main.layoutManager.keyboardBox);
                    this._updateKeyboardAnchor();
                }));

        this._workspaceSignals = new Hash.Map();
        this._nWorkspacesChangedId =
            global.screen.connect('notify::n-workspaces',
                                  Lang.bind(this, this._onWorkspacesChanged));
        this._onWorkspacesChanged();

        this._overviewShowingId =
            Main.overview.connect('showing', Lang.bind(this, function() {
                this.actor.hide();
                this._updateKeyboardAnchor();
            }));

        this._overviewHidingId =
            Main.overview.connect('hiding', Lang.bind(this, function() {
                this.actor.show();
                this._updateKeyboardAnchor();
            }));

        this._settings = Convenience.getSettings();
        this._groupingModeChangedId =
            this._settings.connect('changed::grouping-mode',
                                   Lang.bind(this, this._groupingModeChanged));
        this._groupingModeChanged();
    },

    _groupingModeChanged: function() {
        this._groupingMode = this._settings.get_enum('grouping-mode');
        this._populateWindowList();
    },

    _populateWindowList: function() {
        this._windowList.destroy_all_children();

        if (this._groupingMode == GroupingMode.NEVER) {
            let windows = Meta.get_window_actors(global.screen);
            for (let i = 0; i < windows.length; i++)
                this._onWindowAdded(null, windows[i].metaWindow);
        } else {
            let apps = this._appSystem.get_running();
            for (let i = 0; i < apps.length; i++)
                this._addApp(apps[i]);
        }
    },

    _updatePosition: function() {
        let monitor = Main.layoutManager.primaryMonitor;
        this.actor.width = monitor.width;
        this.actor.set_position(monitor.x, monitor.y + monitor.height - this.actor.height);
    },

    _updateKeyboardAnchor: function() {
        if (!Main.keyboard.actor)
            return;

        let anchorY = Main.overview.visible ? 0 : this.actor.height;
        Main.keyboard.actor.anchor_y = anchorY;
    },

    _onAppStateChanged: function(appSys, app) {
        if (this._groupingMode != GroupingMode.ALWAYS)
            return;

        if (app.state == Shell.AppState.RUNNING)
            this._addApp(app);
        else if (app.state == Shell.AppState.STOPPED)
            this._removeApp(app);
    },

    _addApp: function(app) {
        let button = new AppButton(app);
        this._windowList.layout_manager.pack(button.actor,
                                             true, true, true,
                                             Clutter.BoxAlignment.START,
                                             Clutter.BoxAlignment.START);
    },

    _removeApp: function(app) {
        let children = this._windowList.get_children();
        for (let i = 0; i < children.length; i++) {
            if (children[i]._delegate.app == app) {
                children[i].destroy();
                return;
            }
        }
    },

    _onWindowAdded: function(ws, win) {
        if (!Shell.WindowTracker.get_default().is_window_interesting(win))
            return;

        if (this._groupingMode != GroupingMode.NEVER)
            return;

        let button = new WindowButton(win);
        this._windowList.layout_manager.pack(button.actor,
                                             true, true, true,
                                             Clutter.BoxAlignment.START,
                                             Clutter.BoxAlignment.START);
    },

    _onWindowRemoved: function(ws, win) {
        if (this._groupingMode != GroupingMode.NEVER)
            return;

        let children = this._windowList.get_children();
        for (let i = 0; i < children.length; i++) {
            if (children[i]._delegate.metaWindow == win) {
                children[i].destroy();
                return;
            }
        }
    },

    _onWorkspacesChanged: function() {
        let numWorkspaces = global.screen.n_workspaces;
        for (let i = 0; i < numWorkspaces; i++) {
            let workspace = global.screen.get_workspace_by_index(i);
            if (this._workspaceSignals.has(workspace))
                continue;

            let signals = { windowAddedId: 0, windowRemovedId: 0 };
            signals._windowAddedId =
                workspace.connect_after('window-added',
                                        Lang.bind(this, this._onWindowAdded));
            signals._windowRemovedId =
                workspace.connect('window-removed',
                                  Lang.bind(this, this._onWindowRemoved));
            this._workspaceSignals.set(workspace, signals);
        }
    },

    _disconnectWorkspaceSignals: function() {
        let numWorkspaces = global.screen.n_workspaces;
        for (let i = 0; i < numWorkspaces; i++) {
            let workspace = global.screen.get_workspace_by_index(i);
            let signals = this._workspaceSignals.delete(workspace)[1];
            workspace.disconnect(signals._windowAddedId);
            workspace.disconnect(signals._windowRemovedId);
        }
    },

    _onDestroy: function() {

        Main.ctrlAltTabManager.removeGroup(this.actor);

        this._appSystem.disconnect(this._appStateChangedId);
        this._appStateChangedId = 0;

        Main.layoutManager.disconnect(this._monitorsChangedId);
        this._monitorsChangedId = 0;

        Main.layoutManager.disconnect(this._keyboardVisiblechangedId);
        this._keyboardVisiblechangedId = 0;

        Main.layoutManager.hideKeyboard();

        this._disconnectWorkspaceSignals();
        global.screen.disconnect(this._nWorkspacesChangedId);
        this._nWorkspacesChangedId = 0;

        Main.overview.disconnect(this._overviewShowingId);
        Main.overview.disconnect(this._overviewHidingId);

        this._settings.disconnect(this._groupingModeChangedId);

        let windows = Meta.get_window_actors(global.screen);
        for (let i = 0; i < windows.length; i++)
            windows[i].metaWindow.set_icon_geometry(null);
    }
});

let windowList;
let injections = {};
let notificationParent;

function init() {
}

function enable() {
    windowList = new WindowList();

    windowList.actor.connect('notify::hover', Lang.bind(Main.messageTray,
        function() {
            this._pointerInTray = windowList.actor.hover;
            this._updateState();
        }));

    injections['_trayDwellTimeout'] = MessageTray.MessageTray.prototype._trayDwellTimeout;
    MessageTray.MessageTray.prototype._trayDwellTimeout = function() {
        return false;
    };

    injections['_tween'] = MessageTray.MessageTray.prototype._tween;
    MessageTray.MessageTray.prototype._tween = function(actor, statevar, value, params) {
        if (!Main.overview.visible) {
            let anchorY;
            if (statevar == '_trayState')
                anchorY = windowList.actor.height;
            else if (statevar == '_notificationState')
                anchorY = -windowList.actor.height;
            else
                anchorY = 0;
            actor.anchor_y = anchorY;
        }
        injections['_tween'].call(Main.messageTray, actor, statevar, value, params);
    };
    injections['_onTrayHidden'] = MessageTray.MessageTray.prototype._onTrayHidden;
    MessageTray.MessageTray.prototype._onTrayHidden = function() {
        this.actor.anchor_y = 0;
        injections['_onTrayHidden'].call(Main.messageTray);
    };

    notificationParent = Main.messageTray._notificationWidget.get_parent();
    Main.messageTray._notificationWidget.hide();
    Main.messageTray._notificationWidget.reparent(windowList.actor);
    Main.messageTray._notificationWidget.show();
}

function disable() {
    if (!windowList)
        return;

    windowList.actor.hide();

    if (notificationParent) {
        Main.messageTray._notificationWidget.reparent(notificationParent);
        notificationParent = null;
    }

    windowList.actor.destroy();
    windowList = null;

    for (prop in injections)
        MessageTray.MessageTray.prototype[prop] = injections[prop];

    Main.messageTray._notificationWidget.set_anchor_point(0, 0);
    Main.messageTray.actor.set_anchor_point(0, 0);
}
