/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */
/* exported init */
const {Clutter, Graphene, GObject, St} = imports.gi;

const Main = imports.ui.main;
const OverviewControls = imports.ui.overviewControls;
const Workspace = imports.ui.workspace;
const WorkspacesView = imports.ui.workspacesView;

const WINDOW_SLOT = 4;

class MyWorkspace extends Workspace.Workspace {
    static {
        GObject.registerClass(this);
    }

    constructor(...args) {
        super(...args);

        if (this.metaWorkspace && this.metaWorkspace.index() < 9) {
            this._tip = new St.Label({
                style_class: 'extension-windowsNavigator-window-tooltip',
                visible: false,
            });
            this.add_actor(this._tip);

            this.connect('notify::scale-x', () => {
                this._tip.set_scale(1 / this.scale_x, 1 / this.scale_x);
            });
        } else {
            this._tip = null;
        }
    }

    vfunc_allocate(box) {
        super.vfunc_allocate(box);

        if (this._tip)
            this._tip.allocate_preferred_size(0, 0);
    }

    showTooltip() {
        if (!this._tip)
            return;
        this._tip.text = (this.metaWorkspace.index() + 1).toString();
        this._tip.show();
        this.set_child_below_sibling(this._tip, null);
    }

    hideTooltip() {
        if (this._tip)
            this._tip.hide();
    }

    getWindowWithTooltip(id) {
        const {layoutManager} = this._container;
        const slot = layoutManager._windowSlots[id - 1];
        return slot ? slot[WINDOW_SLOT].metaWindow : null;
    }

    showWindowsTooltips() {
        const {layoutManager} = this._container;
        for (let i = 0; i < layoutManager._windowSlots.length; i++) {
            if (layoutManager._windowSlots[i])
                layoutManager._windowSlots[i][WINDOW_SLOT].showTooltip(`${i + 1}`);
        }
    }

    hideWindowsTooltips() {
        const {layoutManager} = this._container;
        for (let i in layoutManager._windowSlots) {
            if (layoutManager._windowSlots[i])
                layoutManager._windowSlots[i][WINDOW_SLOT].hideTooltip();
        }
    }

    // overriding _addWindowClone to apply the tooltip patch on the cloned
    // windowPreview
    _addWindowClone(metaWindow) {
        const clone = super._addWindowClone(metaWindow);

        // appling the tooltip patch
        (function patchPreview() {
            this._text = new St.Label({
                style_class: 'extension-windowsNavigator-window-tooltip',
                visible: false,
            });

            this._text.add_constraint(new Clutter.BindConstraint({
                source: this.windowContainer,
                coordinate: Clutter.BindCoordinate.POSITION,
            }));
            this._text.add_constraint(new Clutter.AlignConstraint({
                source: this.windowContainer,
                align_axis: Clutter.AlignAxis.X_AXIS,
                pivot_point: new Graphene.Point({x: 0.5, y: -1}),
                factor: this._closeButtonSide === St.Side.LEFT ? 1 : 0,
            }));
            this._text.add_constraint(new Clutter.AlignConstraint({
                source: this.windowContainer,
                align_axis: Clutter.AlignAxis.Y_AXIS,
                pivot_point: new Graphene.Point({x: -1, y: 0.5}),
                factor: 0,
            }));

            this.add_child(this._text);
        }).call(clone);

        clone.showTooltip = function (text) {
            this._text.set({text});
            this._text.show();
        };

        clone.hideTooltip = function () {
            if (this._text && this._text.visible)
                this._text.hide();
        };

        return clone;
    }
}

class MyWorkspacesView extends WorkspacesView.WorkspacesView {
    static {
        GObject.registerClass(this);
    }

    constructor(...args) {
        super(...args);

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
        if (global.stage.get_key_focus() === global.stage)
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
            (o.get_key_symbol() === Clutter.KEY_Alt_L ||
             o.get_key_symbol() === Clutter.KEY_Alt_R))
            this._hideTooltips();
        if (this._pickWorkspace &&
            (o.get_key_symbol() === Clutter.KEY_Control_L ||
             o.get_key_symbol() === Clutter.KEY_Control_R))
            this._hideWorkspacesTooltips();
    }

    _onKeyPress(s, o) {
        const {ControlsState} = OverviewControls;
        if (this._overviewAdjustment.value !== ControlsState.WINDOW_PICKER)
            return false;

        let workspaceManager = global.workspace_manager;

        if ((o.get_key_symbol() === Clutter.KEY_Alt_L ||
             o.get_key_symbol() === Clutter.KEY_Alt_R) &&
            !this._pickWorkspace) {
            this._prevFocusActor = global.stage.get_key_focus();
            global.stage.set_key_focus(null);
            this._active = workspaceManager.get_active_workspace_index();
            this._pickWindow = true;
            this._workspaces[workspaceManager.get_active_workspace_index()].showWindowsTooltips();
            return true;
        }
        if ((o.get_key_symbol() === Clutter.KEY_Control_L ||
             o.get_key_symbol() === Clutter.KEY_Control_R) &&
            !this._pickWindow) {
            this._prevFocusActor = global.stage.get_key_focus();
            global.stage.set_key_focus(null);
            this._pickWorkspace = true;
            for (let i = 0; i < this._workspaces.length; i++)
                this._workspaces[i].showTooltip();
            return true;
        }

        if (global.stage.get_key_focus() !== global.stage)
            return false;

        // ignore shift presses, they're required to get numerals in azerty keyboards
        if ((this._pickWindow || this._pickWorkspace) &&
            (o.get_key_symbol() === Clutter.KEY_Shift_L ||
             o.get_key_symbol() === Clutter.KEY_Shift_R))
            return true;

        if (this._pickWindow) {
            if (this._active !== workspaceManager.get_active_workspace_index()) {
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
}

class Extension {
    constructor() {
        this._origWorkspace = Workspace.Workspace;
        this._origWorkspacesView = WorkspacesView.WorkspacesView;
    }

    enable() {
        Workspace.Workspace = MyWorkspace;
        WorkspacesView.WorkspacesView = MyWorkspacesView;
    }

    disable() {
        Workspace.Workspace = this._origWorkspace;
        WorkspacesView.WorkspacesView = this._origWorkspacesView;
    }
}

/**
 * @returns {Extension} - the extension's state object
 */
function init() {
    return new Extension();
}
