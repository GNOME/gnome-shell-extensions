const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const DND = imports.ui.dnd;
const Lang = imports.lang;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const ICON_TEXTURE_SIZE = 24;
const DND_ACTIVATE_TIMEOUT = 500;

const GroupingMode = {
    NEVER: 0,
    AUTO: 1,
    ALWAYS: 2
};


function _minimizeOrActivateWindow(window) {
        let focusWindow = global.display.focus_window;
        if (focusWindow == window ||
            focusWindow && focusWindow.get_transient_for() == window)
            window.minimize();
        else
            window.activate(global.get_current_time());
}

function _openMenu(menu) {
    menu.open();

    let event = Clutter.get_current_event();
    if (event && event.type() == Clutter.EventType.KEY_RELEASE)
        menu.actor.navigate_focus(null, Gtk.DirectionType.TAB_FORWARD, false);
}

function _onMenuStateChanged(menu, isOpen) {
    if (isOpen)
        return;

    let [x, y,] = global.get_pointer();
    let actor = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
    if (Me.stateObj.someWindowListContains(actor))
        actor.sync_hover();
}

function _getAppStableSequence(app) {
    let windows = app.get_windows().filter(function(w) { return !w.skip_taskbar; });
    return windows.reduce(function(prev, cur) {
        return Math.min(prev, cur.get_stable_sequence());
    }, Infinity);
}


const WindowContextMenu = new Lang.Class({
    Name: 'WindowContextMenu',
    Extends: PopupMenu.PopupMenu,

    _init: function(source, metaWindow) {
        this.parent(source, 0.5, St.Side.BOTTOM);

        this._metaWindow = metaWindow;

        this._minimizeItem = new PopupMenu.PopupMenuItem('');
        this._minimizeItem.connect('activate', Lang.bind(this, function() {
            if (this._metaWindow.minimized)
                this._metaWindow.unminimize();
            else
                this._metaWindow.minimize();
        }));
        this.addMenuItem(this._minimizeItem);

        this._notifyMinimizedId =
            this._metaWindow.connect('notify::minimized',
                                     Lang.bind(this, this._updateMinimizeItem));
        this._updateMinimizeItem();

        this._maximizeItem = new PopupMenu.PopupMenuItem('');
        this._maximizeItem.connect('activate', Lang.bind(this, function() {
            if (this._metaWindow.maximized_vertically &&
                this._metaWindow.maximized_horizontally)
                this._metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL |
                                            Meta.MaximizeFlags.VERTICAL);
            else
                this._metaWindow.maximize(Meta.MaximizeFlags.HORIZONTAL |
                                          Meta.MaximizeFlags.VERTICAL);
        }));
        this.addMenuItem(this._maximizeItem);

        this._notifyMaximizedHId =
            this._metaWindow.connect('notify::maximized-horizontally',
                                     Lang.bind(this, this._updateMaximizeItem));
        this._notifyMaximizedVId =
            this._metaWindow.connect('notify::maximized-vertically',
                                     Lang.bind(this, this._updateMaximizeItem));
        this._updateMaximizeItem();

        let item = new PopupMenu.PopupMenuItem(_("Close"));
        item.connect('activate', Lang.bind(this, function() {
            this._metaWindow.delete(global.get_current_time());
        }));
        this.addMenuItem(item);

        this.actor.connect('destroy', Lang.bind(this, this._onDestroy));
    },

    _updateMinimizeItem: function() {
        this._minimizeItem.label.text = this._metaWindow.minimized ? _("Unminimize")
                                                                   : _("Minimize");
    },

    _updateMaximizeItem: function() {
        let maximized = this._metaWindow.maximized_vertically &&
                        this._metaWindow.maximized_horizontally;
        this._maximizeItem.label.text = maximized ? _("Unmaximize")
                                                  : _("Maximize");
    },

    _onDestroy: function() {
        this._metaWindow.disconnect(this._notifyMinimizedId);
        this._metaWindow.disconnect(this._notifyMaximizedHId);
        this._metaWindow.disconnect(this._notifyMaximizedVId);
    }
});

const WindowTitle = new Lang.Class({
    Name: 'WindowTitle',

    _init: function(metaWindow) {
        this._metaWindow = metaWindow;
        this.actor = new St.BoxLayout({ style_class: 'window-button-box',
                                        x_expand: true, y_expand: true });

        this._icon = new St.Bin({ style_class: 'window-button-icon' });
        this.actor.add(this._icon);
        this.label_actor = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
        this.actor.add(this.label_actor);

        this._textureCache = St.TextureCache.get_default();
        this._iconThemeChangedId =
            this._textureCache.connect('icon-theme-changed',
                                       Lang.bind(this, this._updateIcon));
        this._notifyWmClass =
            this._metaWindow.connect('notify::wm-class',
                                     Lang.bind(this, this._updateIcon));
        this._notifyAppId =
            this._metaWindow.connect('notify::gtk-application-id',
                                     Lang.bind(this, this._updateIcon));
        this._updateIcon();

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
        if (!this._metaWindow.title)
            return;

        if (this._metaWindow.minimized)
            this.label_actor.text = '[%s]'.format(this._metaWindow.title);
        else
            this.label_actor.text = this._metaWindow.title;
    },

    _updateIcon: function() {
        let app = Shell.WindowTracker.get_default().get_window_app(this._metaWindow);
        if (app)
            this._icon.child = app.create_icon_texture(ICON_TEXTURE_SIZE);
        else
            this._icon.child = new St.Icon({ icon_name: 'icon-missing',
                                             icon_size: ICON_TEXTURE_SIZE });
    },

    _onDestroy: function() {
        this._textureCache.disconnect(this._iconThemeChangedId);
        this._metaWindow.disconnect(this._notifyTitleId);
        this._metaWindow.disconnect(this._notifyMinimizedId);
        this._metaWindow.disconnect(this._notifyWmClass);
        this._metaWindow.disconnect(this._notifyAppId);
    }
});


const BaseButton = new Lang.Class({
    Name: 'BaseButton',
    Abstract: true,

    _init: function(perMonitor, monitorIndex) {
        this._perMonitor = perMonitor;
        this._monitorIndex = monitorIndex;

        this.actor = new St.Button({ style_class: 'window-button',
                                     x_fill: true,
                                     y_fill: true,
                                     can_focus: true,
                                     button_mask: St.ButtonMask.ONE |
                                                  St.ButtonMask.THREE });
        this.actor._delegate = this;

        this.actor.connect('allocation-changed',
                           Lang.bind(this, this._updateIconGeometry));
        this.actor.connect('clicked', Lang.bind(this, this._onClicked));
        this.actor.connect('destroy', Lang.bind(this, this._onDestroy));
        this.actor.connect('popup-menu', Lang.bind(this, this._onPopupMenu));

        this._contextMenuManager = new PopupMenu.PopupMenuManager(this);

        this._switchWorkspaceId =
            global.window_manager.connect('switch-workspace',
                                          Lang.bind(this, this._updateVisibility));

        if (this._perMonitor) {
            this._windowEnteredMonitorId =
                global.screen.connect('window-entered-monitor',
                    Lang.bind(this, this._windowEnteredOrLeftMonitor));
            this._windowLeftMonitorId =
                global.screen.connect('window-left-monitor',
                    Lang.bind(this, this._windowEnteredOrLeftMonitor));
        }
    },

    get active() {
        return this.actor.has_style_class_name('focused');
    },

    activate: function() {
        if (this.active)
            return;

        this._onClicked(this.actor, 1);
    },

    _onClicked: function(actor, button) {
        throw new Error('Not implemented');
    },

    _canOpenPopupMenu: function() {
        return true;
    },

    _onPopupMenu: function(actor) {
        if (!this._canOpenPopupMenu() || this._contextMenu.isOpen)
            return;
        _openMenu(this._contextMenu);
    },

    _isFocused: function() {
        throw new Error('Not implemented');
    },

    _updateStyle: function() {
        if (this._isFocused())
            this.actor.add_style_class_name('focused');
        else
            this.actor.remove_style_class_name('focused');
    },

    _windowEnteredOrLeftMonitor: function(metaScreen, monitorIndex, metaWindow) {
        throw new Error('Not implemented');
    },

    _isWindowVisible: function(window) {
        let workspace = global.screen.get_active_workspace();

        return !window.skip_taskbar &&
               window.located_on_workspace(workspace) &&
               (!this._perMonitor || window.get_monitor() == this._monitorIndex);
    },

    _updateVisibility: function() {
        throw new Error('Not implemented');
    },

    _getIconGeometry: function() {
        let rect = new Meta.Rectangle();

        [rect.x, rect.y] = this.actor.get_transformed_position();
        [rect.width, rect.height] = this.actor.get_transformed_size();

        return rect;
    },

    _updateIconGeometry: function() {
        throw new Error('Not implemented');
    },

    _onDestroy: function() {
        global.window_manager.disconnect(this._switchWorkspaceId);

        if (this._windowEnteredMonitorId)
            global.screen.disconnect(this._windowEnteredMonitorId);
        this._windowEnteredMonitorId = 0;

        if (this._windowLeftMonitorId)
            global.screen.disconnect(this._windowLeftMonitorId);
        this._windowLeftMonitorId = 0;
    }
});


const WindowButton = new Lang.Class({
    Name: 'WindowButton',
    Extends: BaseButton,

    _init: function(metaWindow, perMonitor, monitorIndex) {
        this.parent(perMonitor, monitorIndex);

        this.metaWindow = metaWindow;
        this._updateVisibility();

        this._windowTitle = new WindowTitle(this.metaWindow);
        this.actor.set_child(this._windowTitle.actor);
        this.actor.label_actor = this._windowTitle.label_actor;

        this._contextMenu = new WindowContextMenu(this.actor, this.metaWindow);
        this._contextMenu.connect('open-state-changed', _onMenuStateChanged);
        this._contextMenu.actor.hide();
        this._contextMenuManager.addMenu(this._contextMenu);
        Main.uiGroup.add_actor(this._contextMenu.actor);

        this._workspaceChangedId =
            this.metaWindow.connect('workspace-changed',
                                    Lang.bind(this, this._updateVisibility));

        this._notifyFocusId =
            global.display.connect('notify::focus-window',
                                   Lang.bind(this, this._updateStyle));
        this._updateStyle();
    },

    _onClicked: function(actor, button) {
        if (this._contextMenu.isOpen) {
            this._contextMenu.close();
            return;
        }

        if (button == 1)
            _minimizeOrActivateWindow(this.metaWindow);
        else
            _openMenu(this._contextMenu);
    },

    _isFocused: function() {
        return global.display.focus_window == this.metaWindow;
    },

    _updateStyle: function() {
        this.parent();

        if (this.metaWindow.minimized)
            this.actor.add_style_class_name('minimized');
        else
            this.actor.remove_style_class_name('minimized');
    },

    _windowEnteredOrLeftMonitor: function(metaScreen, monitorIndex, metaWindow) {
        if (monitorIndex == this._monitorIndex && metaWindow == this.metaWindow)
            this._updateVisibility();
    },

    _updateVisibility: function() {
        this.actor.visible = this._isWindowVisible(this.metaWindow);
    },

    _updateIconGeometry: function() {
        this.metaWindow.set_icon_geometry(this._getIconGeometry());
    },

    _onDestroy: function() {
        this.parent();
        this.metaWindow.disconnect(this._workspaceChangedId);
        global.display.disconnect(this._notifyFocusId);
        this._contextMenu.destroy();
    }
});


const AppContextMenu = new Lang.Class({
    Name: 'AppContextMenu',
    Extends: PopupMenu.PopupMenu,

    _init: function(source, appButton) {
        this.parent(source, 0.5, St.Side.BOTTOM);

        this._appButton = appButton;

        this._minimizeItem = new PopupMenu.PopupMenuItem(_("Minimize all"));
        this._minimizeItem.connect('activate', Lang.bind(this, function() {
            this._appButton.getWindowList().forEach(function(w) {
                w.minimize();
            });
        }));
        this.addMenuItem(this._minimizeItem);

        this._unminimizeItem = new PopupMenu.PopupMenuItem(_("Unminimize all"));
        this._unminimizeItem.connect('activate', Lang.bind(this, function() {
            this._appButton.getWindowList().forEach(function(w) {
                w.unminimize();
            });
        }));
        this.addMenuItem(this._unminimizeItem);

        this._maximizeItem = new PopupMenu.PopupMenuItem(_("Maximize all"));
        this._maximizeItem.connect('activate', Lang.bind(this, function() {
            this._appButton.getWindowList().forEach(function(w) {
                w.maximize(Meta.MaximizeFlags.HORIZONTAL |
                           Meta.MaximizeFlags.VERTICAL);
            });
        }));
        this.addMenuItem(this._maximizeItem);

        this._unmaximizeItem = new PopupMenu.PopupMenuItem(_("Unmaximize all"));
        this._unmaximizeItem.connect('activate', Lang.bind(this, function() {
            this._appButton.getWindowList().forEach(function(w) {
                w.unmaximize(Meta.MaximizeFlags.HORIZONTAL |
                             Meta.MaximizeFlags.VERTICAL);
            });
        }));
        this.addMenuItem(this._unmaximizeItem);

        let item = new PopupMenu.PopupMenuItem(_("Close all"));
        item.connect('activate', Lang.bind(this, function() {
            this._appButton.getWindowList().forEach(function(w) {
                w.delete(global.get_current_time());
            });
        }));
        this.addMenuItem(item);
    },

    open: function(animate) {
        let windows = this._appButton.getWindowList();
        this._minimizeItem.actor.visible = windows.some(function(w) {
            return !w.minimized;
        });
        this._unminimizeItem.actor.visible = windows.some(function(w) {
            return w.minimized;
        });
        this._maximizeItem.actor.visible = windows.some(function(w) {
            return !(w.maximized_horizontally && w.maximized_vertically);
        });
        this._unmaximizeItem.actor.visible = windows.some(function(w) {
            return w.maximized_horizontally && w.maximized_vertically;
        });

        this.parent(animate);
    }
});

const AppButton = new Lang.Class({
    Name: 'AppButton',
    Extends: BaseButton,

    _init: function(app, perMonitor, monitorIndex) {
        this.parent(perMonitor, monitorIndex);

        this.app = app;
        this._updateVisibility();

        let stack = new St.Widget({ layout_manager: new Clutter.BinLayout() });
        this.actor.set_child(stack);

        this._singleWindowTitle = new St.Bin({ x_expand: true,
                                               y_fill: true,
                                               x_align: St.Align.START });
        stack.add_actor(this._singleWindowTitle);

        this._multiWindowTitle = new St.BoxLayout({ style_class: 'window-button-box',
                                                    x_expand: true });
        stack.add_actor(this._multiWindowTitle);

        this._icon = new St.Bin({ style_class: 'window-button-icon',
                                  child: app.create_icon_texture(ICON_TEXTURE_SIZE) });
        this._multiWindowTitle.add(this._icon);

        let label = new St.Label({ text: app.get_name(),
                                   y_align: Clutter.ActorAlign.CENTER });
        this._multiWindowTitle.add(label);
        this._multiWindowTitle.label_actor = label;

        this._menuManager = new PopupMenu.PopupMenuManager(this);
        this._menu = new PopupMenu.PopupMenu(this.actor, 0.5, St.Side.BOTTOM);
        this._menu.connect('open-state-changed', _onMenuStateChanged);
        this._menu.actor.hide();
        this._menu.connect('activate', Lang.bind(this, this._onMenuActivate));
        this._menuManager.addMenu(this._menu);
        Main.uiGroup.add_actor(this._menu.actor);

        this._appContextMenu = new AppContextMenu(this.actor, this);
        this._appContextMenu.connect('open-state-changed', _onMenuStateChanged);
        this._appContextMenu.actor.hide();
        Main.uiGroup.add_actor(this._appContextMenu.actor);

        this._textureCache = St.TextureCache.get_default();
        this._iconThemeChangedId =
            this._textureCache.connect('icon-theme-changed', Lang.bind(this,
                function() {
                    this._icon.child = app.create_icon_texture(ICON_TEXTURE_SIZE);
                }));

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

    _windowEnteredOrLeftMonitor: function(metaScreen, monitorIndex, metaWindow) {
        if (this._windowTracker.get_window_app(metaWindow) == this.app &&
            monitorIndex == this._monitorIndex) {
            this._updateVisibility();
            this._windowsChanged();
        }
    },

    _updateVisibility: function() {
        if (!this._perMonitor) {
            // fast path: use ShellApp API to avoid iterating over all windows.
            let workspace = global.screen.get_active_workspace();
            this.actor.visible = this.app.is_on_workspace(workspace);
        } else {
            this.actor.visible = this.getWindowList().length >= 1;
        }
    },

    _isFocused: function() {
        return this._windowTracker.focus_app == this.app;
    },

    _updateIconGeometry: function() {
        let rect = this._getIconGeometry();

        let windows = this.app.get_windows();
        windows.forEach(function(w) {
            w.set_icon_geometry(rect);
        });
    },


    getWindowList: function() {
        return this.app.get_windows().filter(Lang.bind(this, function(win) {
            return this._isWindowVisible(win);
        }));
    },

    _windowsChanged: function() {
        let windows = this.getWindowList();
        this._singleWindowTitle.visible = windows.length == 1;
        this._multiWindowTitle.visible = !this._singleWindowTitle.visible;

        if (this._singleWindowTitle.visible) {
            if (!this._windowTitle) {
                this.metaWindow = windows[0];
                this._windowTitle = new WindowTitle(this.metaWindow);
                this._singleWindowTitle.child = this._windowTitle.actor;
                this._windowContextMenu = new WindowContextMenu(this.actor, this.metaWindow);
                this._windowContextMenu.connect('open-state-changed',
                                                _onMenuStateChanged);
                Main.uiGroup.add_actor(this._windowContextMenu.actor);
                this._windowContextMenu.actor.hide();
                this._contextMenuManager.addMenu(this._windowContextMenu);
            }
            this._contextMenuManager.removeMenu(this._appContextMenu);
            this._contextMenu = this._windowContextMenu;
            this.actor.label_actor = this._windowTitle.label_actor;
        } else {
            if (this._windowTitle) {
                this.metaWindow = null;
                this._singleWindowTitle.child = null;
                this._windowTitle = null;
                this._windowContextMenu.destroy();
                this._windowContextMenu = null;
            }
            this._contextMenu = this._appContextMenu;
            this._contextMenuManager.addMenu(this._appContextMenu);
            this.actor.label_actor = this._multiWindowTitle.label_actor;
        }

    },

    _onClicked: function(actor, button) {
        let menuWasOpen = this._menu.isOpen;
        if (menuWasOpen)
            this._menu.close();

        let contextMenuWasOpen = this._contextMenu.isOpen;
        if (contextMenuWasOpen)
            this._contextMenu.close();

        if (button == 1) {
            if (menuWasOpen)
                return;

            let windows = this.getWindowList();
            if (windows.length == 1) {
                if (contextMenuWasOpen)
                    return;
                _minimizeOrActivateWindow(windows[0]);
            } else {
                this._menu.removeAll();

                for (let i = 0; i < windows.length; i++) {
                    let windowTitle = new WindowTitle(windows[i]);
                    let item = new PopupMenu.PopupBaseMenuItem();
                    item.actor.add_actor(windowTitle.actor);
                    item._window = windows[i];
                    this._menu.addMenuItem(item);
                }
                _openMenu(this._menu);
            }
        } else {
            if (contextMenuWasOpen)
                return;
            _openMenu(this._contextMenu);
        }
    },

    _canOpenPopupMenu: function() {
        return !this._menu.isOpen;
    },

    _onMenuActivate: function(menu, child) {
        child._window.activate(global.get_current_time());
    },

    _onDestroy: function() {
        this.parent();
        this._textureCache.disconnect(this._iconThemeChangedId);
        this._windowTracker.disconnect(this._notifyFocusId);
        this.app.disconnect(this._windowsChangedId);
        this._menu.destroy();
    }
});


const WorkspaceIndicator = new Lang.Class({
    Name: 'WindowList.WorkspaceIndicator',
    Extends: PanelMenu.Button,

    _init: function(){
        this.parent(0.0, _("Workspace Indicator"), true);
        this.setMenu(new PopupMenu.PopupMenu(this.actor, 0.0, St.Side.BOTTOM));
        this.actor.add_style_class_name('window-list-workspace-indicator');
        this.menu.actor.remove_style_class_name('panel-menu');

        let container = new St.Widget({ layout_manager: new Clutter.BinLayout(),
                                        x_expand: true, y_expand: true });
        this.actor.add_actor(container);

        this._currentWorkspace = global.screen.get_active_workspace().index();
        this.statusLabel = new St.Label({ text: this._getStatusText(),
                                          x_align: Clutter.ActorAlign.CENTER,
                                          y_align: Clutter.ActorAlign.CENTER });
        container.add_actor(this.statusLabel);

        this.workspacesItems = [];

        this._screenSignals = [];
        this._screenSignals.push(global.screen.connect('notify::n-workspaces', Lang.bind(this,this._updateMenu)));
        this._screenSignals.push(global.screen.connect_after('workspace-switched', Lang.bind(this,this._updateIndicator)));

        this.actor.connect('scroll-event', Lang.bind(this, this._onScrollEvent));
        this._updateMenu();

        this._settings = new Gio.Settings({ schema_id: 'org.gnome.desktop.wm.preferences' });
        this._settingsChangedId = this._settings.connect('changed::workspace-names', Lang.bind(this, this._updateMenu));
    },

    destroy: function() {
        for (let i = 0; i < this._screenSignals.length; i++)
            global.screen.disconnect(this._screenSignals[i]);

        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }

        this.parent();
    },

    _updateIndicator: function() {
        this.workspacesItems[this._currentWorkspace].setOrnament(PopupMenu.Ornament.NONE);
        this._currentWorkspace = global.screen.get_active_workspace().index();
        this.workspacesItems[this._currentWorkspace].setOrnament(PopupMenu.Ornament.DOT);

        this.statusLabel.set_text(this._getStatusText());
    },

    _getStatusText: function() {
        let current = global.screen.get_active_workspace().index();
        let total = global.screen.n_workspaces;

        return '%d / %d'.format(current + 1, total);
    },

    _updateMenu: function() {
        this.menu.removeAll();
        this.workspacesItems = [];
        this._currentWorkspace = global.screen.get_active_workspace().index();

        for(let i = 0; i < global.screen.n_workspaces; i++) {
            let name = Meta.prefs_get_workspace_name(i);
            let item = new PopupMenu.PopupMenuItem(name);
            item.workspaceId = i;

            item.connect('activate', Lang.bind(this, function(item, event) {
                this._activate(item.workspaceId);
            }));

            if (i == this._currentWorkspace)
                item.setOrnament(PopupMenu.Ornament.DOT);

            this.menu.addMenuItem(item);
            this.workspacesItems[i] = item;
        }

        this.statusLabel.set_text(this._getStatusText());
    },

    _activate: function(index) {
        if(index >= 0 && index < global.screen.n_workspaces) {
            let metaWorkspace = global.screen.get_workspace_by_index(index);
            metaWorkspace.activate(global.get_current_time());
        }
    },

    _onScrollEvent: function(actor, event) {
        let direction = event.get_scroll_direction();
        let diff = 0;
        if (direction == Clutter.ScrollDirection.DOWN) {
            diff = 1;
        } else if (direction == Clutter.ScrollDirection.UP) {
            diff = -1;
        } else {
            return;
        }

        let newIndex = this._currentWorkspace + diff;
        this._activate(newIndex);
    },

    _allocate: function(actor, box, flags) {
        if (actor.get_n_children() > 0)
            actor.get_first_child().allocate(box, flags);
    }
});

const WindowList = new Lang.Class({
    Name: 'WindowList',

    _init: function(perMonitor, monitor) {
        this._perMonitor = perMonitor;
        this._monitor = monitor;

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
                                           reactive: true,
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
        this._windowList.connect('scroll-event', Lang.bind(this, this._onScrollEvent));

        let indicatorsBox = new St.BoxLayout({ x_align: Clutter.ActorAlign.END });
        box.add(indicatorsBox);

        this._workspaceIndicator = new WorkspaceIndicator();
        indicatorsBox.add(this._workspaceIndicator.container, { expand: false, y_fill: true });

        this._workspaceSettings = this._getWorkspaceSettings();
        this._workspacesOnlyOnPrimaryChangedId =
            this._workspaceSettings.connect('changed::workspaces-only-on-primary',
                                            Lang.bind(this, this._updateWorkspaceIndicatorVisibility));
        this._updateWorkspaceIndicatorVisibility();

        this._menuManager = new PopupMenu.PopupMenuManager(this);
        this._menuManager.addMenu(this._workspaceIndicator.menu);

        Main.layoutManager.addChrome(this.actor, { affectsStruts: true,
                                                   trackFullscreen: true });
        Main.uiGroup.set_child_above_sibling(this.actor, Main.layoutManager.panelBox);
        Main.ctrlAltTabManager.addGroup(this.actor, _("Window List"), 'start-here-symbolic');

        this.actor.width = this._monitor.width;
        this.actor.connect('notify::height', Lang.bind(this, this._updatePosition));
        this._updatePosition();

        this._appSystem = Shell.AppSystem.get_default();
        this._appStateChangedId =
            this._appSystem.connect('app-state-changed',
                                    Lang.bind(this, this._onAppStateChanged));

        this._keyboardVisiblechangedId =
            Main.layoutManager.connect('keyboard-visible-changed',
                Lang.bind(this, function(o, state) {
                    Main.layoutManager.keyboardBox.visible = state;
                    let keyboardBox = Main.layoutManager.keyboardBox;
                    keyboardBox.visible = state;
                    if (state)
                        Main.uiGroup.set_child_above_sibling(this.actor, keyboardBox);
                    else
                        Main.uiGroup.set_child_above_sibling(this.actor,
                                                             Main.layoutManager.panelBox);
                    this._updateKeyboardAnchor();
                }));

        this._workspaceSignals = new Map();
        this._nWorkspacesChangedId =
            global.screen.connect('notify::n-workspaces',
                                  Lang.bind(this, this._onWorkspacesChanged));
        this._onWorkspacesChanged();

        this._switchWorkspaceId =
            global.window_manager.connect('switch-workspace',
                                          Lang.bind(this, this._checkGrouping));

        this._overviewShowingId =
            Main.overview.connect('showing', Lang.bind(this, function() {
                this.actor.hide();
                this._updateKeyboardAnchor();
            }));

        this._overviewHidingId =
            Main.overview.connect('hiding', Lang.bind(this, function() {
                this.actor.visible = !Main.layoutManager.primaryMonitor.inFullscreen;
                this._updateKeyboardAnchor();
            }));

        this._fullscreenChangedId =
            global.screen.connect('in-fullscreen-changed', Lang.bind(this, function() {
                this._updateKeyboardAnchor();
            }));

        this._dragBeginId =
            Main.xdndHandler.connect('drag-begin',
                                     Lang.bind(this, this._onDragBegin));
        this._dragEndId =
            Main.xdndHandler.connect('drag-end',
                                     Lang.bind(this, this._onDragEnd));
        this._dragMonitor = {
            dragMotion: Lang.bind(this, this._onDragMotion)
        };

        this._dndTimeoutId = 0;
        this._dndWindow = null;

        this._settings = Convenience.getSettings();
        this._groupingModeChangedId =
            this._settings.connect('changed::grouping-mode',
                                   Lang.bind(this, this._groupingModeChanged));
        this._grouped = undefined;
        this._groupingModeChanged();
    },

    _getWorkspaceSettings: function() {
        let settings = global.get_overrides_settings();
        if (settings.list_keys().indexOf('workspaces-only-on-primary') > -1)
            return settings;
        return new Gio.Settings({ schema_id: 'org.gnome.mutter' });
    },

    _onScrollEvent: function(actor, event) {
        let direction = event.get_scroll_direction();
        let diff = 0;
        if (direction == Clutter.ScrollDirection.DOWN)
            diff = 1;
        else if (direction == Clutter.ScrollDirection.UP)
            diff = -1;
        else
            return;

        let children = this._windowList.get_children().map(function(actor) {
            return actor._delegate;
        });
        let active = 0;
        for (let i = 0; i < children.length; i++) {
            if (children[i].active) {
                active = i;
                break;
            }
        }

        active = Math.max(0, Math.min(active + diff, children.length-1));
        children[active].activate();
    },

    _updatePosition: function() {
        this.actor.set_position(this._monitor.x,
                                this._monitor.y + this._monitor.height - this.actor.height);
    },

    _updateWorkspaceIndicatorVisibility: function() {
        this._workspaceIndicator.actor.visible =
            this._monitor == Main.layoutManager.primaryMonitor ||
            !this._workspaceSettings.get_boolean('workspaces-only-on-primary');
    },

    _getPreferredUngroupedWindowListWidth: function() {
        if (this._windowList.get_n_children() == 0)
            return this._windowList.get_preferred_width(-1)[1];

        let children = this._windowList.get_children();
        let [, childWidth] = children[0].get_preferred_width(-1);
        let spacing = this._windowList.layout_manager.spacing;

        let workspace = global.screen.get_active_workspace();
        let windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace);
        if (this._perMonitor) {
            windows = windows.filter(Lang.bind(this, function(window) {
                return window.get_monitor() == this._monitor.index;
            }));
        }
        let nWindows = windows.length;
        if (nWindows == 0)
            return this._windowList.get_preferred_width(-1)[1];

        return nWindows * childWidth + (nWindows - 1) * spacing;
    },

    _getMaxWindowListWidth: function() {
        let indicatorsBox = this._workspaceIndicator.actor.get_parent();
        return this.actor.width - indicatorsBox.get_preferred_width(-1)[1];
    },

    _groupingModeChanged: function() {
        this._groupingMode = this._settings.get_enum('grouping-mode');

        if (this._groupingMode == GroupingMode.AUTO) {
            this._checkGrouping();
        } else {
            this._grouped = this._groupingMode == GroupingMode.ALWAYS;
            this._populateWindowList();
        }
    },

    _checkGrouping: function() {
        if (this._groupingMode != GroupingMode.AUTO)
            return;

        let maxWidth = this._getMaxWindowListWidth();
        let natWidth = this._getPreferredUngroupedWindowListWidth();

        let grouped = (maxWidth < natWidth);
        if (this._grouped !== grouped) {
            this._grouped = grouped;
            this._populateWindowList();
        }
    },

    _populateWindowList: function() {
        this._windowList.destroy_all_children();

        if (!this._grouped) {
            let windows = global.get_window_actors().sort(
                function(w1, w2) {
                    return w1.metaWindow.get_stable_sequence() -
                           w2.metaWindow.get_stable_sequence();
                });
            for (let i = 0; i < windows.length; i++)
                this._onWindowAdded(null, windows[i].metaWindow);
        } else {
            let apps = this._appSystem.get_running().sort(
                function(a1, a2) {
                    return _getAppStableSequence(a1) -
                           _getAppStableSequence(a2);
                });
            for (let i = 0; i < apps.length; i++)
                this._addApp(apps[i]);
        }
    },

    _updateKeyboardAnchor: function() {
        if (!Main.keyboard.actor)
            return;

        let anchorY = Main.overview.visible ? 0 : this.actor.height;
        Main.keyboard.actor.anchor_y = anchorY;
    },

    _onAppStateChanged: function(appSys, app) {
        if (!this._grouped)
            return;

        if (app.state == Shell.AppState.RUNNING)
            this._addApp(app);
        else if (app.state == Shell.AppState.STOPPED)
            this._removeApp(app);
    },

    _addApp: function(app) {
        let button = new AppButton(app, this._perMonitor, this._monitor.index);
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
        if (win.skip_taskbar)
            return;

        if (!this._grouped)
            this._checkGrouping();

        if (this._grouped)
            return;

        let children = this._windowList.get_children();
        for (let i = 0; i < children.length; i++) {
            if (children[i]._delegate.metaWindow == win)
                return;
        }

        let button = new WindowButton(win, this._perMonitor, this._monitor.index);
        this._windowList.layout_manager.pack(button.actor,
                                             true, true, true,
                                             Clutter.BoxAlignment.START,
                                             Clutter.BoxAlignment.START);
    },

    _onWindowRemoved: function(ws, win) {
        if (this._grouped)
            this._checkGrouping();

        if (this._grouped)
            return;

        if (win.get_compositor_private())
            return; // not actually removed, just moved to another workspace

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
            let signals = this._workspaceSignals.get(workspace);
            this._workspaceSignals.delete(workspace);
            workspace.disconnect(signals._windowAddedId);
            workspace.disconnect(signals._windowRemovedId);
        }
    },

    _onDragBegin: function() {
        DND.addDragMonitor(this._dragMonitor);
    },

    _onDragEnd: function() {
        DND.removeDragMonitor(this._dragMonitor);
        this._removeActivateTimeout();
    },

    _onDragMotion: function(dragEvent) {
        if (Main.overview.visible ||
            !this.actor.contains(dragEvent.targetActor)) {
            this._removeActivateTimeout();
            return DND.DragMotionResult.CONTINUE;
        }

        let hoveredWindow = null;
        if (dragEvent.targetActor._delegate)
            hoveredWindow = dragEvent.targetActor._delegate.metaWindow;

        if (!hoveredWindow ||
            this._dndWindow == hoveredWindow)
            return DND.DragMotionResult.CONTINUE;

        this._removeActivateTimeout();

        this._dndWindow = hoveredWindow;
        this._dndTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                                              DND_ACTIVATE_TIMEOUT,
                                              Lang.bind(this, this._activateWindow));

        return DND.DragMotionResult.CONTINUE;
    },

    _removeActivateTimeout: function() {
        if (this._dndTimeoutId)
            GLib.source_remove (this._dndTimeoutId);
        this._dndTimeoutId = 0;
        this._dndWindow = null;
    },

    _activateWindow: function() {
        let [x, y] = global.get_pointer();
        let pickedActor = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);

        if (this._dndWindow && this.actor.contains(pickedActor))
            this._dndWindow.activate(global.get_current_time());
        this._dndWindow = null;
        this._dndTimeoutId = 0;

        return false;
    },

    _onDestroy: function() {
        this._workspaceSettings.disconnect(this._workspacesOnlyOnPrimaryChangedId);

        this._workspaceIndicator.destroy();

        Main.ctrlAltTabManager.removeGroup(this.actor);

        this._appSystem.disconnect(this._appStateChangedId);
        this._appStateChangedId = 0;

        Main.layoutManager.disconnect(this._keyboardVisiblechangedId);
        this._keyboardVisiblechangedId = 0;

        Main.layoutManager.hideKeyboard();

        this._disconnectWorkspaceSignals();
        global.screen.disconnect(this._nWorkspacesChangedId);
        this._nWorkspacesChangedId = 0;

        global.window_manager.disconnect(this._switchWorkspaceId);
        this._switchWorkspaceId = 0;


        Main.overview.disconnect(this._overviewShowingId);
        Main.overview.disconnect(this._overviewHidingId);

        global.screen.disconnect(this._fullscreenChangedId);

        Main.xdndHandler.disconnect(this._dragBeginId);
        Main.xdndHandler.disconnect(this._dragEndId);

        this._settings.disconnect(this._groupingModeChangedId);

        let windows = global.get_window_actors();
        for (let i = 0; i < windows.length; i++)
            windows[i].metaWindow.set_icon_geometry(null);
    }
});

const Extension = new Lang.Class({
    Name: 'Extension',

    _init: function() {
        this._windowLists = null;
        this._injections = {};
    },

    enable: function() {
        this._windowLists = [];

        this._settings = Convenience.getSettings();
        this._showOnAllMonitorsChangedId =
            this._settings.connect('changed::show-on-all-monitors',
                                   Lang.bind(this, this._buildWindowLists));

        this._monitorsChangedId =
            Main.layoutManager.connect('monitors-changed',
                                       Lang.bind(this, this._buildWindowLists));

        this._buildWindowLists();
    },

    _buildWindowLists: function() {
        this._windowLists.forEach(function(windowList) {
            windowList.actor.destroy();
        });
        this._windowLists = [];

        let showOnAllMonitors = this._settings.get_boolean('show-on-all-monitors');

        Main.layoutManager.monitors.forEach(Lang.bind(this, function(monitor) {
            if (showOnAllMonitors || monitor == Main.layoutManager.primaryMonitor)
                this._windowLists.push(new WindowList(showOnAllMonitors, monitor));
        }));
    },

    disable: function() {
        if (!this._windowLists)
            return;

        this._settings.disconnect(this._showOnAllMonitorsChangedId);
        this._showOnAllMonitorsChangedId = 0;

        Main.layoutManager.disconnect(this._monitorsChangedId);
        this._monitorsChangedId = 0;

        this._windowLists.forEach(function(windowList) {
            windowList.actor.hide();
            windowList.actor.destroy();
        });
        this._windowLists = null;
    },

    someWindowListContains: function(actor) {
        return this._windowLists.some(function(windowList) {
            return windowList.actor.contains(actor);
        });
    }
});

function init() {
    return new Extension();
}
