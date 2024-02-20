// SPDX-FileCopyrightText: 2011 Erick Pérez Castellanos <erick.red@gmail.com>
// SPDX-FileCopyrightText: 2011 Giovanni Campagna <gcampagna@src.gnome.org>
// SPDX-FileCopyrightText: 2017 Florian Müllner <fmuellner@gnome.org>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const TOOLTIP_OFFSET = 6;
const TOOLTIP_ANIMATION_TIME = 150;

const MAX_THUMBNAILS = 6;

let baseStyleClassName = '';

class WindowPreview extends St.Button {
    static {
        GObject.registerClass(this);
    }

    constructor(window) {
        super({
            style_class: `${baseStyleClassName}-window-preview`,
        });

        this._delegate = this;
        DND.makeDraggable(this, {restoreOnSuccess: true});

        this._window = window;

        this._window.connectObject(
            'size-changed', () => this._checkRelayout(),
            'position-changed', () => this._checkRelayout(),
            'notify::minimized', this._updateVisible.bind(this),
            'notify::window-type', this._updateVisible.bind(this),
            this);
        this._updateVisible();

        global.display.connectObject('notify::focus-window',
            this._onFocusChanged.bind(this), this);
        this._onFocusChanged();
    }

    // needed for DND
    get metaWindow() {
        return this._window;
    }

    _onFocusChanged() {
        if (global.display.focus_window === this._window)
            this.add_style_class_name('active');
        else
            this.remove_style_class_name('active');
    }

    _checkRelayout() {
        const monitor = Main.layoutManager.findIndexForActor(this);
        const workArea = Main.layoutManager.getWorkAreaForMonitor(monitor);
        if (this._window.get_frame_rect().overlap(workArea))
            this.queue_relayout();
    }

    _updateVisible() {
        this.visible = this._window.window_type !== Meta.WindowType.DESKTOP &&
            this._window.showing_on_its_workspace();
    }
}

class WorkspaceLayout extends Clutter.LayoutManager {
    static {
        GObject.registerClass(this);
    }

    vfunc_get_preferred_width() {
        return [0, 0];
    }

    vfunc_get_preferred_height() {
        return [0, 0];
    }

    vfunc_allocate(container, box) {
        const monitor = Main.layoutManager.findIndexForActor(container);
        const workArea = Main.layoutManager.getWorkAreaForMonitor(monitor);
        const hscale = box.get_width() / workArea.width;
        const vscale = box.get_height() / workArea.height;

        for (const child of container) {
            const childBox = new Clutter.ActorBox();
            const frameRect = child.metaWindow.get_frame_rect();
            childBox.set_size(
                Math.round(Math.min(frameRect.width, workArea.width) * hscale),
                Math.round(Math.min(frameRect.height, workArea.height) * vscale));
            childBox.set_origin(
                Math.round((frameRect.x - workArea.x) * hscale),
                Math.round((frameRect.y - workArea.y) * vscale));
            child.allocate(childBox);
        }
    }
}

class WorkspaceThumbnail extends St.Button {
    static [GObject.properties] = {
        'active': GObject.ParamSpec.boolean(
            'active', '', '',
            GObject.ParamFlags.READWRITE,
            false),
    };

    static {
        GObject.registerClass(this);
    }

    constructor(index) {
        super({
            style_class: 'workspace',
            child: new Clutter.Actor({
                layout_manager: new WorkspaceLayout(),
                clip_to_allocation: true,
                x_expand: true,
                y_expand: true,
            }),
        });

        this._tooltip = new St.Label({
            style_class: 'dash-label',
            visible: false,
        });
        Main.uiGroup.add_child(this._tooltip);

        this.connect('destroy', this._onDestroy.bind(this));
        this.connect('notify::hover', this._syncTooltip.bind(this));

        this._index = index;
        this._delegate = this; // needed for DND

        this._windowPreviews = new Map();

        let workspaceManager = global.workspace_manager;
        this._workspace = workspaceManager.get_workspace_by_index(index);

        this._workspace.bind_property('active',
            this, 'active',
            GObject.BindingFlags.SYNC_CREATE);

        this._workspace.connectObject(
            'window-added', (ws, window) => this._addWindow(window),
            'window-removed', (ws, window) => this._removeWindow(window),
            this);

        global.display.connectObject('restacked',
            this._onRestacked.bind(this), this);

        this._workspace.list_windows().forEach(w => this._addWindow(w));
        this._onRestacked();
    }

    get active() {
        return this.has_style_class_name('active');
    }

    set active(active) {
        if (active)
            this.add_style_class_name('active');
        else
            this.remove_style_class_name('active');
        this.notify('active');
    }

    acceptDrop(source) {
        if (!source.metaWindow)
            return false;

        this._moveWindow(source.metaWindow);
        return true;
    }

    handleDragOver(source) {
        if (source.metaWindow)
            return DND.DragMotionResult.MOVE_DROP;
        else
            return DND.DragMotionResult.CONTINUE;
    }

    _addWindow(window) {
        if (this._windowPreviews.has(window))
            return;

        let preview = new WindowPreview(window);
        preview.connect('clicked', (a, btn) => this.emit('clicked', btn));
        this._windowPreviews.set(window, preview);
        this.child.add_child(preview);
    }

    _removeWindow(window) {
        let preview = this._windowPreviews.get(window);
        if (!preview)
            return;

        this._windowPreviews.delete(window);
        preview.destroy();
    }

    _onRestacked() {
        let lastPreview = null;
        let windows = global.get_window_actors().map(a => a.meta_window);
        for (let i = 0; i < windows.length; i++) {
            let preview = this._windowPreviews.get(windows[i]);
            if (!preview)
                continue;

            this.child.set_child_above_sibling(preview, lastPreview);
            lastPreview = preview;
        }
    }

    _moveWindow(window) {
        let monitorIndex = Main.layoutManager.findIndexForActor(this);
        if (monitorIndex !== window.get_monitor())
            window.move_to_monitor(monitorIndex);
        window.change_workspace_by_index(this._index, false);
    }

    on_clicked() {
        let ws = global.workspace_manager.get_workspace_by_index(this._index);
        if (ws)
            ws.activate(global.get_current_time());
    }

    _syncTooltip() {
        if (this.hover) {
            this._tooltip.set({
                text: Meta.prefs_get_workspace_name(this._index),
                visible: true,
                opacity: 0,
            });

            const [stageX, stageY] = this.get_transformed_position();
            const [thumbWidth, thumbHeight] = this.allocation.get_size();
            const [tipWidth, tipHeight] = this._tooltip.get_size();
            const xOffset = Math.floor((thumbWidth - tipWidth) / 2);
            const monitor = Main.layoutManager.findMonitorForActor(this);
            const x = Math.clamp(
                stageX + xOffset,
                monitor.x,
                monitor.x + monitor.width - tipWidth);
            const y = stageY - monitor.y > thumbHeight + TOOLTIP_OFFSET
                ? stageY - tipHeight - TOOLTIP_OFFSET // show above
                : stageY + thumbHeight + TOOLTIP_OFFSET; // show below
            this._tooltip.set_position(x, y);
        }

        this._tooltip.ease({
            opacity: this.hover ? 255 : 0,
            duration: TOOLTIP_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => (this._tooltip.visible = this.hover),
        });
    }

    _onDestroy() {
        this._tooltip.destroy();
    }
}

class WorkspacePreviews extends Clutter.Actor {
    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super({
            ...params,
            layout_manager: new Clutter.BinLayout(),
            reactive: true,
            y_expand: true,
        });

        this.connect('scroll-event',
            (a, event) => Main.wm.handleWorkspaceScroll(event));

        const {workspaceManager} = global;

        workspaceManager.connectObject(
            'notify::n-workspaces', () => this._updateThumbnails(), GObject.ConnectFlags.AFTER,
            this);

        this._thumbnailsBox = new St.BoxLayout({
            style_class: 'workspaces-box',
            y_expand: true,
        });
        this.add_child(this._thumbnailsBox);

        this._updateThumbnails();
    }

    _updateThumbnails() {
        const {nWorkspaces} = global.workspace_manager;

        this._thumbnailsBox.destroy_all_children();

        for (let i = 0; i < nWorkspaces; i++) {
            const thumb = new WorkspaceThumbnail(i);
            this._thumbnailsBox.add_child(thumb);
        }
    }
}

export class WorkspaceIndicator extends PanelMenu.Button {
    static {
        GObject.registerClass(this);
    }

    constructor(params = {}) {
        super(0.5, _('Workspace Indicator'));

        const {
            baseStyleClass = 'workspace-indicator',
        } = params;

        baseStyleClassName = baseStyleClass;
        this.add_style_class_name(baseStyleClassName);

        let container = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
        });
        this.add_child(container);

        let workspaceManager = global.workspace_manager;

        this._currentWorkspace = workspaceManager.get_active_workspace_index();
        this._statusLabel = new St.Label({
            style_class: 'status-label',
            y_align: Clutter.ActorAlign.CENTER,
            text: this._getStatusText(),
        });
        container.add_child(this._statusLabel);

        this._thumbnails = new WorkspacePreviews();
        container.add_child(this._thumbnails);

        this._workspacesItems = [];

        workspaceManager.connectObject(
            'notify::n-workspaces', this._nWorkspacesChanged.bind(this), GObject.ConnectFlags.AFTER,
            'workspace-switched', this._onWorkspaceSwitched.bind(this), GObject.ConnectFlags.AFTER,
            'notify::layout-rows', this._updateThumbnailVisibility.bind(this),
            this);

        this.connect('scroll-event',
            (a, event) => Main.wm.handleWorkspaceScroll(event));

        this._inTopBar = false;
        this.connect('notify::realized', () => {
            if (!this.realized)
                return;

            this._inTopBar = Main.panel.contains(this);
            this._updateTopBarRedirect();
        });

        this._updateMenu();
        this._updateThumbnailVisibility();

        const desktopSettings =
            new Gio.Settings({schema_id: 'org.gnome.desktop.wm.preferences'});
        desktopSettings.connectObject('changed::workspace-names',
            () => this._updateMenuLabels(), this);
    }

    _onDestroy() {
        if (this._inTopBar)
            Main.panel.set_offscreen_redirect(Clutter.OffscreenRedirect.ALWAYS);
        this._inTopBar = false;

        super._onDestroy();
    }

    _updateThumbnailVisibility() {
        const {workspaceManager} = global;
        const vertical = workspaceManager.layout_rows === -1;
        const useMenu =
            vertical || workspaceManager.n_workspaces > MAX_THUMBNAILS;
        this.reactive = useMenu;

        this._statusLabel.visible = useMenu;
        this._thumbnails.visible = !useMenu;

        this._updateTopBarRedirect();
    }

    _updateTopBarRedirect() {
        if (!this._inTopBar)
            return;

        // Disable offscreen-redirect when showing the workspace switcher
        // so that clip-to-allocation works
        Main.panel.set_offscreen_redirect(this._thumbnails.visible
            ? Clutter.OffscreenRedirect.ALWAYS
            : Clutter.OffscreenRedirect.AUTOMATIC_FOR_OPACITY);
    }

    _onWorkspaceSwitched() {
        this._currentWorkspace = global.workspace_manager.get_active_workspace_index();

        this._updateMenuOrnament();

        this._statusLabel.set_text(this._getStatusText());
    }

    _nWorkspacesChanged() {
        this._updateMenu();
        this._updateThumbnailVisibility();
    }

    _updateMenuOrnament() {
        for (let i = 0; i < this._workspacesItems.length; i++) {
            this._workspacesItems[i].setOrnament(i === this._currentWorkspace
                ? PopupMenu.Ornament.DOT
                : PopupMenu.Ornament.NO_DOT);
        }
    }

    _getStatusText() {
        const {nWorkspaces} = global.workspace_manager;
        const current = this._currentWorkspace + 1;
        return `${current} / ${nWorkspaces}`;
    }

    _updateMenuLabels() {
        for (let i = 0; i < this._workspacesItems.length; i++) {
            const item = this._workspacesItems[i];
            item.label.text = Meta.prefs_get_workspace_name(i);
        }
    }

    _updateMenu() {
        let workspaceManager = global.workspace_manager;

        this.menu.removeAll();
        this._workspacesItems = [];
        this._currentWorkspace = workspaceManager.get_active_workspace_index();

        for (let i = 0; i < workspaceManager.n_workspaces; i++) {
            const name = Meta.prefs_get_workspace_name(i);
            const item = new PopupMenu.PopupMenuItem(name);

            item.connect('activate',
                () => this._activate(i));

            item.setOrnament(i === this._currentWorkspace
                ? PopupMenu.Ornament.DOT
                : PopupMenu.Ornament.NO_DOT);

            this.menu.addMenuItem(item);
            this._workspacesItems[i] = item;
        }

        this._statusLabel.set_text(this._getStatusText());
    }

    _activate(index) {
        let workspaceManager = global.workspace_manager;

        if (index >= 0 && index < workspaceManager.n_workspaces) {
            let metaWorkspace = workspaceManager.get_workspace_by_index(index);
            metaWorkspace.activate(global.get_current_time());
        }
    }
}
