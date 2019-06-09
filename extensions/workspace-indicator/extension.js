// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-
/* exported init enable disable */

const { Clutter, Gio, GObject, Meta, St } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const WORKSPACE_SCHEMA = 'org.gnome.desktop.wm.preferences';
const WORKSPACE_KEY = 'workspace-names';

let WorkspaceThumbnail = GObject.registerClass({
    GTypeName: 'WorkspaceIndicatorWorkspaceThumbnail'
}, class WorkspaceThumbnail extends St.Button {
    _init(index) {
        super._init({
            style_class: 'workspace',
        });

        this._index = index;
    }

    on_clicked() {
        let ws = global.workspace_manager.get_workspace_by_index(this._index);
        if (ws)
            ws.activate(global.get_current_time());
    }
});


let WorkspaceIndicator = GObject.registerClass(
class WorkspaceIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, _('Workspace Indicator'));

        let container = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true
        });
        this.add_actor(container);

        let workspaceManager = global.workspace_manager;

        this._currentWorkspace = workspaceManager.get_active_workspace_index();
        this._statusLabel = new St.Label({
            style_class: 'panel-workspace-indicator',
            y_align: Clutter.ActorAlign.CENTER,
            text: this._labelText()
        });

        container.add_actor(this._statusLabel);

        this._thumbnailsBox = new St.BoxLayout({
            style_class: 'panel-workspace-indicator-box',
            y_expand: true,
            reactive: true
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
                this._onWorkspaceOrientationChanged.bind(this))
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

        super._onDestroy();
    }

    _onWorkspaceOrientationChanged() {
        let vertical = global.workspace_manager.layout_rows == -1;
        this.reactive = vertical;

        this._statusLabel.visible = vertical;
        this._thumbnailsBox.visible = !vertical;
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

    _labelText(workspaceIndex) {
        if (workspaceIndex == undefined) {
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

            if (i == this._currentWorkspace)
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
        if (direction == Clutter.ScrollDirection.DOWN) {
            diff = 1;
        } else if (direction == Clutter.ScrollDirection.UP) {
            diff = -1;
        } else {
            return;
        }

        let newIndex = global.workspace_manager.get_active_workspace_index() + diff;
        this._activate(newIndex);
    }
});

function init() {
    ExtensionUtils.initTranslations();
}

let _indicator;

function enable() {
    _indicator = new WorkspaceIndicator;
    Main.panel.addToStatusArea('workspace-indicator', _indicator);
}

function disable() {
    _indicator.destroy();
}
