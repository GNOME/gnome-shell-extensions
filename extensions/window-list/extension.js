// SPDX-FileCopyrightText: 2012 Florian Müllner <fmuellner@gnome.org>
// SPDX-FileCopyrightText: 2013 Giovanni Campagna <gcampagna@src.gnome.org>
// SPDX-FileCopyrightText: 2014 Sylvain Pasche <sylvain.pasche@gmail.com>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Meta from 'gi://Meta';
import Mtk from 'gi://Mtk';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {DashItemContainer} from 'resource:///org/gnome/shell/ui/dash.js';
import {
    ANIMATION_TIME as SLIDE_ANIMATION_TIME,
} from 'resource:///org/gnome/shell/ui/overview.js';

import {WorkspaceIndicator} from './workspaceIndicator.js';

const ICON_TEXTURE_SIZE = 24;
const DND_ACTIVATE_TIMEOUT = 500;

const MIN_DRAG_UPDATE_INTERVAL = 500 * GLib.TIME_SPAN_MILLISECOND;

const DRAG_OPACITY = 0.3;
const DRAG_FADE_DURATION = 200;

const DRAG_RESIZE_DURATION = 400;

const DRAG_PROXIMITY_THRESHOLD = 30;

const SAVED_POSITIONS_KEY = 'window-list-positions';

const ATTENTION_INDICATOR_MAX_SCALE = 0.4;
const ATTENTION_INDICATOR_TRANSITION_DURATION = 300;

const GroupingMode = {
    NEVER: 0,
    AUTO: 1,
    ALWAYS: 2,
};

class DragPlaceholderItem extends DashItemContainer {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super();
        this.setChild(new St.Bin({style_class: 'placeholder'}));
    }
}

/**
 * @param {Shell.App} app - an app
 * @returns {number} - the smallest stable sequence of the app's windows
 */
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

        this._maximizeItem = new PopupMenu.PopupMenuItem('');
        this._maximizeItem.connect('activate', () => {
            if (this._metaWindow.is_maximized())
                this._metaWindow.unmaximize();
            else
                this._metaWindow.maximize();
        });
        this.addMenuItem(this._maximizeItem);

        this._closeItem = new PopupMenu.PopupMenuItem(_('Close'));
        this._closeItem.connect('activate', () => {
            this._metaWindow.delete(global.get_current_time());
        });
        this.addMenuItem(this._closeItem);

        this._metaWindow.connectObject(
            'notify::minimized', this._updateMinimizeItem.bind(this),
            'notify::maximized-horizontally', this._updateMaximizeItem.bind(this),
            'notify::maximized-vertically', this._updateMaximizeItem.bind(this),
            this.actor);

        this._updateMinimizeItem();
        this._updateMaximizeItem();

        this.connect('open-state-changed', () => {
            if (!this.isOpen)
                return;

            this._minimizeItem.setSensitive(this._metaWindow.can_minimize());
            this._maximizeItem.setSensitive(this._metaWindow.can_maximize());
            this._closeItem.setSensitive(this._metaWindow.can_close());
        });
    }

    _updateMinimizeItem() {
        this._minimizeItem.label.text = this._metaWindow.minimized
            ? _('Unminimize') : _('Minimize');
    }

    _updateMaximizeItem() {
        this._maximizeItem.label.text = this._metaWindow.is_maximized()
            ? _('Unmaximize') : _('Maximize');
    }
}

class TitleWidget extends St.Widget {
    static {
        GObject.registerClass({
            GTypeFlags: GObject.TypeFlags.ABSTRACT,
            Properties: {
                'abstract-label': GObject.ParamSpec.boolean(
                    'abstract-label', null, null,
                    GObject.ParamFlags.READWRITE,
                    false),
            },
        }, this);
    }

    constructor() {
        super({
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
        });

        const hbox = new St.BoxLayout({
            style_class: 'window-button-box',
            x_expand: true,
            y_expand: true,
        });
        this.add_child(hbox);

        this._icon = new St.Bin({
            style_class: 'window-button-icon',
        });
        hbox.add_child(this._icon);

        this._label = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
        });
        hbox.add_child(this._label);
        this.label_actor = this._label;

        this.bind_property('abstract-label',
            this._label, 'visible',
            GObject.BindingFlags.SYNC_CREATE |
            GObject.BindingFlags.INVERT_BOOLEAN);

        this._abstractLabel = new St.Widget({
            style_class: 'window-button-abstract-label',
            x_expand: true,
            y_expand: true,
        });
        hbox.add_child(this._abstractLabel);

        this.bind_property('abstract-label',
            this._abstractLabel, 'visible',
            GObject.BindingFlags.SYNC_CREATE);

        this._attentionIndicator = new St.Widget({
            style_class: 'window-button-attention-indicator',
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.END,
            scale_x: 0,
        });
        this._attentionIndicator.set_pivot_point(0.5, 0.5);
        this.add_child(this._attentionIndicator);
    }

    setNeedsAttention(enable) {
        this._attentionIndicator.ease({
            scaleX: enable ? ATTENTION_INDICATOR_MAX_SCALE : 0,
            duration: ATTENTION_INDICATOR_TRANSITION_DURATION,
        });
    }
}

class WindowTitle extends TitleWidget {
    static {
        GObject.registerClass(this);
    }

    constructor(metaWindow) {
        super();

        this._metaWindow = metaWindow;

        this._metaWindow.connectObject(
            'notify::wm-class',
            () => this._updateIcon(), GObject.ConnectFlags.AFTER,
            'notify::gtk-application-id',
            () => this._updateIcon(), GObject.ConnectFlags.AFTER,
            'notify::title', () => this._updateTitle(),
            'notify::minimized', () => this._minimizedChanged(),
            'notify::demands-attention', () => this._updateNeedsAttention(),
            'notify::urgent', () => this._updateNeedsAttention(),
            this);

        this._updateIcon();
        this._minimizedChanged();
        this._updateNeedsAttention();
    }

    _minimizedChanged() {
        this._icon.opacity = this._metaWindow.minimized ? 128 : 255;
        this._updateTitle();
    }

    _updateNeedsAttention() {
        const {urgent, demandsAttention} = this._metaWindow;
        this.setNeedsAttention(urgent || demandsAttention);
    }

    _updateTitle() {
        if (!this._metaWindow.title)
            return;

        if (this._metaWindow.minimized)
            this._label.text = '[%s]'.format(this._metaWindow.title);
        else
            this._label.text = this._metaWindow.title;
    }

    _updateIcon() {
        let app = Shell.WindowTracker.get_default().get_window_app(this._metaWindow);
        if (app) {
            this._icon.child = app.create_icon_texture(ICON_TEXTURE_SIZE);
        } else {
            this._icon.child = new St.Icon({
                icon_name: 'application-x-executable',
                icon_size: ICON_TEXTURE_SIZE,
            });
        }
    }
}

class AppTitle extends TitleWidget {
    static {
        GObject.registerClass(this);
    }

    constructor(app) {
        super();

        this._app = app;
        this._windows = new Set();

        this._icon.child = app.create_icon_texture(ICON_TEXTURE_SIZE);
        this._label.text = app.get_name();

        this._app.connectObject(
            'windows-changed', () => this._onWindowsChanged(),
            this);
        this._onWindowsChanged();

        this.connect('destroy', () => {
            console.debug(`Clearing windows of app ${this._app.id}`);
            this._windows.clear();
        });
    }

    _onWindowsChanged() {
        const windows = this._app.get_windows();
        const removed = [...this._windows].filter(w => !windows.includes(w));
        removed.forEach(w => this._untrackWindow(w));
        windows.forEach(w => this._trackWindow(w));
        this._updateNeedsAttention();
    }

    _trackWindow(window) {
        if (this._windows.has(window))
            return;

        console.debug(`Tracking window ${window} for app ${this._app.id}`);
        window.connectObject(
            'notify::urgent', () => this._updateNeedsAttention(),
            'notify::demands-attention', () => this._updateNeedsAttention(),
            this);
        this._windows.add(window);
    }

    _untrackWindow(window) {
        if (!this._windows.delete(window))
            return;

        console.debug(`Untracking window ${window} for app ${this._app.id}`);
        window.disconnectObject(this);
    }

    _updateNeedsAttention() {
        const needsAttention =
            [...this._windows].some(w => w.urgent || w.demandsAttention);
        this.setNeedsAttention(needsAttention);
    }
}

class DragActor extends St.Bin {
    static {
        GObject.registerClass(this);
    }

    constructor(source, titleActor) {
        super({
            style_class: 'window-button-drag-actor',
            child: titleActor,
            width: source.width,
        });

        this.source = source;
    }

    setTargetWidth(width) {
        const currentWidth = this.width;

        // set width immediately so shell's DND code uses correct values
        this.set({width});

        // then transition from the original to the new width
        const laters = global.compositor.get_laters();
        laters.add(Meta.LaterType.BEFORE_REDRAW, () => {
            this.set({width: currentWidth});
            this.ease({
                width,
                duration: DRAG_RESIZE_DURATION,
            });
            return GLib.SOURCE_REMOVE;
        });
    }
}

class BaseButton extends DashItemContainer {
    static {
        GObject.registerClass({
            GTypeFlags: GObject.TypeFlags.ABSTRACT,
            Properties: {
                'ignore-workspace': GObject.ParamSpec.boolean(
                    'ignore-workspace', null, null,
                    GObject.ParamFlags.READWRITE,
                    false),
            },
            Signals: {
                'drag-begin': {},
                'drag-end': {},
            },
        }, this);
    }

    constructor(perMonitor, monitorIndex) {
        super();

        this._button = new St.Button({
            style_class: 'window-button',
            can_focus: true,
            x_expand: true,
            button_mask: St.ButtonMask.ONE | St.ButtonMask.THREE,
        });
        this.setChild(this._button);

        this._button.connect('notify::hover', () => {
            if (this._button.hover)
                this.showLabel();
            else
                this.hideLabel();
        });

        this._perMonitor = perMonitor;
        this._monitorIndex = monitorIndex;
        this._ignoreWorkspace = false;

        this.connect('notify::allocation',
            this._updateIconGeometry.bind(this));
        this._button.connect('clicked', this._onClicked.bind(this));
        this.connect('destroy', this._onDestroy.bind(this));
        this.connect('popup-menu', this._onPopupMenu.bind(this));

        this._contextMenuManager = new PopupMenu.PopupMenuManager(this);

        global.window_manager.connectObject('switch-workspace',
            () => this._updateVisibility(), this);

        if (this._perMonitor) {
            global.display.connectObject(
                'window-entered-monitor',
                this._windowEnteredOrLeftMonitor.bind(this),
                'window-left-monitor',
                this._windowEnteredOrLeftMonitor.bind(this),
                this);
        }

        this._button._delegate = this;
        this._draggable = DND.makeDraggable(this._button);
        this._draggable.connect('drag-begin', () => {
            this._removeLongPressTimeout();
            this.emit('drag-begin');
        });
        this._draggable.connect('drag-cancelled', () => {
            this._draggable._dragActor?.setTargetWidth(this.width);
            this.emit('drag-end');
        });
        this._draggable.connect('drag-end', () => this.emit('drag-end'));
    }

    get active() {
        return this._button.has_style_class_name('focused');
    }

    get ignore_workspace() {
        return this._ignoreWorkspace;
    }

    set ignore_workspace(ignore) {
        if (this._ignoreWorkspace === ignore)
            return;

        this._ignoreWorkspace = ignore;
        this.notify('ignore-workspace');

        this._updateVisibility();
    }

    showLabel() {
        const [, , preferredTitleWidth] = this.label_actor.get_preferred_size();
        const maxTitleWidth = this.label_actor.allocation.get_width();
        const isTitleFullyShown = preferredTitleWidth <= maxTitleWidth;

        const labelText = isTitleFullyShown
            ? '' : this.label_actor.text;

        this.setLabelText(labelText);
        super.showLabel();
    }

    _setLongPressTimeout() {
        if (this._longPressTimeoutId)
            return;

        const {longPressDuration} = Clutter.Settings.get_default();
        this._longPressTimeoutId =
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, longPressDuration, () => {
                delete this._longPressTimeoutId;

                if (this._canOpenPopupMenu() && !this._contextMenu.isOpen)
                    this._openMenu(this._contextMenu);
                return GLib.SOURCE_REMOVE;
            });
    }

    _removeLongPressTimeout() {
        if (!this._longPressTimeoutId)
            return;
        GLib.source_remove(this._longPressTimeoutId);
        delete this._longPressTimeoutId;
    }

    vfunc_button_press_event(event) {
        if (event.get_button() === 1)
            this._setLongPressTimeout();
        return super.vfunc_button_press_event(event);
    }

    vfunc_button_release_event(event) {
        this._removeLongPressTimeout();

        return super.vfunc_button_release_event(event);
    }

    vfunc_touch_event(event) {
        if (event.type() === Clutter.EventType.TOUCH_BEGIN)
            this._setLongPressTimeout();
        else if (event.type() === Clutter.EventType.TOUCH_END)
            this._removeLongPressTimeout();
        return super.vfunc_touch_event(event);
    }

    activate() {
        if (this.active)
            return;

        this._onClicked(this, 1);
    }

    getDragActor() {
        const titleActor = this._createTitleActor();
        titleActor.set({abstractLabel: true});

        const dragActor = new DragActor(this, titleActor);

        const [, natWidth] = this.get_preferred_width(-1);
        const targetWidth = Math.min(natWidth / 2, this.width);
        dragActor.setTargetWidth(targetWidth);

        return dragActor;
    }

    getDragActorSource() {
        return this;
    }

    _createTitleActor() {
        throw new GObject.NotImplementedError(
            `_createTitleActor in ${this.constructor.name}`);
    }

    _onClicked(_actor, _button) {
        throw new GObject.NotImplementedError(
            `_onClicked in ${this.constructor.name}`);
    }

    _canOpenPopupMenu() {
        return true;
    }

    _openMenu(menu) {
        menu.open();

        let event = Clutter.get_current_event();
        if (event && event.type() === Clutter.EventType.KEY_RELEASE)
            menu.actor.navigate_focus(null, Gtk.DirectionType.TAB_FORWARD, false);
    }

    _minimizeOrActivateWindow(window) {
        let focusWindow = global.display.focus_window;
        if (focusWindow === window ||
            focusWindow && focusWindow.get_transient_for() === window)
            window.minimize();
        else
            window.activate(global.get_current_time());
    }

    _onMenuStateChanged(menu, isOpen) {
        if (isOpen)
            return;

        const extension = Extension.lookupByURL(import.meta.url);

        let [x, y] = global.get_pointer();
        let actor = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
        if (extension.someWindowListContains(actor))
            actor.sync_hover();
    }

    _onPopupMenu(_actor) {
        if (!this._canOpenPopupMenu() || this._contextMenu.isOpen)
            return;
        this._openMenu(this._contextMenu);
    }

    _isFocused() {
        throw new GObject.NotImplementedError(
            `_isFocused in ${this.constructor.name}`);
    }

    _updateStyle() {
        if (this._isFocused())
            this._button.add_style_class_name('focused');
        else
            this._button.remove_style_class_name('focused');
    }

    _windowEnteredOrLeftMonitor(_metaDisplay, _monitorIndex, _metaWindow) {
        throw new GObject.NotImplementedError(
            `_windowEnteredOrLeftMonitor in ${this.constructor.name}`);
    }

    _isWindowVisible(window) {
        let workspace = global.workspace_manager.get_active_workspace();

        return !window.skip_taskbar &&
               (this._ignoreWorkspace || window.located_on_workspace(workspace)) &&
               (!this._perMonitor || window.get_monitor() === this._monitorIndex);
    }

    _updateVisibility() {
        throw new GObject.NotImplementedError(
            `_updateVisibility in ${this.constructor.name}`);
    }

    _getIconGeometry() {
        const rect = new Mtk.Rectangle();

        [rect.x, rect.y] = this.get_transformed_position();
        [rect.width, rect.height] = this.get_transformed_size();

        return rect;
    }

    _updateIconGeometry() {
        throw new GObject.NotImplementedError(
            `_updateIconGeometry in ${this.constructor.name}`);
    }

    _onDestroy() {
    }
}

class WindowButton extends BaseButton {
    static {
        GObject.registerClass(this);
    }

    constructor(metaWindow, perMonitor, monitorIndex) {
        super(perMonitor, monitorIndex);

        this.metaWindow = metaWindow;
        this._unmanaging = false;
        metaWindow.connectObject(
            'notify::skip-taskbar', () => this._updateVisibility(),
            'workspace-changed', () => this._updateVisibility(),
            'unmanaging', () => (this._unmanaging = true),
            this);

        this._updateVisibility();

        this._windowTitle = this._createTitleActor();
        this._button.set_child(this._windowTitle);
        this.label_actor = this._windowTitle.label_actor;

        this._contextMenu = new WindowContextMenu(this, this.metaWindow);
        this._contextMenu.connect('open-state-changed',
            this._onMenuStateChanged.bind(this));
        this._contextMenu.actor.hide();
        this._contextMenuManager.addMenu(this._contextMenu);
        Main.uiGroup.add_child(this._contextMenu.actor);

        global.display.connectObject('notify::focus-window',
            () => this._updateStyle(), this);
        this._updateStyle();
    }

    get id() {
        return `window:${this.metaWindow.get_id()}`;
    }

    _createTitleActor() {
        return new WindowTitle(this.metaWindow);
    }

    _onClicked(actor, button) {
        if (this._contextMenu.isOpen) {
            this._contextMenu.close();
            return;
        }

        if (!button || button === 1)
            this._minimizeOrActivateWindow(this.metaWindow);
        else
            this._openMenu(this._contextMenu);
    }

    _isFocused() {
        return global.display.focus_window === this.metaWindow;
    }

    _updateStyle() {
        super._updateStyle();

        if (this.metaWindow.minimized)
            this._button.add_style_class_name('minimized');
        else
            this._button.remove_style_class_name('minimized');
    }

    _windowEnteredOrLeftMonitor(metaDisplay, monitorIndex, metaWindow) {
        if (monitorIndex === this._monitorIndex && metaWindow === this.metaWindow)
            this._updateVisibility();
    }

    _updateVisibility() {
        if (this._unmanaging)
            return;

        this.visible = this._isWindowVisible(this.metaWindow);
    }

    _updateIconGeometry() {
        this.metaWindow.set_icon_geometry(this._getIconGeometry());
    }

    _onDestroy() {
        super._onDestroy();
        this._contextMenu.destroy();
    }
}

class AppContextMenu extends PopupMenu.PopupMenu {
    constructor(source) {
        super(source, 0.5, St.Side.BOTTOM);

        this._appButton = source;

        this._minimizeItem = new PopupMenu.PopupMenuItem(_('Minimize all'));
        this._minimizeItem.connect('activate', () => {
            this._appButton.getWindowList().forEach(w => w.minimize());
        });
        this.addMenuItem(this._minimizeItem);

        this._unminimizeItem = new PopupMenu.PopupMenuItem(_('Unminimize all'));
        this._unminimizeItem.connect('activate', () => {
            this._appButton.getWindowList().forEach(w => w.unminimize());
        });
        this.addMenuItem(this._unminimizeItem);

        this._maximizeItem = new PopupMenu.PopupMenuItem(_('Maximize all'));
        this._maximizeItem.connect('activate', () => {
            this._appButton.getWindowList().forEach(w => {
                w.maximize();
            });
        });
        this.addMenuItem(this._maximizeItem);

        this._unmaximizeItem = new PopupMenu.PopupMenuItem(_('Unmaximize all'));
        this._unmaximizeItem.connect('activate', () => {
            this._appButton.getWindowList().forEach(w => {
                w.unmaximize();
            });
        });
        this.addMenuItem(this._unmaximizeItem);

        let item = new PopupMenu.PopupMenuItem(_('Close all'));
        item.connect('activate', () => {
            this._appButton.getWindowList().forEach(w => {
                w.delete(global.get_current_time());
            });
        });
        this.addMenuItem(item);
    }

    open(animate) {
        let windows = this._appButton.getWindowList();
        this._minimizeItem.visible = windows.some(w => !w.minimized);
        this._unminimizeItem.visible = windows.some(w => w.minimized);
        this._maximizeItem.visible = windows.some(w => {
            return !w.is_maximized();
        });
        this._unmaximizeItem.visible = windows.some(w => {
            return w.is_maximized();
        });

        super.open(animate);
    }
}

class AppButton extends BaseButton {
    static {
        GObject.registerClass(this);
    }

    constructor(app, perMonitor, monitorIndex) {
        super(perMonitor, monitorIndex);

        this.app = app;
        this._updateVisibility();

        this._menuManager = new PopupMenu.PopupMenuManager(this);
        this._menu = new PopupMenu.PopupMenu(this, 0.5, St.Side.BOTTOM);
        this._menu.connect('open-state-changed',
            this._onMenuStateChanged.bind(this));
        this._menu.actor.hide();
        this._menu.connect('activate', this._onMenuActivate.bind(this));
        this._menuManager.addMenu(this._menu);
        Main.uiGroup.add_child(this._menu.actor);

        this.app.connectObject('windows-changed',
            () => this._windowsChanged(), this);
        this._windowsChanged();

        this._windowTracker = Shell.WindowTracker.get_default();
        this._windowTracker.connectObject('notify::focus-app',
            () => this._updateStyle(), this);
        this._updateStyle();
    }

    get id() {
        return `app:${this.app.get_id()}`;
    }

    _windowEnteredOrLeftMonitor(metaDisplay, monitorIndex, metaWindow) {
        if (this._windowTracker.get_window_app(metaWindow) === this.app &&
            monitorIndex === this._monitorIndex) {
            this._updateVisibility();
            this._windowsChanged();
        }
    }

    _updateVisibility() {
        if (this._ignoreWorkspace) {
            this.visible = true;
        } else if (!this._perMonitor) {
            // fast path: use ShellApp API to avoid iterating over all windows.
            let workspace = global.workspace_manager.get_active_workspace();
            this.visible = this.app.is_on_workspace(workspace);
        } else {
            this.visible = this.getWindowList().length >= 1;
        }
    }

    _isFocused() {
        return this._windowTracker.focus_app === this.app;
    }

    _updateIconGeometry() {
        let rect = this._getIconGeometry();

        let windows = this.app.get_windows();
        windows.forEach(w => w.set_icon_geometry(rect));
    }

    getWindowList() {
        return this.app.get_windows().filter(win => this._isWindowVisible(win));
    }

    _windowsChanged() {
        const windows = this.getWindowList();
        const singleWindowMode = windows.length === 1;

        if (this._singleWindowMode === singleWindowMode)
            return;

        this._singleWindowMode = singleWindowMode;

        this._button.child?.destroy();
        this._contextMenu?.destroy();

        if (this._singleWindowMode) {
            const [window] = windows;
            this._contextMenu = new WindowContextMenu(this, window);
        } else {
            this._contextMenu = new AppContextMenu(this);
        }

        this._button.child = this._createTitleActor();
        this.label_actor = this._button.child.label_actor;

        this._contextMenu.connect(
            'open-state-changed', this._onMenuStateChanged.bind(this));
        Main.uiGroup.add_child(this._contextMenu.actor);
        this._contextMenu.actor.hide();
        this._contextMenuManager.addMenu(this._contextMenu);
    }

    _createTitleActor() {
        if (this._singleWindowMode) {
            const [window] = this.getWindowList();
            return new WindowTitle(window);
        } else {
            return new AppTitle(this.app);
        }
    }

    _onClicked(actor, button) {
        let menuWasOpen = this._menu.isOpen;
        if (menuWasOpen)
            this._menu.close();

        let contextMenuWasOpen = this._contextMenu.isOpen;
        if (contextMenuWasOpen)
            this._contextMenu.close();

        if (!button || button === 1) {
            if (menuWasOpen)
                return;

            let windows = this.getWindowList();
            if (windows.length === 1) {
                if (contextMenuWasOpen)
                    return;
                this._minimizeOrActivateWindow(windows[0]);
            } else {
                this._menu.removeAll();

                for (let i = 0; i < windows.length; i++) {
                    let windowTitle = new WindowTitle(windows[i]);
                    let item = new PopupMenu.PopupBaseMenuItem();
                    item.add_child(windowTitle);
                    item._window = windows[i];
                    this._menu.addMenuItem(item);
                }
                this._openMenu(this._menu);
            }
        } else {
            if (contextMenuWasOpen)
                return;
            this._openMenu(this._contextMenu);
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
        this._menu.destroy();
    }
}

class WindowList extends St.Widget {
    static {
        GObject.registerClass(this);
    }

    constructor(perMonitor, monitor, settings) {
        super({
            name: 'panel',
            style_class: 'bottom-panel solid',
            reactive: true,
            track_hover: true,
            layout_manager: new Clutter.BinLayout(),
        });
        this.connect('destroy', this._onDestroy.bind(this));

        this._perMonitor = perMonitor;
        this._monitor = monitor;

        let box = new St.BoxLayout({x_expand: true, y_expand: true});
        this.add_child(box);

        this._windowList = new St.BoxLayout({
            style_class: 'window-list',
            reactive: true,
            x_align: Clutter.ActorAlign.START,
            x_expand: true,
            y_expand: true,
        });
        box.add_child(this._windowList);

        this._windowList.connect('scroll-event', this._onScrollEvent.bind(this));

        let indicatorsBox = new St.BoxLayout({x_align: Clutter.ActorAlign.END});
        box.add_child(indicatorsBox);

        this._workspaceIndicator = new BottomWorkspaceIndicator({
            baseStyleClass: 'window-list-workspace-indicator',
            settings,
        });
        indicatorsBox.add_child(this._workspaceIndicator.container);

        this._mutterSettings = new Gio.Settings({schema_id: 'org.gnome.mutter'});
        this._mutterSettings.connectObject(
            'changed::workspaces-only-on-primary',
            () => this._updateWorkspaceIndicatorVisibility(),
            'changed::dynamic-workspaces',
            () => this._updateWorkspaceIndicatorVisibility(),
            this);
        this._updateWorkspaceIndicatorVisibility();

        this._menuManager = new PopupMenu.PopupMenuManager(this);
        this._workspaceIndicator.connectObject('menu-set',
            () => this._onWorkspaceMenuSet(), this);
        this._onWorkspaceMenuSet();

        const inOverview = Main.overview.visible ||
            (Main.layoutManager._startingUp && Main.sessionMode.hasOverview);

        const overviewChromeOptions = {
            affectsStruts: true,
        };
        const chromeOptions = {
            ...overviewChromeOptions,
            trackFullscreen: true,
        };
        Main.layoutManager.addChrome(this, inOverview
            ? overviewChromeOptions
            : chromeOptions);

        Main.uiGroup.set_child_above_sibling(this, Main.layoutManager.panelBox);
        Main.ctrlAltTabManager.addGroup(this, _('Window List'), 'start-here-symbolic');

        this.visible = !inOverview;

        this.width = this._monitor.width;
        this.connect('notify::height', this._updatePosition.bind(this));
        this._updatePosition();

        this._appSystem = Shell.AppSystem.get_default();
        this._appSystem.connectObject('app-state-changed',
            this._onAppStateChanged.bind(this), this);

        // Hack: OSK gesture is tied to visibility, piggy-back on that
        Main.keyboard._bottomDragGesture.connectObject('notify::enabled',
            action => {
                const visible = !action.enabled;
                if (visible) {
                    Main.uiGroup.set_child_above_sibling(
                        this, Main.layoutManager.keyboardBox);
                } else {
                    Main.uiGroup.set_child_above_sibling(
                        this, Main.layoutManager.panelBox);
                }
                this._updateKeyboardAnchor();
            }, this);

        let workspaceManager = global.workspace_manager;

        workspaceManager.connectObject('notify::n-workspaces',
            () => this._updateWorkspaceIndicatorVisibility(), this);
        this._updateWorkspaceIndicatorVisibility();

        global.window_manager.connectObject('switch-workspace',
            () => this._checkGrouping(), this);

        Main.overview.connectObject(
            'showing', () => {
                this._retrackChrome(overviewChromeOptions);
                this._slideOut();
                this._updateKeyboardAnchor();
            },
            'hiding', () => {
                if (!this._monitor.inFullscreen)
                    this._slideIn();
            },
            'hidden', () => {
                this._retrackChrome(chromeOptions);
                this._updateKeyboardAnchor();
            }, this);

        global.display.connectObject('in-fullscreen-changed', () => {
            this._updateKeyboardAnchor();
        }, this);

        this._windowSignals = new Map();
        global.display.connectObject(
            'window-created', (dsp, win) => this._addWindow(win, true), this);

        Main.xdndHandler.connectObject(
            'drag-begin', () => this._monitorXdndDrag(),
            'drag-end', () => this._stopMonitoringXdndDrag(),
            this);

        this._xdndDragMonitor = {
            dragMotion: this._onXdndDragMotion.bind(this),
        };

        this._itemDragMonitor = {
            dragMotion: this._onItemDragMotion.bind(this),
            dragDrop: this._onItemDragDrop.bind(this),
        };

        this._dndTimeoutId = 0;
        this._dndWindow = null;

        this._dragPlaceholder = null;
        this._dragPlaceholderPos = -1;
        this._lastPlaceholderUpdate = 0;

        this._delegate = this;

        this._settings = settings;
        this._settings.connectObject('changed::grouping-mode',
            () => this._groupingModeChanged(), this);
        this._grouped = undefined;
        this._groupingModeChanged();
    }

    get_transformed_position() {
        // HACK: Remove translation we use for animations
        //       to keep struts stable
        const [x, y] = super.get_transformed_position();
        return [x, y - this.translation_y];
    }

    _onScrollEvent(actor, event) {
        let direction = event.get_scroll_direction();
        let diff = 0;
        if (direction === Clutter.ScrollDirection.DOWN)
            diff = 1;
        else if (direction === Clutter.ScrollDirection.UP)
            diff = -1;
        else
            return;

        let children = this._windowList.get_children()
            .filter(c => c.visible);
        let active = children.findIndex(c => c.active);
        let newActive = Math.max(0, Math.min(active + diff, children.length - 1));
        children[newActive].activate();
    }

    _onWorkspaceMenuSet() {
        if (this._workspaceIndicator.menu)
            this._menuManager.addMenu(this._workspaceIndicator.menu);
    }

    _updatePosition() {
        this.set_position(
            this._monitor.x,
            this._monitor.y + this._monitor.height - this.height);
    }

    _retrackChrome(options) {
        Main.layoutManager.untrackChrome(this);
        Main.layoutManager.trackChrome(this, options);
    }

    _slideIn() {
        this.show();
        this.ease({
            translation_y: 0,
            duration: SLIDE_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _slideOut() {
        this.ease({
            translation_y: this.height,
            duration: SLIDE_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this.hide(),
        });
    }

    _updateWorkspaceIndicatorVisibility() {
        let workspaceManager = global.workspace_manager;
        let hasWorkspaces = this._mutterSettings.get_boolean('dynamic-workspaces') ||
                            workspaceManager.n_workspaces > 1;
        let workspacesOnMonitor = this._monitor === Main.layoutManager.primaryMonitor ||
                                  !this._mutterSettings.get_boolean('workspaces-only-on-primary');

        this._workspaceIndicator.visible = hasWorkspaces && workspacesOnMonitor;
    }

    _getPreferredUngroupedWindowListWidth() {
        if (this._windowList.get_n_children() === 0)
            return this._windowList.get_preferred_width(-1)[1];

        let children = this._windowList.get_children();
        let [, childWidth] = children[0].get_preferred_width(-1);
        let {spacing} = this._windowList.layout_manager;

        let workspace = global.workspace_manager.get_active_workspace();
        let windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace);
        if (this._perMonitor)
            windows = windows.filter(w => w.get_monitor() === this._monitor.index);
        let nWindows = windows.length;
        if (nWindows === 0)
            return this._windowList.get_preferred_width(-1)[1];

        return nWindows * childWidth + (nWindows - 1) * spacing;
    }

    _getMaxWindowListWidth() {
        let indicatorsBox = this._workspaceIndicator.get_parent();
        return this.width - indicatorsBox.get_preferred_width(-1)[1];
    }

    _groupingModeChanged() {
        this._groupingMode = this._settings.get_enum('grouping-mode');

        if (this._groupingMode === GroupingMode.AUTO) {
            this._checkGrouping();
        } else {
            this._grouped = this._groupingMode === GroupingMode.ALWAYS;
            this._populateWindowList();
        }
    }

    _checkGrouping() {
        if (this._groupingMode !== GroupingMode.AUTO)
            return;

        let maxWidth = this._getMaxWindowListWidth();
        let natWidth = this._getPreferredUngroupedWindowListWidth();

        let grouped = maxWidth < natWidth;
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
                this._addWindow(windows[i].metaWindow, false);
        } else {
            let apps = this._appSystem.get_running().sort((a1, a2) => {
                return _getAppStableSequence(a1) -
                       _getAppStableSequence(a2);
            });
            for (let i = 0; i < apps.length; i++)
                this._addApp(apps[i], false);
        }

        this._restorePositions();
    }

    _updateKeyboardAnchor() {
        const translationY = Main.overview.visible ? 0 : this.height;
        Main.layoutManager.keyboardBox.translation_y = -translationY;
    }

    _onAppStateChanged(appSys, app) {
        if (!this._grouped)
            return;

        if (app.state === Shell.AppState.RUNNING)
            this._addApp(app, true);
        else if (app.state === Shell.AppState.STOPPED)
            this._removeApp(app);
    }

    _addButton(button, animate) {
        this._settings.bind('display-all-workspaces',
            button, 'ignore-workspace', Gio.SettingsBindFlags.GET);

        button.connect('drag-begin', () => {
            button.ease({
                opacity: 255 * DRAG_OPACITY,
                duration: DRAG_FADE_DURATION,
            });

            this._monitorItemDrag();
        });
        button.connect('drag-end', () => {
            button.ease({
                opacity: 255,
                duration: DRAG_FADE_DURATION,
            });

            this._stopMonitoringItemDrag();
            this._clearDragPlaceholder();
        });

        this._windowList.add_child(button);
        button.show(animate);
    }

    _addApp(app, animate) {
        const button = new AppButton(app, this._perMonitor, this._monitor.index);
        this._addButton(button, animate);
    }

    _removeApp(app) {
        let children = this._windowList.get_children();
        let child = children.find(c => c.app === app);
        child?.animateOutAndDestroy();
    }

    _addWindow(win, animate) {
        if (!this._grouped)
            this._checkGrouping();

        if (this._grouped)
            return;

        let children = this._windowList.get_children();
        if (children.find(c => c.metaWindow === win))
            return;

        this._windowSignals.set(
            win, win.connect('unmanaged', () => this._removeWindow(win)));

        const button = new WindowButton(win, this._perMonitor, this._monitor.index);
        this._addButton(button, animate);
    }

    _removeWindow(win) {
        if (this._grouped)
            this._checkGrouping();

        if (this._grouped)
            return;

        const id = this._windowSignals.get(win);
        if (id)
            win.disconnect(id);
        this._windowSignals.delete(win);

        let children = this._windowList.get_children();
        let child = children.find(c => c.metaWindow === win);
        child?.animateOutAndDestroy();
    }

    _clearDragPlaceholder() {
        this._dragPlaceholder?.animateOutAndDestroy();
        this._dragPlaceholder = null;
        this._dragPlaceholderPos = -1;
    }

    handleDragOver(source, _actor, x, _y, _time) {
        if (!(source instanceof BaseButton))
            return DND.DragMotionResult.NO_DROP;

        const buttons = this._windowList.get_children().filter(c => c instanceof BaseButton);
        const buttonPos = buttons.indexOf(source);
        const numButtons = buttons.length;
        let boxWidth = this._windowList.width;

        // Transform to window list coordinates for index calculation
        // (mostly relevant for RTL to discard workspace indicator etc.)
        x -= this._windowList.x;

        const rtl = this.text_direction === Clutter.TextDirection.RTL;
        let pos = rtl
            ? numButtons - Math.round(x * numButtons / boxWidth)
            : Math.round(x * numButtons / boxWidth);

        pos = Math.clamp(pos, 0, numButtons);

        const timeDelta =
            GLib.get_monotonic_time() - this._lastPlaceholderUpdate;

        if (pos !== this._dragPlaceholderPos && timeDelta >= MIN_DRAG_UPDATE_INTERVAL) {
            this._clearDragPlaceholder();
            this._dragPlaceholderPos = pos;

            this._lastPlaceholderUpdate = GLib.get_monotonic_time();

            // Don't allow positioning before or after self
            if (pos === buttonPos || pos === buttonPos + 1)
                return DND.DragMotionResult.CONTINUE;

            this._dragPlaceholder = new DragPlaceholderItem();
            const sibling = buttons[pos] ?? null;
            if (sibling)
                this._windowList.insert_child_below(this._dragPlaceholder, sibling);
            else
                this._windowList.insert_child_above(this._dragPlaceholder, null);
            this._dragPlaceholder.show(true);
        }

        return this._dragPlaceholder
            ? DND.DragMotionResult.MOVE_DROP
            : DND.DragMotionResult.NO_DROP;
    }

    acceptDrop(source, _actor, _x, _y, _time) {
        if (this._dragPlaceholderPos >= 0)
            this._windowList.set_child_at_index(source, this._dragPlaceholderPos);

        this._clearDragPlaceholder();

        this._savePositions();

        return true;
    }

    _getPositionStateKey() {
        return `${SAVED_POSITIONS_KEY}:${this._monitor.index}`;
    }

    _savePositions() {
        const buttons = this._windowList.get_children()
            .filter(b => b instanceof BaseButton);
        global.set_runtime_state(this._getPositionStateKey(),
            new GLib.Variant('as', buttons.map(b => b.id)));
    }

    _restorePositions() {
        const positions = global.get_runtime_state('as',
            this._getPositionStateKey())?.deepUnpack() ?? [];

        for (const button of this._windowList.get_children()) {
            const pos = positions.indexOf(button.id);
            if (pos > -1)
                this._windowList.set_child_at_index(button, pos);
        }
    }

    _monitorItemDrag() {
        DND.addDragMonitor(this._itemDragMonitor);
    }

    _stopMonitoringItemDrag() {
        DND.removeDragMonitor(this._itemDragMonitor);
    }

    _onItemDragMotion(dragEvent) {
        const {source, targetActor, dragActor, x, y} = dragEvent;

        const hasTarget = this._windowList.contains(targetActor);
        const isNear = Math.abs(y - this.y) < DRAG_PROXIMITY_THRESHOLD;

        if (hasTarget || isNear)
            return this.handleDragOver(source, dragActor, x, y);

        this._clearDragPlaceholder();
        return DND.DragMotionResult.CONTINUE;
    }

    _onItemDragDrop(dropEvent) {
        if (this._dragPlaceholderPos < 0)
            return DND.DragDropResult.CONTINUE;

        const {source} = dropEvent.dropActor;
        this.acceptDrop(source);
        dropEvent.dropActor.destroy();
        // HACK: SUCESS would make more sense, but results in gnome-shell
        // skipping all drag-end code
        return DND.DragDropResult.CONTINUE;
    }

    _monitorXdndDrag() {
        DND.addDragMonitor(this._xdndDragMonitor);
    }

    _stopMonitoringXdndDrag() {
        DND.removeDragMonitor(this._xdndDragMonitor);
        this._removeActivateTimeout();
    }

    _onXdndDragMotion(dragEvent) {
        if (Main.overview.visible ||
            !this.contains(dragEvent.targetActor)) {
            this._removeActivateTimeout();
            return DND.DragMotionResult.CONTINUE;
        }

        let hoveredWindow = dragEvent.targetActor.metaWindow;
        if (!hoveredWindow ||
            this._dndWindow === hoveredWindow)
            return DND.DragMotionResult.CONTINUE;

        this._removeActivateTimeout();

        this._dndWindow = hoveredWindow;
        this._dndTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            DND_ACTIVATE_TIMEOUT, this._activateWindow.bind(this));

        return DND.DragMotionResult.CONTINUE;
    }

    _removeActivateTimeout() {
        if (this._dndTimeoutId)
            GLib.source_remove(this._dndTimeoutId);
        this._dndTimeoutId = 0;
        this._dndWindow = null;
    }

    _activateWindow() {
        let [x, y] = global.get_pointer();
        let pickedActor = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);

        if (this._dndWindow && this.contains(pickedActor))
            this._dndWindow.activate(global.get_current_time());
        this._dndWindow = null;
        this._dndTimeoutId = 0;

        return false;
    }

    _onDestroy() {
        this._workspaceIndicator.destroy();

        Main.ctrlAltTabManager.removeGroup(this);

        this._windowSignals.forEach((id, win) => win.disconnect(id));
        this._windowSignals.clear();

        this._stopMonitoringXdndDrag();

        this._settings.disconnectObject();
        this._settings = null;

        let windows = global.get_window_actors();
        for (let i = 0; i < windows.length; i++)
            windows[i].metaWindow.set_icon_geometry(null);
    }
}

class BottomWorkspaceIndicator extends WorkspaceIndicator {
    static {
        GObject.registerClass(this);
    }

    setMenu(menu) {
        super.setMenu(menu);

        if (!menu)
            return;

        this.menu.actor.updateArrowSide(St.Side.BOTTOM);
        this.menu.actor.remove_style_class_name('panel-menu');
    }
}

export default class WindowListExtension extends Extension {
    constructor(metadata) {
        super(metadata);

        this._windowLists = null;
    }

    enable() {
        this._windowLists = [];

        this._settings = this.getSettings();
        this._settings.connectObject('changed::show-on-all-monitors',
            () => this._buildWindowLists(), this);

        Main.layoutManager.connectObject('monitors-changed',
            () => this._buildWindowLists(), this);

        this._buildWindowLists();
    }

    _buildWindowLists() {
        this._windowLists.forEach(list => list.destroy());
        this._windowLists = [];

        let showOnAllMonitors = this._settings.get_boolean('show-on-all-monitors');

        Main.layoutManager.monitors.forEach(monitor => {
            if (showOnAllMonitors || monitor === Main.layoutManager.primaryMonitor)
                this._windowLists.push(new WindowList(showOnAllMonitors, monitor, this.getSettings()));
        });
    }

    disable() {
        if (!this._windowLists)
            return;

        Main.layoutManager.disconnectObject(this);
        this._settings.disconnectObject(this);
        this._settings = null;

        this._windowLists.forEach(windowList => {
            windowList.hide();
            windowList.destroy();
        });
        this._windowLists = null;
    }

    someWindowListContains(actor) {
        return this._windowLists.some(list => list.contains(actor));
    }
}
