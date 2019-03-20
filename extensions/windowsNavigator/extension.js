/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */
/* exported init */
const { Clutter, St } = imports.gi;

const Main = imports.ui.main;
const Workspace = imports.ui.workspace;
const WorkspacesView = imports.ui.workspacesView;

var MyWindowOverlay = class extends Workspace.WindowOverlay {
    constructor(windowClone, parentActor) {
        super(windowClone, parentActor);

        this._id = null;
        this._text = new St.Label({
            style_class: 'extension-windowsNavigator-window-tooltip',
            visible: false
        });
        parentActor.add_actor(this._text);
    }

    showTooltip() {
        this._text.raise_top();
        this._text.show();
        this._text.text = (this._windowClone.slotId + 1).toString();
    }

    hideTooltip() {
        if (this._text && this._text.visible)
            this._text.hide();
    }

    relayout(animate) {
        super.relayout(animate);

        let [cloneX, cloneY, cloneWidth_, cloneHeight_] = this._windowClone.slot;

        let textX = cloneX - 2;
        let textY = cloneY - 2;
        this._text.set_position(Math.floor(textX) + 5, Math.floor(textY) + 5);
        this._text.raise_top();
    }
};

var MyWorkspace = class extends Workspace.Workspace {
    constructor(metaWorkspace, monitorIndex) {
        super(metaWorkspace, monitorIndex);

        if (metaWorkspace && metaWorkspace.index() < 9) {
            this._tip = new St.Label({
                style_class: 'extension-windowsNavigator-window-tooltip',
                visible: false
            });
            this.actor.add_actor(this._tip);

            this.actor.connect('notify::scale-x', () => {
                this._tip.set_scale(1 / this.actor.scale_x, 1 / this.actor.scale_x);
            });
        } else
            this._tip = null;
    }

    showTooltip() {
        if (this._tip == null || this._actualGeometry == null)
            return;
        this._tip.text = (this.metaWorkspace.index() + 1).toString();

        // Hand code this instead of using _getSpacingAndPadding
        // because that fails on empty workspaces
        let node = this.actor.get_theme_node();
        let padding = {
            left: node.get_padding(St.Side.LEFT),
            top: node.get_padding(St.Side.TOP),
            bottom: node.get_padding(St.Side.BOTTOM),
            right: node.get_padding(St.Side.RIGHT),
        };

        let area = Workspace.padArea(this._actualGeometry, padding);
        this._tip.x = area.x;
        this._tip.y = area.y;
        this._tip.show();
        this._tip.raise_top();
    }

    hideTooltip() {
        if (this._tip == null)
            return;
        if (!this._tip.get_parent())
            return;
        this._tip.hide();
    }

    getWindowWithTooltip(id) {
        for (let i = 0; i < this._windows.length; i++) {
            if ((this._windows[i].slotId + 1) == id)
                return this._windows[i].metaWindow;
        }
        return null;
    }

    showWindowsTooltips() {
        for (let i in this._windowOverlays) {
            if (this._windowOverlays[i] != null)
                this._windowOverlays[i].showTooltip();
        }
    }

    hideWindowsTooltips() {
        for (let i in this._windowOverlays) {
            if (this._windowOverlays[i] != null)
                this._windowOverlays[i].hideTooltip();
        }
    }
};

var MyWorkspacesView = class extends WorkspacesView.WorkspacesView {
    constructor(width, height, x, y, workspaces) {
        super(width, height, x, y, workspaces);

        this._pickWorkspace = false;
        this._pickWindow = false;
        this._keyPressEventId =
            global.stage.connect('key-press-event', this._onKeyPress.bind(this));
        this._keyReleaseEventId =
            global.stage.connect('key-release-event', this._onKeyRelease.bind(this));
    }

    _onDestroy() {
        super._onDestroy();

        global.stage.disconnect(this._keyPressEventId);
        global.stage.disconnect(this._keyReleaseEventId);
    }

    _hideTooltips() {
        if (global.stage.get_key_focus() == global.stage)
            global.stage.set_key_focus(this._prevFocusActor);
        this._pickWindow = false;
        for (let i = 0; i < this._workspaces.length; i++)
            this._workspaces[i].hideWindowsTooltips();
    }

    _hideWorkspacesTooltips() {
        global.stage.set_key_focus(this._prevFocusActor);
        this._pickWorkspace = false;
        for (let i = 0; i < this._workspaces.length; i++)
            this._workspaces[i].hideTooltip();
    }

    _onKeyRelease(s, o) {
        if (this._pickWindow &&
            (o.get_key_symbol() == Clutter.KEY_Alt_L ||
             o.get_key_symbol() == Clutter.KEY_Alt_R))
            this._hideTooltips();
        if (this._pickWorkspace &&
            (o.get_key_symbol() == Clutter.KEY_Control_L ||
             o.get_key_symbol() == Clutter.KEY_Control_R))
            this._hideWorkspacesTooltips();
    }

    _onKeyPress(s, o) {
        let viewSelector = Main.overview.viewSelector;
        if (viewSelector._activePage != viewSelector._workspacesPage)
            return false;

        let workspaceManager = global.workspace_manager;

        if ((o.get_key_symbol() == Clutter.KEY_Alt_L ||
             o.get_key_symbol() == Clutter.KEY_Alt_R)
            && !this._pickWorkspace) {
            this._prevFocusActor = global.stage.get_key_focus();
            global.stage.set_key_focus(null);
            this._active = workspaceManager.get_active_workspace_index();
            this._pickWindow = true;
            this._workspaces[workspaceManager.get_active_workspace_index()].showWindowsTooltips();
            return true;
        }
        if ((o.get_key_symbol() == Clutter.KEY_Control_L ||
             o.get_key_symbol() == Clutter.KEY_Control_R)
            && !this._pickWindow) {
            this._prevFocusActor = global.stage.get_key_focus();
            global.stage.set_key_focus(null);
            this._pickWorkspace = true;
            for (let i = 0; i < this._workspaces.length; i++)
                this._workspaces[i].showTooltip();
            return true;
        }

        if (global.stage.get_key_focus() != global.stage)
            return false;

        // ignore shift presses, they're required to get numerals in azerty keyboards
        if ((this._pickWindow || this._pickWorkspace) &&
            (o.get_key_symbol() == Clutter.KEY_Shift_L ||
             o.get_key_symbol() == Clutter.KEY_Shift_R))
            return true;

        if (this._pickWindow) {
            if (this._active != workspaceManager.get_active_workspace_index()) {
                this._hideTooltips();
                return false;
            }

            let c = o.get_key_symbol() - Clutter.KEY_KP_0;
            if (c > 9 || c <= 0) {
                c = o.get_key_symbol() - Clutter.KEY_0;
                if (c > 9 || c <= 0) {
                    this._hideTooltips();
                    global.log(c);
                    return false;
                }
            }

            let win = this._workspaces[this._active].getWindowWithTooltip(c);
            this._hideTooltips();

            if (win)
                Main.activateWindow(win, global.get_current_time());

            return true;
        }
        if (this._pickWorkspace) {
            let c = o.get_key_symbol() - Clutter.KEY_KP_0;
            if (c > 9 || c <= 0) {
                c = o.get_key_symbol() - Clutter.KEY_0;
                if (c > 9 || c <= 0) {
                    this._hideWorkspacesTooltips();
                    return false;
                }
            }

            let workspace = this._workspaces[c - 1];
            if (workspace !== undefined)
                workspace.metaWorkspace.activate(global.get_current_time());

            this._hideWorkspacesTooltips();
            return true;
        }
        return false;
    }
};

class Extension {
    constructor() {
        this._origWindowOverlay = Workspace.WindowOverlay;
        this._origWorkspace = Workspace.Workspace;
        this._origWorkspacesView = WorkspacesView.WorkspacesView;
    }

    enable() {
        Workspace.WindowOverlay = MyWindowOverlay;
        Workspace.Workspace = MyWorkspace;
        WorkspacesView.WorkspacesView = MyWorkspacesView;
    }

    disable() {
        Workspace.WindowOverlay = this._origWindowOverlay;
        Workspace.Workspace = this._origWorkspace;
        WorkspacesView.WorkspacesView = this._origWorkspacesView;
    }
}

function init() {
    return new Extension();
}
