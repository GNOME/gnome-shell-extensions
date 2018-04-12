const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const DND = imports.ui.dnd;
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
    let windows = app.get_windows().filter(w => !w.skip_taskbar);
    return windows.reduce((prev, cur) => {
        return Math.min(prev, cur.get_stable_sequence());
    }, Infinity);
}


class WindowContextMenu extends PopupMenu.PopupMenu {
    constructor(source, metaWindow) {
        super(source, 0.5, St.Side.BOTTOM);

        this._metaWindow = metaWindow;

        this._minimizeItem = new PopupMenu.PopupMenuItem('');
        this._minimizeItem.connect('activate', () => {
            if (this._metaWindow.minimized)
                this._metaWindow.unminimize();
            else
                this._metaWindow.minimize();
        });
        this.addMenuItem(this._minimizeItem);

        this._notifyMinimizedId =
            this._metaWindow.connect('notify::minimized',
                                     this._updateMinimizeItem.bind(this));
        this._updateMinimizeItem();

        this._maximizeItem = new PopupMenu.PopupMenuItem('');
        this._maximizeItem.connect('activate', () => {
            if (this._metaWindow.maximized_vertically &&
                this._metaWindow.maximized_horizontally)
                this._metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL |
                                            Meta.MaximizeFlags.VERTICAL);
            else
                this._metaWindow.maximize(Meta.MaximizeFlags.HORIZONTAL |
                                          Meta.MaximizeFlags.VERTICAL);
        });
        this.addMenuItem(this._maximizeItem);

        this._notifyMaximizedHId =
            this._metaWindow.connect('notify::maximized-horizontally',
                                     this._updateMaximizeItem.bind(this));
        this._notifyMaximizedVId =
            this._metaWindow.connect('notify::maximized-vertically',
                                     this._updateMaximizeItem.bind(this));
        this._updateMaximizeItem();

        this._closeItem = new PopupMenu.PopupMenuItem(_("Close"));
        this._closeItem.connect('activate', () => {
            this._metaWindow.delete(global.get_current_time());
        });
        this.addMenuItem(this._closeItem);

        this.actor.connect('destroy', this._onDestroy.bind(this));

        this.connect('open-state-changed', () => {
            if (!this.isOpen)
                return;

            this._minimizeItem.setSensitive(this._metaWindow.can_minimize());
            this._maximizeItem.setSensitive(this._metaWindow.can_maximize());
            this._closeItem.setSensitive(this._metaWindow.can_close());
        });
    }

    _updateMinimizeItem() {
        this._minimizeItem.label.text = this._metaWindow.minimized ? _("Unminimize")
                                                                   : _("Minimize");
    }

    _updateMaximizeItem() {
        let maximized = this._metaWindow.maximized_vertically &&
                        this._metaWindow.maximized_horizontally;
        this._maximizeItem.label.text = maximized ? _("Unmaximize")
                                                  : _("Maximize");
    }

    _onDestroy() {
        this._metaWindow.disconnect(this._notifyMinimizedId);
        this._metaWindow.disconnect(this._notifyMaximizedHId);
        this._metaWindow.disconnect(this._notifyMaximizedVId);
    }
};

class WindowTitle {
    constructor(metaWindow) {
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
                                       this._updateIcon.bind(this));
        this._notifyWmClass =
            this._metaWindow.connect_after('notify::wm-class',
                                           this._updateIcon.bind(this));
        this._notifyAppId =
            this._metaWindow.connect_after('notify::gtk-application-id',
                                           this._updateIcon.bind(this));
        this._updateIcon();

        this.actor.connect('destroy', this._onDestroy.bind(this));

        this._notifyTitleId =
            this._metaWindow.connect('notify::title',
                                     this._updateTitle.bind(this));
        this._notifyMinimizedId =
            this._metaWindow.connect('notify::minimized',
                                     this._minimizedChanged.bind(this));
        this._minimizedChanged();
    }

    _minimizedChanged() {
        this._icon.opacity = this._metaWindow.minimized ? 128 : 255;
        this._updateTitle();
    }

    _updateTitle() {
        if (!this._metaWindow.title)
            return;

        if (this._metaWindow.minimized)
            this.label_actor.text = '[%s]'.format(this._metaWindow.title);
        else
            this.label_actor.text = this._metaWindow.title;
    }

    _updateIcon() {
        let app = Shell.WindowTracker.get_default().get_window_app(this._metaWindow);
        if (app)
            this._icon.child = app.create_icon_texture(ICON_TEXTURE_SIZE);
        else
            this._icon.child = new St.Icon({ icon_name: 'icon-missing',
                                             icon_size: ICON_TEXTURE_SIZE });
    }

    _onDestroy() {
        this._textureCache.disconnect(this._iconThemeChangedId);
        this._metaWindow.disconnect(this._notifyTitleId);
        this._metaWindow.disconnect(this._notifyMinimizedId);
        this._metaWindow.disconnect(this._notifyWmClass);
        this._metaWindow.disconnect(this._notifyAppId);
    }
};


class BaseButton {
    constructor(perMonitor, monitorIndex) {
        if (this.constructor === BaseButton)
            throw new TypeError('Cannot instantiate abstract class BaseButton');

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
                           this._updateIconGeometry.bind(this));
        this.actor.connect('clicked', this._onClicked.bind(this));
        this.actor.connect('destroy', this._onDestroy.bind(this));
        this.actor.connect('popup-menu', this._onPopupMenu.bind(this));

        this._contextMenuManager = new PopupMenu.PopupMenuManager(this);

        this._switchWorkspaceId =
            global.window_manager.connect('switch-workspace',
                                          this._updateVisibility.bind(this));

        if (this._perMonitor) {
            this._windowEnteredMonitorId =
                global.screen.connect('window-entered-monitor',
                    this._windowEnteredOrLeftMonitor.bind(this));
            this._windowLeftMonitorId =
                global.screen.connect('window-left-monitor',
                    this._windowEnteredOrLeftMonitor.bind(this));
        }
    }

    get active() {
        return this.actor.has_style_class_name('focused');
    }

    activate() {
        if (this.active)
            return;

        this._onClicked(this.actor, 1);
    }

    _onClicked(actor, button) {
        throw new Error('Not implemented');
    }

    _canOpenPopupMenu() {
        return true;
    }

    _onPopupMenu(actor) {
        if (!this._canOpenPopupMenu() || this._contextMenu.isOpen)
            return;
        _openMenu(this._contextMenu);
    }

    _isFocused() {
        throw new Error('Not implemented');
    }

    _updateStyle() {
        if (this._isFocused())
            this.actor.add_style_class_name('focused');
        else
            this.actor.remove_style_class_name('focused');
    }

    _windowEnteredOrLeftMonitor(metaScreen, monitorIndex, metaWindow) {
        throw new Error('Not implemented');
    }

    _isWindowVisible(window) {
        let workspace = global.screen.get_active_workspace();

        return !window.skip_taskbar &&
               window.located_on_workspace(workspace) &&
               (!this._perMonitor || window.get_monitor() == this._monitorIndex);
    }

    _updateVisibility() {
        throw new Error('Not implemented');
    }

    _getIconGeometry() {
        let rect = new Meta.Rectangle();

        [rect.x, rect.y] = this.actor.get_transformed_position();
        [rect.width, rect.height] = this.actor.get_transformed_size();

        return rect;
    }

    _updateIconGeometry() {
        throw new Error('Not implemented');
    }

    _onDestroy() {
        global.window_manager.disconnect(this._switchWorkspaceId);

        if (this._windowEnteredMonitorId)
            global.screen.disconnect(this._windowEnteredMonitorId);
        this._windowEnteredMonitorId = 0;

        if (this._windowLeftMonitorId)
            global.screen.disconnect(this._windowLeftMonitorId);
        this._windowLeftMonitorId = 0;
    }
};


class WindowButton extends BaseButton {
    constructor(metaWindow, perMonitor, monitorIndex) {
        super(perMonitor, monitorIndex);

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
                                    this._updateVisibility.bind(this));

        this._notifyFocusId =
            global.display.connect('notify::focus-window',
                                   this._updateStyle.bind(this));
        this._updateStyle();
    }

    _onClicked(actor, button) {
        if (this._contextMenu.isOpen) {
            this._contextMenu.close();
            return;
        }

        if (button == 1)
            _minimizeOrActivateWindow(this.metaWindow);
        else
            _openMenu(this._contextMenu);
    }

    _isFocused() {
        return global.display.focus_window == this.metaWindow;
    }

    _updateStyle() {
        super._updateStyle();

        if (this.metaWindow.minimized)
            this.actor.add_style_class_name('minimized');
        else
            this.actor.remove_style_class_name('minimized');
    }

    _windowEnteredOrLeftMonitor(metaScreen, monitorIndex, metaWindow) {
        if (monitorIndex == this._monitorIndex && metaWindow == this.metaWindow)
            this._updateVisibility();
    }

    _updateVisibility() {
        this.actor.visible = this._isWindowVisible(this.metaWindow);
    }

    _updateIconGeometry() {
        this.metaWindow.set_icon_geometry(this._getIconGeometry());
    }

    _onDestroy() {
        super._onDestroy();
        this.metaWindow.disconnect(this._workspaceChangedId);
        global.display.disconnect(this._notifyFocusId);
        this._contextMenu.destroy();
    }
};


class AppContextMenu extends PopupMenu.PopupMenu {
    constructor(source, appButton) {
        super(source, 0.5, St.Side.BOTTOM);

        this._appButton = appButton;

        this._minimizeItem = new PopupMenu.PopupMenuItem(_("Minimize all"));
        this._minimizeItem.connect('activate', () => {
            this._appButton.getWindowList().forEach(w => { w.minimize(); });
        });
        this.addMenuItem(this._minimizeItem);

        this._unminimizeItem = new PopupMenu.PopupMenuItem(_("Unminimize all"));
        this._unminimizeItem.connect('activate', () => {
            this._appButton.getWindowList().forEach(w => { w.unminimize(); });
        });
        this.addMenuItem(this._unminimizeItem);

        this._maximizeItem = new PopupMenu.PopupMenuItem(_("Maximize all"));
        this._maximizeItem.connect('activate', () => {
            this._appButton.getWindowList().forEach(w => {
                w.maximize(Meta.MaximizeFlags.HORIZONTAL |
                           Meta.MaximizeFlags.VERTICAL);
            });
        });
        this.addMenuItem(this._maximizeItem);

        this._unmaximizeItem = new PopupMenu.PopupMenuItem(_("Unmaximize all"));
        this._unmaximizeItem.connect('activate', () => {
            this._appButton.getWindowList().forEach(w => {
                w.unmaximize(Meta.MaximizeFlags.HORIZONTAL |
                             Meta.MaximizeFlags.VERTICAL);
            });
        });
        this.addMenuItem(this._unmaximizeItem);

        let item = new PopupMenu.PopupMenuItem(_("Close all"));
        item.connect('activate', () => {
            this._appButton.getWindowList().forEach(w => {
                w.delete(global.get_current_time());
            });
        });
        this.addMenuItem(item);
    }

    open(animate) {
        let windows = this._appButton.getWindowList();
        this._minimizeItem.actor.visible = windows.some(w => !w.minimized);
        this._unminimizeItem.actor.visible = windows.some(w => w.minimized);
        this._maximizeItem.actor.visible = windows.some(w => {
            return !(w.maximized_horizontally && w.maximized_vertically);
        });
        this._unmaximizeItem.actor.visible = windows.some(w => {
            return w.maximized_horizontally && w.maximized_vertically;
        });

        super.open(animate);
    }
};

class AppButton extends BaseButton {
    constructor(app, perMonitor, monitorIndex) {
        super(perMonitor, monitorIndex);

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
        this._menu.connect('activate', this._onMenuActivate.bind(this));
        this._menuManager.addMenu(this._menu);
        Main.uiGroup.add_actor(this._menu.actor);

        this._appContextMenu = new AppContextMenu(this.actor, this);
        this._appContextMenu.connect('open-state-changed', _onMenuStateChanged);
        this._appContextMenu.actor.hide();
        Main.uiGroup.add_actor(this._appContextMenu.actor);

        this._textureCache = St.TextureCache.get_default();
        this._iconThemeChangedId =
            this._textureCache.connect('icon-theme-changed', () => {
                this._icon.child = app.create_icon_texture(ICON_TEXTURE_SIZE);
            });

        this._windowsChangedId =
            this.app.connect('windows-changed',
                             this._windowsChanged.bind(this));
        this._windowsChanged();

        this._windowTracker = Shell.WindowTracker.get_default();
        this._notifyFocusId =
            this._windowTracker.connect('notify::focus-app',
                                        this._updateStyle.bind(this));
        this._updateStyle();
    }

    _windowEnteredOrLeftMonitor(metaScreen, monitorIndex, metaWindow) {
        if (this._windowTracker.get_window_app(metaWindow) == this.app &&
            monitorIndex == this._monitorIndex) {
            this._updateVisibility();
            this._windowsChanged();
        }
    }

    _updateVisibility() {
        if (!this._perMonitor) {
            // fast path: use ShellApp API to avoid iterating over all windows.
            let workspace = global.screen.get_active_workspace();
            this.actor.visible = this.app.is_on_workspace(workspace);
        } else {
            this.actor.visible = this.getWindowList().length >= 1;
        }
    }

    _isFocused() {
        return this._windowTracker.focus_app == this.app;
    }

    _updateIconGeometry() {
        let rect = this._getIconGeometry();

        let windows = this.app.get_windows();
        windows.forEach(w => { w.set_icon_geometry(rect); });
    }

    getWindowList() {
        return this.app.get_windows().filter(win => this._isWindowVisible(win));
    }

    _windowsChanged() {
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

    }

    _onClicked(actor, button) {
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
    }

    _canOpenPopupMenu() {
        return !this._menu.isOpen;
    }

    _onMenuActivate(menu, child) {
        child._window.activate(global.get_current_time());
    }

    _onDestroy() {
        super._onDestroy();
        this._textureCache.disconnect(this._iconThemeChangedId);
        this._windowTracker.disconnect(this._notifyFocusId);
        this.app.disconnect(this._windowsChangedId);
        this._menu.destroy();
    }
};


class WorkspaceIndicator extends PanelMenu.Button {
    constructor() {
        super(0.0, _("Workspace Indicator"), true);
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
        this._screenSignals.push(global.screen.connect('notify::n-workspaces',
                                                       this._updateMenu.bind(this)));
        this._screenSignals.push(global.screen.connect_after('workspace-switched',
                                                             this._updateIndicator.bind(this)));

        this.actor.connect('scroll-event', this._onScrollEvent.bind(this));
        this._updateMenu();

        this._settings = new Gio.Settings({ schema_id: 'org.gnome.desktop.wm.preferences' });
        this._settingsChangedId =
            this._settings.connect('changed::workspace-names',
                                   this._updateMenu.bind(this));
    }

    destroy() {
        for (let i = 0; i < this._screenSignals.length; i++)
            global.screen.disconnect(this._screenSignals[i]);

        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }

        super.destroy();
    }

    _updateIndicator() {
        this.workspacesItems[this._currentWorkspace].setOrnament(PopupMenu.Ornament.NONE);
        this._currentWorkspace = global.screen.get_active_workspace().index();
        this.workspacesItems[this._currentWorkspace].setOrnament(PopupMenu.Ornament.DOT);

        this.statusLabel.set_text(this._getStatusText());
    }

    _getStatusText() {
        let current = global.screen.get_active_workspace().index();
        let total = global.screen.n_workspaces;

        return '%d / %d'.format(current + 1, total);
    }

    _updateMenu() {
        this.menu.removeAll();
        this.workspacesItems = [];
        this._currentWorkspace = global.screen.get_active_workspace().index();

        for(let i = 0; i < global.screen.n_workspaces; i++) {
            let name = Meta.prefs_get_workspace_name(i);
            let item = new PopupMenu.PopupMenuItem(name);
            item.workspaceId = i;

            item.connect('activate', (item, event) => {
                this._activate(item.workspaceId);
            });

            if (i == this._currentWorkspace)
                item.setOrnament(PopupMenu.Ornament.DOT);

            this.menu.addMenuItem(item);
            this.workspacesItems[i] = item;
        }

        this.statusLabel.set_text(this._getStatusText());
    }

    _activate(index) {
        if(index >= 0 && index < global.screen.n_workspaces) {
            let metaWorkspace = global.screen.get_workspace_by_index(index);
            metaWorkspace.activate(global.get_current_time());
        }
    }

    _onScrollEvent(actor, event) {
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
    }

    _allocate(actor, box, flags) {
        if (actor.get_n_children() > 0)
            actor.get_first_child().allocate(box, flags);
    }
};

class WindowList {
    constructor(perMonitor, monitor) {
        this._perMonitor = perMonitor;
        this._monitor = monitor;

        this.actor = new St.Widget({ name: 'panel',
                                     style_class: 'bottom-panel solid',
                                     reactive: true,
                                     track_hover: true,
                                     layout_manager: new Clutter.BinLayout()});
        this.actor.connect('destroy', this._onDestroy.bind(this));

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

        this._windowList.connect('style-changed', () => {
            let node = this._windowList.get_theme_node();
            let spacing = node.get_length('spacing');
            this._windowList.layout_manager.spacing = spacing;
        });
        this._windowList.connect('scroll-event', this._onScrollEvent.bind(this));

        let indicatorsBox = new St.BoxLayout({ x_align: Clutter.ActorAlign.END });
        box.add(indicatorsBox);

        this._workspaceIndicator = new WorkspaceIndicator();
        indicatorsBox.add(this._workspaceIndicator.container, { expand: false, y_fill: true });

        this._mutterSettings = new Gio.Settings({ schema_id: 'org.gnome.mutter' });
        this._workspaceSettings = this._getWorkspaceSettings();
        this._workspacesOnlyOnPrimaryChangedId =
            this._workspaceSettings.connect('changed::workspaces-only-on-primary',
                                            this._updateWorkspaceIndicatorVisibility.bind(this));
        this._dynamicWorkspacesSettings = this._getDynamicWorkspacesSettings();
        this._dynamicWorkspacesChangedId =
            this._dynamicWorkspacesSettings.connect('changed::dynamic-workspaces',
                                                    this._updateWorkspaceIndicatorVisibility.bind(this));
        this._updateWorkspaceIndicatorVisibility();

        this._menuManager = new PopupMenu.PopupMenuManager(this);
        this._menuManager.addMenu(this._workspaceIndicator.menu);

        Main.layoutManager.addChrome(this.actor, { affectsStruts: true,
                                                   trackFullscreen: true });
        Main.uiGroup.set_child_above_sibling(this.actor, Main.layoutManager.panelBox);
        Main.ctrlAltTabManager.addGroup(this.actor, _("Window List"), 'start-here-symbolic');

        this.actor.width = this._monitor.width;
        this.actor.connect('notify::height', this._updatePosition.bind(this));
        this._updatePosition();

        this._appSystem = Shell.AppSystem.get_default();
        this._appStateChangedId =
            this._appSystem.connect('app-state-changed',
                                    this._onAppStateChanged.bind(this));

        this._keyboardVisiblechangedId =
            Main.layoutManager.connect('keyboard-visible-changed',
                (o, state) => {
                    Main.layoutManager.keyboardBox.visible = state;
                    let keyboardBox = Main.layoutManager.keyboardBox;
                    keyboardBox.visible = state;
                    if (state)
                        Main.uiGroup.set_child_above_sibling(this.actor, keyboardBox);
                    else
                        Main.uiGroup.set_child_above_sibling(this.actor,
                                                             Main.layoutManager.panelBox);
                    this._updateKeyboardAnchor();
                });

        this._workspaceSignals = new Map();
        this._nWorkspacesChangedId =
            global.screen.connect('notify::n-workspaces',
                                  this._onWorkspacesChanged.bind(this));
        this._onWorkspacesChanged();

        this._switchWorkspaceId =
            global.window_manager.connect('switch-workspace',
                                          this._checkGrouping.bind(this));

        this._overviewShowingId =
            Main.overview.connect('showing', () => {
                this.actor.hide();
                this._updateKeyboardAnchor();
            });

        this._overviewHidingId =
            Main.overview.connect('hiding', () => {
                this.actor.visible = !Main.layoutManager.primaryMonitor.inFullscreen;
                this._updateKeyboardAnchor();
            });

        this._fullscreenChangedId =
            global.screen.connect('in-fullscreen-changed', () => {
                this._updateKeyboardAnchor();
            });

        this._dragBeginId =
            Main.xdndHandler.connect('drag-begin',
                                     this._onDragBegin.bind(this));
        this._dragEndId =
            Main.xdndHandler.connect('drag-end',
                                     this._onDragEnd.bind(this));
        this._dragMonitor = {
            dragMotion: this._onDragMotion.bind(this)
        };

        this._dndTimeoutId = 0;
        this._dndWindow = null;

        this._settings = Convenience.getSettings();
        this._groupingModeChangedId =
            this._settings.connect('changed::grouping-mode',
                                   this._groupingModeChanged.bind(this));
        this._grouped = undefined;
        this._groupingModeChanged();
    }

    _getDynamicWorkspacesSettings() {
        if (this._workspaceSettings.list_keys().includes('dynamic-workspaces'))
            return this._workspaceSettings;
        return this._mutterSettings;
    }

    _getWorkspaceSettings() {
        let settings = global.get_overrides_settings() || this._mutterSettings;
        if (settings.list_keys().includes('workspaces-only-on-primary'))
            return settings;
        return this._mutterSettings;
    }

    _onScrollEvent(actor, event) {
        let direction = event.get_scroll_direction();
        let diff = 0;
        if (direction == Clutter.ScrollDirection.DOWN)
            diff = 1;
        else if (direction == Clutter.ScrollDirection.UP)
            diff = -1;
        else
            return;

        let children = this._windowList.get_children().map(a => a._delegate);
        let active = 0;
        for (let i = 0; i < children.length; i++) {
            if (children[i].active) {
                active = i;
                break;
            }
        }

        active = Math.max(0, Math.min(active + diff, children.length-1));
        children[active].activate();
    }

    _updatePosition() {
        this.actor.set_position(this._monitor.x,
                                this._monitor.y + this._monitor.height - this.actor.height);
    }

    _updateWorkspaceIndicatorVisibility() {
        let hasWorkspaces = this._dynamicWorkspacesSettings.get_boolean('dynamic-workspaces') ||
                            global.screen.n_workspaces > 1;
        let workspacesOnMonitor = this._monitor == Main.layoutManager.primaryMonitor ||
                                  !this._workspaceSettings.get_boolean('workspaces-only-on-primary');

        this._workspaceIndicator.actor.visible = hasWorkspaces && workspacesOnMonitor;
    }

    _getPreferredUngroupedWindowListWidth() {
        if (this._windowList.get_n_children() == 0)
            return this._windowList.get_preferred_width(-1)[1];

        let children = this._windowList.get_children();
        let [, childWidth] = children[0].get_preferred_width(-1);
        let spacing = this._windowList.layout_manager.spacing;

        let workspace = global.screen.get_active_workspace();
        let windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace);
        if (this._perMonitor)
            windows = windows.filter(w => w.get_monitor() == this._monitor.index);
        let nWindows = windows.length;
        if (nWindows == 0)
            return this._windowList.get_preferred_width(-1)[1];

        return nWindows * childWidth + (nWindows - 1) * spacing;
    }

    _getMaxWindowListWidth() {
        let indicatorsBox = this._workspaceIndicator.actor.get_parent();
        return this.actor.width - indicatorsBox.get_preferred_width(-1)[1];
    }

    _groupingModeChanged() {
        this._groupingMode = this._settings.get_enum('grouping-mode');

        if (this._groupingMode == GroupingMode.AUTO) {
            this._checkGrouping();
        } else {
            this._grouped = this._groupingMode == GroupingMode.ALWAYS;
            this._populateWindowList();
        }
    }

    _checkGrouping() {
        if (this._groupingMode != GroupingMode.AUTO)
            return;

        let maxWidth = this._getMaxWindowListWidth();
        let natWidth = this._getPreferredUngroupedWindowListWidth();

        let grouped = (maxWidth < natWidth);
        if (this._grouped !== grouped) {
            this._grouped = grouped;
            this._populateWindowList();
        }
    }

    _populateWindowList() {
        this._windowList.destroy_all_children();

        if (!this._grouped) {
            let windows = global.get_window_actors().sort((w1, w2) => {
                return w1.metaWindow.get_stable_sequence() -
                       w2.metaWindow.get_stable_sequence();
            });
            for (let i = 0; i < windows.length; i++)
                this._onWindowAdded(null, windows[i].metaWindow);
        } else {
            let apps = this._appSystem.get_running().sort((a1, a2) => {
                return _getAppStableSequence(a1) -
                       _getAppStableSequence(a2);
            });
            for (let i = 0; i < apps.length; i++)
                this._addApp(apps[i]);
        }
    }

    _updateKeyboardAnchor() {
        if (!Main.keyboard.actor)
            return;

        let anchorY = Main.overview.visible ? 0 : this.actor.height;
        Main.keyboard.actor.anchor_y = anchorY;
    }

    _onAppStateChanged(appSys, app) {
        if (!this._grouped)
            return;

        if (app.state == Shell.AppState.RUNNING)
            this._addApp(app);
        else if (app.state == Shell.AppState.STOPPED)
            this._removeApp(app);
    }

    _addApp(app) {
        let button = new AppButton(app, this._perMonitor, this._monitor.index);
        this._windowList.layout_manager.pack(button.actor,
                                             true, true, true,
                                             Clutter.BoxAlignment.START,
                                             Clutter.BoxAlignment.START);
    }

    _removeApp(app) {
        let children = this._windowList.get_children();
        for (let i = 0; i < children.length; i++) {
            if (children[i]._delegate.app == app) {
                children[i].destroy();
                return;
            }
        }
    }

    _onWindowAdded(ws, win) {
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
    }

    _onWindowRemoved(ws, win) {
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
    }

    _onWorkspacesChanged() {
        let numWorkspaces = global.screen.n_workspaces;
        for (let i = 0; i < numWorkspaces; i++) {
            let workspace = global.screen.get_workspace_by_index(i);
            if (this._workspaceSignals.has(workspace))
                continue;

            let signals = { windowAddedId: 0, windowRemovedId: 0 };
            signals._windowAddedId =
                workspace.connect_after('window-added',
                                        this._onWindowAdded.bind(this));
            signals._windowRemovedId =
                workspace.connect('window-removed',
                                  this._onWindowRemoved.bind(this));
            this._workspaceSignals.set(workspace, signals);
        }

        this._updateWorkspaceIndicatorVisibility();
    }

    _disconnectWorkspaceSignals() {
        let numWorkspaces = global.screen.n_workspaces;
        for (let i = 0; i < numWorkspaces; i++) {
            let workspace = global.screen.get_workspace_by_index(i);
            let signals = this._workspaceSignals.get(workspace);
            this._workspaceSignals.delete(workspace);
            workspace.disconnect(signals._windowAddedId);
            workspace.disconnect(signals._windowRemovedId);
        }
    }

    _onDragBegin() {
        DND.addDragMonitor(this._dragMonitor);
    }

    _onDragEnd() {
        DND.removeDragMonitor(this._dragMonitor);
        this._removeActivateTimeout();
    }

    _onDragMotion(dragEvent) {
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
                                              this._activateWindow.bind(this));

        return DND.DragMotionResult.CONTINUE;
    }

    _removeActivateTimeout() {
        if (this._dndTimeoutId)
            GLib.source_remove (this._dndTimeoutId);
        this._dndTimeoutId = 0;
        this._dndWindow = null;
    }

    _activateWindow() {
        let [x, y] = global.get_pointer();
        let pickedActor = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);

        if (this._dndWindow && this.actor.contains(pickedActor))
            this._dndWindow.activate(global.get_current_time());
        this._dndWindow = null;
        this._dndTimeoutId = 0;

        return false;
    }

    _onDestroy() {
        this._workspaceSettings.disconnect(this._workspacesOnlyOnPrimaryChangedId);
        this._dynamicWorkspacesSettings.disconnect(this._dynamicWorkspacesChangedId);

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
};

class Extension {
    constructor() {
        this._windowLists = null;
        this._injections = {};
    }

    enable() {
        this._windowLists = [];

        this._settings = Convenience.getSettings();
        this._showOnAllMonitorsChangedId =
            this._settings.connect('changed::show-on-all-monitors',
                                   this._buildWindowLists.bind(this));

        this._monitorsChangedId =
            Main.layoutManager.connect('monitors-changed',
                                       this._buildWindowLists.bind(this));

        this._buildWindowLists();
    }

    _buildWindowLists() {
        this._windowLists.forEach(list => { list.actor.destroy(); });
        this._windowLists = [];

        let showOnAllMonitors = this._settings.get_boolean('show-on-all-monitors');

        Main.layoutManager.monitors.forEach(monitor => {
            if (showOnAllMonitors || monitor == Main.layoutManager.primaryMonitor)
                this._windowLists.push(new WindowList(showOnAllMonitors, monitor));
        });
    }

    disable() {
        if (!this._windowLists)
            return;

        this._settings.disconnect(this._showOnAllMonitorsChangedId);
        this._showOnAllMonitorsChangedId = 0;

        Main.layoutManager.disconnect(this._monitorsChangedId);
        this._monitorsChangedId = 0;

        this._windowLists.forEach(windowList => {
            windowList.actor.hide();
            windowList.actor.destroy();
        });
        this._windowLists = null;
    }

    someWindowListContains(actor) {
        return this._windowLists.some(list => list.actor.contains(actor));
    }
};

function init() {
    return new Extension();
}
