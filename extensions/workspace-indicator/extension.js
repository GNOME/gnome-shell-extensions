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

let WorkspaceIndicator = GObject.registerClass(
class WorkspaceIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, _('Workspace Indicator'));

        let workspaceManager = global.workspace_manager;

        this._currentWorkspace = workspaceManager.get_active_workspace_index();
        this._statusLabel = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
            text: this._labelText()
        });

        this.add_actor(this._statusLabel);

        this._workspacesItems = [];
        this._workspaceSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._workspaceSection);

        this._workspaceManagerSignals = [
            workspaceManager.connect_after('workspace-added',
                this._createWorkspacesSection.bind(this)),
            workspaceManager.connect_after('workspace-removed',
                this._createWorkspacesSection.bind(this)),
            workspaceManager.connect_after('workspace-switched',
                this._updateIndicator.bind(this))
        ];

        this.connect('scroll-event', this._onScrollEvent.bind(this));
        this._createWorkspacesSection();

        //styling
        this._statusLabel.add_style_class_name('panel-workspace-indicator');

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

    _updateIndicator() {
        this._workspacesItems[this._currentWorkspace].setOrnament(PopupMenu.Ornament.NONE);
        this._currentWorkspace = global.workspace_manager.get_active_workspace_index();
        this._workspacesItems[this._currentWorkspace].setOrnament(PopupMenu.Ornament.DOT);

        this._statusLabel.set_text(this._labelText());
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
