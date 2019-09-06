// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-
/* exported init enable disable */

const { Clutter, Gio, GObject, Meta, St } = imports.gi;

const DND = imports.ui.dnd;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const WORKSPACE_SCHEMA = 'org.gnome.desktop.wm.preferences';
const WORKSPACE_KEY = 'workspace-names';

let WindowPreview = GObject.registerClass(
class WindowPreview extends St.Button {
    _init(window) {
        super._init({
            style_class: 'workspace-indicator-window-preview',
        });

        this._delegate = this;
        DND.makeDraggable(this, { restoreOnSuccess: true });

        this._window = window;

        this.connect('destroy', this._onDestroy.bind(this));

        this._sizeChangedId = this._window.connect('size-changed',
            this._relayout.bind(this));
        this._positionChangedId = this._window.connect('position-changed',
            this._relayout.bind(this));
        this._minimizedChangedId = this._window.connect('notify::minimized',
            this._relayout.bind(this));
        this._monitorEnteredId = global.display.connect('window-entered-monitor',
            this._relayout.bind(this));
        this._monitorLeftId = global.display.connect('window-left-monitor',
            this._relayout.bind(this));

        // Do initial layout when we get a parent
        let id = this.connect('parent-set', () => {
            this.disconnect(id);
            if (!this.get_parent())
                return;
            this._laterId = Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
                this._laterId = 0;
                this._relayout();
                return false;
            });
        });

        this._focusChangedId = global.display.connect('notify::focus-window',
            this._onFocusChanged.bind(this));
        this._onFocusChanged();
    }

    // needed for DND
    get realWindow() {
        return this._window.get_compositor_private();
    }

    _onDestroy() {
        this._window.disconnect(this._sizeChangedId);
        this._window.disconnect(this._positionChangedId);
        this._window.disconnect(this._minimizedChangedId);
        global.display.disconnect(this._monitorEnteredId);
        global.display.disconnect(this._monitorLeftId);
        global.display.disconnect(this._focusChangedId);
        if (this._laterId)
            Meta.later_remove(this._laterId);
    }

    _onFocusChanged() {
        if (global.display.focus_window === this._window)
            this.add_style_class_name('active');
        else
            this.remove_style_class_name('active');
    }

    _relayout() {
        let monitor = Main.layoutManager.findIndexForActor(this);
        this.visible = monitor === this._window.get_monitor() &&
            this._window.window_type !== Meta.WindowType.DESKTOP &&
            this._window.showing_on_its_workspace();

        if (!this.visible)
            return;

        let workArea = Main.layoutManager.getWorkAreaForMonitor(monitor);
        let hscale = this.get_parent().allocation.get_width() / workArea.width;
        let vscale = this.get_parent().allocation.get_height() / workArea.height;

        let frameRect = this._window.get_frame_rect();
        this.set_size(
            Math.round(Math.min(frameRect.width, workArea.width) * hscale),
            Math.round(Math.min(frameRect.height, workArea.height) * vscale));
        this.set_position(
            Math.round(frameRect.x * hscale),
            Math.round(frameRect.y * vscale));
    }
});

let WorkspaceThumbnail = GObject.registerClass(
class WorkspaceThumbnail extends St.Button {
    _init(index) {
        super._init({
            style_class: 'workspace',
            child: new Clutter.Actor({
                layout_manager: new Clutter.BinLayout(),
                clip_to_allocation: true,
            }),
            x_fill: true,
            y_fill: true,
        });

        this.connect('destroy', this._onDestroy.bind(this));

        this._index = index;
        this._delegate = this; // needed for DND

        this._windowPreviews = new Map();

        let workspaceManager = global.workspace_manager;
        this._workspace = workspaceManager.get_workspace_by_index(index);

        this._windowAddedId = this._workspace.connect('window-added',
            (ws, window) => {
                this._addWindow(window);
            });
        this._windowRemovedId = this._workspace.connect('window-removed',
            (ws, window) => {
                this._removeWindow(window);
            });
        this._restackedId = global.display.connect('restacked',
            this._onRestacked.bind(this));

        this._workspace.list_windows().forEach(w => this._addWindow(w));
        this._onRestacked();
    }

    acceptDrop(source) {
        if (!source.realWindow)
            return false;

        let window = source.realWindow.get_meta_window();
        this._moveWindow(window);
        return true;
    }

    handleDragOver(source) {
        if (source.realWindow)
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

    _onDestroy() {
        this._workspace.disconnect(this._windowAddedId);
        this._workspace.disconnect(this._windowRemovedId);
        global.display.disconnect(this._restackedId);
    }
});

let WorkspaceIndicator = GObject.registerClass(
class WorkspaceIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, _('Workspace Indicator'));

        let container = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
        });
        this.add_actor(container);

        let workspaceManager = global.workspace_manager;

        this._currentWorkspace = workspaceManager.get_active_workspace_index();
        this._statusLabel = new St.Label({
            style_class: 'panel-workspace-indicator',
            y_align: Clutter.ActorAlign.CENTER,
            text: this._labelText(),
        });

        container.add_actor(this._statusLabel);

        this._thumbnailsBox = new St.BoxLayout({
            style_class: 'panel-workspace-indicator-box',
            y_expand: true,
            reactive: true,
        });

        container.add_actor(this._thumbnailsBox);

        this._workspacesItems = [];
        this._workspaceSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._workspaceSection);

        this._workspaceManagerSignals = [
            workspaceManager.connect_after('notify::n-workspaces',
                this._nWorkspacesChanged.bind(this)),
            workspaceManager.connect_after('workspace-switched',
                this._onWorkspaceSwitched.bind(this)),
            workspaceManager.connect('notify::layout-rows',
                this._onWorkspaceOrientationChanged.bind(this)),
        ];

        this.connect('scroll-event', this._onScrollEvent.bind(this));
        this._thumbnailsBox.connect('scroll-event', this._onScrollEvent.bind(this));
        this._createWorkspacesSection();
        this._updateThumbnails();
        this._onWorkspaceOrientationChanged();

        this._settings = new Gio.Settings({ schema_id: WORKSPACE_SCHEMA });
        this._settingsChangedId = this._settings.connect(
            `changed::${WORKSPACE_KEY}`,
            this._updateMenuLabels.bind(this));
    }

    _onDestroy() {
        for (let i = 0; i < this._workspaceManagerSignals.length; i++)
            global.workspace_manager.disconnect(this._workspaceManagerSignals[i]);

        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }

        Main.panel.set_offscreen_redirect(Clutter.OffscreenRedirect.ALWAYS);

        super._onDestroy();
    }

    _onWorkspaceOrientationChanged() {
        let vertical = global.workspace_manager.layout_rows === -1;
        this.reactive = vertical;

        this._statusLabel.visible = vertical;
        this._thumbnailsBox.visible = !vertical;

        // Disable offscreen-redirect when showing the workspace switcher
        // so that clip-to-allocation works
        Main.panel.set_offscreen_redirect(vertical
            ? Clutter.OffscreenRedirect.ALWAYS
            : Clutter.OffscreenRedirect.AUTOMATIC_FOR_OPACITY);
    }

    _onWorkspaceSwitched() {
        this._currentWorkspace = global.workspace_manager.get_active_workspace_index();

        this._updateMenuOrnament();
        this._updateActiveThumbnail();

        this._statusLabel.set_text(this._labelText());
    }

    _nWorkspacesChanged() {
        this._createWorkspacesSection();
        this._updateThumbnails();
    }

    _updateMenuOrnament() {
        for (let i = 0; i < this._workspacesItems.length; i++) {
            this._workspacesItems[i].setOrnament(i === this._currentWorkspace
                ? PopupMenu.Ornament.DOT
                : PopupMenu.Ornament.NONE);
        }
    }

    _updateActiveThumbnail() {
        let thumbs = this._thumbnailsBox.get_children();
        for (let i = 0; i < thumbs.length; i++) {
            if (i === this._currentWorkspace)
                thumbs[i].add_style_class_name('active');
            else
                thumbs[i].remove_style_class_name('active');
        }
    }

    _labelText(workspaceIndex) {
        if (workspaceIndex === undefined) {
            workspaceIndex = this._currentWorkspace;
            return (workspaceIndex + 1).toString();
        }
        return Meta.prefs_get_workspace_name(workspaceIndex);
    }

    _updateMenuLabels() {
        for (let i = 0; i < this._workspacesItems.length; i++)
            this._workspacesItems[i].label.text = this._labelText(i);
    }

    _createWorkspacesSection() {
        let workspaceManager = global.workspace_manager;

        this._workspaceSection.removeAll();
        this._workspacesItems = [];
        this._currentWorkspace = workspaceManager.get_active_workspace_index();

        let i = 0;
        for (; i < workspaceManager.n_workspaces; i++) {
            this._workspacesItems[i] = new PopupMenu.PopupMenuItem(this._labelText(i));
            this._workspaceSection.addMenuItem(this._workspacesItems[i]);
            this._workspacesItems[i].workspaceId = i;
            this._workspacesItems[i].label_actor = this._statusLabel;
            this._workspacesItems[i].connect('activate', (actor, _event) => {
                this._activate(actor.workspaceId);
            });

            if (i === this._currentWorkspace)
                this._workspacesItems[i].setOrnament(PopupMenu.Ornament.DOT);
        }

        this._statusLabel.set_text(this._labelText());
    }

    _updateThumbnails() {
        let workspaceManager = global.workspace_manager;

        this._thumbnailsBox.destroy_all_children();

        for (let i = 0; i < workspaceManager.n_workspaces; i++) {
            let thumb = new WorkspaceThumbnail(i);
            this._thumbnailsBox.add_actor(thumb);
        }
        this._updateActiveThumbnail();
    }

    _activate(index) {
        let workspaceManager = global.workspace_manager;

        if (index >= 0 && index < workspaceManager.n_workspaces) {
            let metaWorkspace = workspaceManager.get_workspace_by_index(index);
            metaWorkspace.activate(global.get_current_time());
        }
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


        let newIndex = global.workspace_manager.get_active_workspace_index() + diff;
        this._activate(newIndex);
    }
});

function init() {
    ExtensionUtils.initTranslations();
}

let _indicator;

function enable() {
    _indicator = new WorkspaceIndicator();
    Main.panel.addToStatusArea('workspace-indicator', _indicator);
}

function disable() {
    _indicator.destroy();
}
