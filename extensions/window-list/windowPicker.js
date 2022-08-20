/* exported WindowPicker, WindowPickerToggle */
const {Clutter, GObject, Shell, St} = imports.gi;

const Layout = imports.ui.layout;
const Main = imports.ui.main;
const {WorkspacesDisplay} = imports.ui.workspacesView;
const Workspace = imports.ui.workspace;

const {VIGNETTE_BRIGHTNESS} = imports.ui.lightbox;
const {
    SIDE_CONTROLS_ANIMATION_TIME,
    OverviewAdjustment,
    ControlsState,
} = imports.ui.overviewControls;

class MyWorkspacesDisplay extends WorkspacesDisplay {
    static {
        GObject.registerClass(this);
    }

    constructor(controls, overviewAdjustment) {
        let workspaceManager = global.workspace_manager;

        const workspaceAdjustment = new St.Adjustment({
            value: workspaceManager.get_active_workspace_index(),
            lower: 0,
            page_increment: 1,
            page_size: 1,
            step_increment: 0,
            upper: workspaceManager.n_workspaces,
        });

        super(controls, workspaceAdjustment, overviewAdjustment);

        this._workspaceAdjustment = workspaceAdjustment;
        this._workspaceAdjustment.actor = this;

        this._nWorkspacesChangedId =
            workspaceManager.connect('notify::n-workspaces',
                this._updateAdjustment.bind(this));

        this.add_constraint(
            new Layout.MonitorConstraint({
                primary: true,
                work_area: true,
            }));
    }

    prepareToEnterOverview(...args) {
        if (!this._scrollEventId) {
            this._scrollEventId = Main.windowPicker.connect('scroll-event',
                this._onScrollEvent.bind(this));
        }

        super.prepareToEnterOverview(...args);
    }

    vfunc_hide(...args) {
        if (this._scrollEventId > 0)
            Main.windowPicker.disconnect(this._scrollEventId);
        this._scrollEventId = 0;

        super.vfunc_hide(...args);
    }

    _updateAdjustment() {
        let workspaceManager = global.workspace_manager;
        this._workspaceAdjustment.set({
            upper: workspaceManager.n_workspaces,
            value: workspaceManager.get_active_workspace_index(),
        });
    }

    _onDestroy() {
        if (this._nWorkspacesChangedId)
            global.workspace_manager.disconnect(this._nWorkspacesChangedId);
        this._nWorkspacesChangedId = 0;

        super._onDestroy();
    }
}

class MyWorkspace extends Workspace.Workspace {
    static {
        GObject.registerClass(this);
    }

    constructor(...args) {
        super(...args);

        this._adjChangedId =
            this._overviewAdjustment.connect('notify::value', () => {
                const {value: progress} = this._overviewAdjustment;
                const brightness = 1 - (1 - VIGNETTE_BRIGHTNESS) * progress;
                for (const bg of this._background?._backgroundGroup ?? []) {
                    bg.content.set({
                        vignette: true,
                        brightness,
                    });
                }
            });
    }

    _onDestroy() {
        super._onDestroy();

        if (this._adjChangedId)
            this._overviewAdjustment.disconnect(this._adjChangedId);
        this._adjChangedId = 0;
    }
}

class MyWorkspaceBackground extends Workspace.WorkspaceBackground {
    static {
        GObject.registerClass(this);
    }

    _updateBorderRadius() {
    }

    vfunc_allocate(box) {
        this.set_allocation(box);

        const themeNode = this.get_theme_node();
        const contentBox = themeNode.get_content_box(box);

        this._bin.allocate(contentBox);

        const [contentWidth, contentHeight] = contentBox.get_size();
        const monitor = Main.layoutManager.monitors[this._monitorIndex];
        const xRatio = contentWidth / this._workarea.width;
        const yRatio = contentHeight / this._workarea.height;

        const right = area => area.x + area.width;
        const bottom = area => area.y + area.height;

        const offsets = {
            left: xRatio * (this._workarea.x - monitor.x),
            right: xRatio * (right(monitor) - right(this._workarea)),
            top: yRatio * (this._workarea.y - monitor.y),
            bottom: yRatio * (bottom(monitor) - bottom(this._workarea)),
        };

        contentBox.set_origin(-offsets.left, -offsets.top);
        contentBox.set_size(
            offsets.left + contentWidth + offsets.right,
            offsets.top + contentHeight + offsets.bottom);
        this._backgroundGroup.allocate(contentBox);
    }
}

var WindowPicker = class WindowPicker extends Clutter.Actor {
    static [GObject.signals] = {
        'open-state-changed': {param_types: [GObject.TYPE_BOOLEAN]},
    };

    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({reactive: true});

        this._visible = false;
        this._modal = false;

        this._overlayKeyId = 0;
        this._stageKeyPressId = 0;

        this._adjustment = new OverviewAdjustment(this);

        this.connect('destroy', this._onDestroy.bind(this));

        global.bind_property('screen-width',
            this, 'width',
            GObject.BindingFlags.SYNC_CREATE);
        global.bind_property('screen-height',
            this, 'height',
            GObject.BindingFlags.SYNC_CREATE);

        this._workspacesDisplay = new MyWorkspacesDisplay(this, this._adjustment);
        this.add_child(this._workspacesDisplay);

        Main.uiGroup.insert_child_below(this, global.window_group);

        if (!Main.sessionMode.hasOverview) {
            this._injectBackgroundShade();

            this._overlayKeyId = global.display.connect('overlay-key', () => {
                if (!this._visible)
                    this.open();
                else
                    this.close();
            });
        }
    }

    _injectBackgroundShade() {
        this._origWorkspace = Workspace.Workspace;
        this._origWorkspaceBackground = Workspace.WorkspaceBackground;

        Workspace.Workspace = MyWorkspace;
        Workspace.WorkspaceBackground = MyWorkspaceBackground;
    }

    get visible() {
        return this._visible;
    }

    open() {
        if (this._visible)
            return;

        this._visible = true;

        if (!this._syncGrab())
            return;

        this._fakeOverviewVisible(true);
        this._workspacesDisplay.prepareToEnterOverview();
        Main.overview._animationInProgress = true;

        this._adjustment.value = ControlsState.HIDDEN;
        this._adjustment.ease(ControlsState.WINDOW_PICKER, {
            duration: SIDE_CONTROLS_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => (Main.overview._animationInProgress = false),
        });

        this._stageKeyPressId = global.stage.connect('key-press-event',
            (a, event) => {
                let sym = event.get_key_symbol();
                if (sym === Clutter.KEY_Escape) {
                    this.close();
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });

        this.emit('open-state-changed', this._visible);
    }

    close() {
        if (!this._visible)
            return;

        this._visible = false;

        if (!this._syncGrab())
            return;

        this._workspacesDisplay.prepareToLeaveOverview();

        Main.overview._animationInProgress = true;
        this._adjustment.ease(ControlsState.HIDDEN, {
            duration: SIDE_CONTROLS_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                Main.overview._animationInProgress = false;
                this._workspacesDisplay.hide();
                this._fakeOverviewVisible(false);
            },
        });

        global.stage.disconnect(this._stageKeyPressId);
        this._stageKeyPressId = 0;

        this.emit('open-state-changed', this._visible);
    }

    getWorkspacesBoxForState() {
        return this.allocation;
    }

    _fakeOverviewVisible(visible) {
        // Fake overview state for WorkspacesDisplay
        Main.overview._visible = visible;

        // Hide real windows
        Main.layoutManager._inOverview = visible;
        Main.layoutManager._updateVisibility();
    }

    _syncGrab() {
        if (this._visible) {
            if (this._modal)
                return true;

            const grab = Main.pushModal(global.stage, {
                actionMode: Shell.ActionMode.OVERVIEW,
            });
            if (grab.get_seat_state() !== Clutter.GrabState.NONE) {
                this._grab = grab;
                this._modal = true;
            } else {
                Main.popModal(grab);
                this.hide();
                return false;
            }
        } else if (this._modal) {
            Main.popModal(this._grab);
            this._modal = false;
            this._grab = null;
        }
        return true;
    }

    _onDestroy() {
        if (this._origWorkspace)
            Workspace.Workspace = this._origWorkspace;

        if (this._origWorkspaceBackground)
            Workspace.WorkspaceBackground = this._origWorkspaceBackground;

        if (this._monitorsChangedId)
            Main.layoutManager.disconnect(this._monitorsChangedId);
        this._monitorsChangedId = 0;

        if (this._overlayKeyId)
            global.display.disconnect(this._overlayKeyId);
        this._overlayKeyId = 0;

        if (this._stageKeyPressId)
            global.stage.disconnect(this._stageKeyPressId);
        this._stageKeyPressId = 0;
    }
};

var WindowPickerToggle = class WindowPickerToggle extends St.Button {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        let iconBin = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
        });
        iconBin.add_child(new St.Icon({
            icon_name: 'focus-windows-symbolic',
            icon_size: 16,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        super({
            style_class: 'window-picker-toggle',
            child: iconBin,
            visible: !Main.sessionMode.hasOverview,
            toggle_mode: true,
        });

        this.connect('notify::checked', () => {
            if (this.checked)
                Main.windowPicker.open();
            else
                Main.windowPicker.close();
        });

        Main.windowPicker.connect('open-state-changed', () => {
            this.checked = Main.windowPicker.visible;
        });
    }
};
