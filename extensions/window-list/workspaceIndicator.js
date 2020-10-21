/* exported WorkspaceIndicator */
const { Clutter, Gio, GObject, Meta, St } = imports.gi;

const DND = imports.ui.dnd;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

let WindowPreview = GObject.registerClass(
class WindowPreview extends St.Button {
    _init(window) {
        super._init({
            style_class: 'window-list-window-preview',
        });

        this._delegate = this;
        DND.makeDraggable(this, { restoreOnSuccess: true });

        this._window = window;

        this.connect('destroy', this._onDestroy.bind(this));

        this._sizeChangedId = this._window.connect('size-changed',
            () => this.queue_relayout());
        this._positionChangedId = this._window.connect('position-changed',
            () => this.queue_relayout());
        this._minimizedChangedId = this._window.connect('notify::minimized',
            this._updateVisible.bind(this));
        this._monitorEnteredId = global.display.connect('window-entered-monitor',
            this._updateVisible.bind(this));
        this._monitorLeftId = global.display.connect('window-left-monitor',
            this._updateVisible.bind(this));

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
    }

    _onFocusChanged() {
        if (global.display.focus_window === this._window)
            this.add_style_class_name('active');
        else
            this.remove_style_class_name('active');
    }

    _updateVisible() {
        let monitor = Main.layoutManager.findIndexForActor(this);
        this.visible = monitor === this._window.get_monitor() &&
            this._window.window_type !== Meta.WindowType.DESKTOP &&
            this._window.showing_on_its_workspace();
    }
});

let WorkspaceLayout = GObject.registerClass(
class WorkspaceLayout extends Clutter.LayoutManager {
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
                Math.round(frameRect.x * hscale),
                Math.round(frameRect.y * vscale));
            child.allocate(childBox);
        }
    }
});

let WorkspaceThumbnail = GObject.registerClass(
class WorkspaceThumbnail extends St.Button {
    _init(index) {
        super._init({
            style_class: 'workspace',
            child: new Clutter.Actor({
                layout_manager: new WorkspaceLayout(),
                clip_to_allocation: true,
            }),
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

var WorkspaceIndicator = GObject.registerClass(
class WorkspaceIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, _('Workspace Indicator'), true);
        this.setMenu(new PopupMenu.PopupMenu(this, 0.0, St.Side.BOTTOM));
        this.add_style_class_name('window-list-workspace-indicator');
        this.menu.actor.remove_style_class_name('panel-menu');

        let container = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
        });
        this.add_actor(container);

        let workspaceManager = global.workspace_manager;

        this._currentWorkspace = workspaceManager.get_active_workspace_index();
        this._statusLabel = new St.Label({ text: this._getStatusText() });

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
                this._onWorkspaceOrientationChanged.bind(this)),
        ];

        this.connect('scroll-event', this._onScrollEvent.bind(this));
        this._updateMenu();
        this._updateThumbnails();
        this._onWorkspaceOrientationChanged();

        this._settings = new Gio.Settings({ schema_id: 'org.gnome.desktop.wm.preferences' });
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

    _onWorkspaceOrientationChanged() {
        let vertical = global.workspace_manager.layout_rows === -1;
        this.reactive = vertical;

        this._statusBin.visible = vertical;
        this._thumbnailsBox.visible = !vertical;
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
});

