/* exported WorkspaceIndicator */
const { Clutter, Gio, GObject, Meta, St } = imports.gi;

const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

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
        this._statusLabel = new St.Label({
            text: this._getStatusText(),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });
        container.add_actor(this._statusLabel);

        this._workspacesItems = [];

        this._workspaceManagerSignals = [
            workspaceManager.connect('notify::n-workspaces',
                this._updateMenu.bind(this)),
            workspaceManager.connect_after('workspace-switched',
                this._updateIndicator.bind(this))
        ];

        this.connect('scroll-event', this._onScrollEvent.bind(this));
        this._updateMenu();

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

    _updateIndicator() {
        this._workspacesItems[this._currentWorkspace].setOrnament(PopupMenu.Ornament.NONE);
        this._currentWorkspace = global.workspace_manager.get_active_workspace_index();
        this._workspacesItems[this._currentWorkspace].setOrnament(PopupMenu.Ornament.DOT);

        this._statusLabel.set_text(this._getStatusText());
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

