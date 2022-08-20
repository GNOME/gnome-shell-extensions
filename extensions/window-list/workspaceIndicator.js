/* exported WorkspaceIndicator */
const {Clutter, Gio, GObject, Meta, St} = imports.gi;

const DND = imports.ui.dnd;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const _ = ExtensionUtils.gettext;

const TOOLTIP_OFFSET = 6;
const TOOLTIP_ANIMATION_TIME = 150;

const MAX_THUMBNAILS = 6;

class WindowPreview extends St.Button {
    static {
        GObject.registerClass(this);
    }

    constructor(window) {
        super({
            style_class: 'window-list-window-preview',
        });

        this._delegate = this;
        DND.makeDraggable(this, {restoreOnSuccess: true});

        this._window = window;

        this.connect('destroy', this._onDestroy.bind(this));

        this._sizeChangedId = this._window.connect('size-changed',
            () => this.queue_relayout());
        this._positionChangedId = this._window.connect('position-changed',
            () => {
                this._updateVisible();
                this.queue_relayout();
            });
        this._minimizedChangedId = this._window.connect('notify::minimized',
            this._updateVisible.bind(this));

        this._focusChangedId = global.display.connect('notify::focus-window',
            this._onFocusChanged.bind(this));
        this._onFocusChanged();
    }

    // needed for DND
    get metaWindow() {
        return this._window;
    }

    _onDestroy() {
        this._window.disconnect(this._sizeChangedId);
        this._window.disconnect(this._positionChangedId);
        this._window.disconnect(this._minimizedChangedId);
        global.display.disconnect(this._focusChangedId);
    }

    _onFocusChanged() {
        if (global.display.focus_window === this._window)
            this.add_style_class_name('active');
        else
            this.remove_style_class_name('active');
    }

    _updateVisible() {
        const monitor = Main.layoutManager.findIndexForActor(this);
        const workArea = Main.layoutManager.getWorkAreaForMonitor(monitor);
        this.visible = this._window.get_frame_rect().overlap(workArea) &&
            this._window.window_type !== Meta.WindowType.DESKTOP &&
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
                Math.round((frameRect.y - workArea.y)  * vscale));
            child.allocate(childBox);
        }
    }
}

class WorkspaceThumbnail extends St.Button {
    static {
        GObject.registerClass(this);
    }

    constructor(index) {
        super({
            style_class: 'workspace',
            child: new Clutter.Actor({
                layout_manager: new WorkspaceLayout(),
                clip_to_allocation: true,
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
            const thumbWidth = this.allocation.get_width();
            const tipWidth = this._tooltip.width;
            const tipHeight = this._tooltip.height;
            const xOffset = Math.floor((thumbWidth - tipWidth) / 2);
            const monitor = Main.layoutManager.findMonitorForActor(this);
            const x = Math.clamp(
                stageX + xOffset,
                monitor.x,
                monitor.x + monitor.width - tipWidth);
            const y = stageY - tipHeight - TOOLTIP_OFFSET;
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

        this._workspace.disconnect(this._windowAddedId);
        this._workspace.disconnect(this._windowRemovedId);
        global.display.disconnect(this._restackedId);
    }
}

var WorkspaceIndicator = class WorkspaceIndicator extends PanelMenu.Button {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super(0.0, _('Workspace Indicator'), true);
        this.setMenu(new PopupMenu.PopupMenu(this, 0.0, St.Side.BOTTOM));
        this.add_style_class_name('window-list-workspace-indicator');
        this.remove_style_class_name('panel-button');
        this.menu.actor.remove_style_class_name('panel-menu');

        let container = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
        });
        this.add_actor(container);

        let workspaceManager = global.workspace_manager;

        this._currentWorkspace = workspaceManager.get_active_workspace_index();
        this._statusLabel = new St.Label({text: this._getStatusText()});

        this._statusBin = new St.Bin({
            style_class: 'status-label-bin',
            x_expand: true,
            y_expand: true,
            child: this._statusLabel,
        });
        container.add_actor(this._statusBin);

        this._thumbnailsBox = new St.BoxLayout({
            style_class: 'workspaces-box',
            y_expand: true,
            reactive: true,
        });
        this._thumbnailsBox.connect('scroll-event',
            this._onScrollEvent.bind(this));
        container.add_actor(this._thumbnailsBox);

        this._workspacesItems = [];

        this._workspaceManagerSignals = [
            workspaceManager.connect('notify::n-workspaces',
                this._nWorkspacesChanged.bind(this)),
            workspaceManager.connect_after('workspace-switched',
                this._onWorkspaceSwitched.bind(this)),
            workspaceManager.connect('notify::layout-rows',
                this._updateThumbnailVisibility.bind(this)),
        ];

        this.connect('scroll-event', this._onScrollEvent.bind(this));
        this._updateMenu();
        this._updateThumbnails();
        this._updateThumbnailVisibility();

        this._settings = new Gio.Settings({schema_id: 'org.gnome.desktop.wm.preferences'});
        this._settingsChangedId = this._settings.connect(
            'changed::workspace-names', this._updateMenuLabels.bind(this));
    }

    _onDestroy() {
        for (let i = 0; i < this._workspaceManagerSignals.length; i++)
            global.workspace_manager.disconnect(this._workspaceManagerSignals[i]);

        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }

        super._onDestroy();
    }

    _updateThumbnailVisibility() {
        const {workspaceManager} = global;
        const vertical = workspaceManager.layout_rows === -1;
        const useMenu =
            vertical || workspaceManager.n_workspaces > MAX_THUMBNAILS;
        this.reactive = useMenu;

        this._statusBin.visible = useMenu;
        this._thumbnailsBox.visible = !useMenu;
    }

    _onWorkspaceSwitched() {
        let workspaceManager = global.workspace_manager;
        this._currentWorkspace = workspaceManager.get_active_workspace_index();

        this._updateMenuOrnament();
        this._updateActiveThumbnail();

        this._statusLabel.set_text(this._getStatusText());
    }

    _nWorkspacesChanged() {
        this._updateMenu();
        this._updateThumbnails();
        this._updateThumbnailVisibility();
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

    _getStatusText() {
        let workspaceManager = global.workspace_manager;
        let current = workspaceManager.get_active_workspace_index();
        let total = workspaceManager.n_workspaces;

        return '%d / %d'.format(current + 1, total);
    }

    _updateMenuLabels() {
        for (let i = 0; i < this._workspacesItems.length; i++) {
            let item = this._workspacesItems[i];
            let name = Meta.prefs_get_workspace_name(i);
            item.label.text = name;
        }
    }

    _updateMenu() {
        let workspaceManager = global.workspace_manager;

        this.menu.removeAll();
        this._workspacesItems = [];
        this._currentWorkspace = workspaceManager.get_active_workspace_index();

        for (let i = 0; i < workspaceManager.n_workspaces; i++) {
            let name = Meta.prefs_get_workspace_name(i);
            let item = new PopupMenu.PopupMenuItem(name);
            item.workspaceId = i;

            item.connect('activate', () => {
                this._activate(item.workspaceId);
            });

            if (i === this._currentWorkspace)
                item.setOrnament(PopupMenu.Ornament.DOT);

            this.menu.addMenuItem(item);
            this._workspacesItems[i] = item;
        }

        this._statusLabel.set_text(this._getStatusText());
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

        let newIndex = this._currentWorkspace + diff;
        this._activate(newIndex);
    }
};
