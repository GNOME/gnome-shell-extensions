/* exported WorkspaceIndicator */
const { Clutter, Gio, GObject, Meta, St } = imports.gi;

const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

let WorkspaceThumbnail = GObject.registerClass({
    GTypeName: 'WindowListWorkspaceThumbnail'
}, class WorkspaceThumbnail extends St.Button {
    _init(index) {
        super._init({
            style_class: 'workspace'
        });

        this._index = index;
    }

    on_clicked() {
        let ws = global.workspace_manager.get_workspace_by_index(this._index);
        if (ws)
            ws.activate(global.get_current_time());
    }
});

var WorkspaceIndicator = GObject.registerClass({
    GTypeName: 'WindowListWorkspaceIndicator'
}, class WorkspaceIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, _('Workspace Indicator'), true);
        this.setMenu(new PopupMenu.PopupMenu(this, 0.0, St.Side.BOTTOM));
        this.add_style_class_name('window-list-workspace-indicator');
        this.menu.actor.remove_style_class_name('panel-menu');

        let container = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true
        });
        this.add_actor(container);

        let workspaceManager = global.workspace_manager;

        this._currentWorkspace = workspaceManager.get_active_workspace_index();
        this._statusLabel = new St.Label({ text: this._getStatusText() });

        this._statusBin = new St.Bin({
            style_class: 'status-label-bin',
            x_expand: true,
            y_expand: true,
            child: this._statusLabel
        });
        container.add_actor(this._statusBin);

        this._thumbnailsBox = new St.BoxLayout({
            style_class: 'workspaces-box',
            y_expand: true,
            reactive: true
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
                this._onWorkspaceOrientationChanged.bind(this))
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
        let vertical = global.workspace_manager.layout_rows == -1;
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
            this._workspacesItems[i].setOrnament(i == this._currentWorkspace
                ? PopupMenu.Ornament.DOT
                : PopupMenu.Ornament.NONE);
        }
    }

    _updateActiveThumbnail() {
        let thumbs = this._thumbnailsBox.get_children();
        for (let i = 0; i < thumbs.length; i++) {
            if (i == this._currentWorkspace)
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

            item.connect('activate', (item, _event) => {
                this._activate(item.workspaceId);
            });

            if (i == this._currentWorkspace)
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
});

