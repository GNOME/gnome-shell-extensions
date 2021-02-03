/* exported WindowPicker, WindowPickerToggle */
const { Clutter, GObject, Shell, St } = imports.gi;

const Layout = imports.ui.layout;
const Main = imports.ui.main;
const { WorkspacesDisplay } = imports.ui.workspacesView;
const { Workspace } = imports.ui.workspace;

const { VIGNETTE_BRIGHTNESS } = imports.ui.lightbox;
const {
    SIDE_CONTROLS_ANIMATION_TIME,
    OverviewAdjustment,
    ControlsState,
} = imports.ui.overviewControls;

let MyWorkspacesDisplay = GObject.registerClass(
class MyWorkspacesDisplay extends WorkspacesDisplay {
    _init(controls, overviewAdjustment) {
        let workspaceManager = global.workspace_manager;

        this._overviewAdjustment = overviewAdjustment;
        this._workspaceAdjustment = new St.Adjustment({
            value: workspaceManager.get_active_workspace_index(),
            lower: 0,
            page_increment: 1,
            page_size: 1,
            step_increment: 0,
            upper: workspaceManager.n_workspaces,
        });

        this._nWorkspacesChangedId =
            workspaceManager.connect('notify::n-workspaces',
                this._updateAdjustment.bind(this));

        super._init(controls, this._workspaceAdjustment, this._overviewAdjustment);

        this._workspaceAdjustment.actor = this;

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
});

var WindowPicker = GObject.registerClass({
    Signals: {
        'open-state-changed': { param_types: [GObject.TYPE_BOOLEAN] },
    },
}, class extends Clutter.Actor {
    _init() {
        this._visible = false;
        this._modal = false;

        this._overlayKeyId = 0;
        this._stageKeyPressId = 0;

        super._init({ reactive: true });

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
        const adjustment = this._adjustment;
        const { _init, _onDestroy } = Workspace.prototype;

        Workspace.prototype._init = function (...args) {
            _init.call(this, ...args);

            this._adjChangedId = adjustment.connect('notify::value', () => {
                const { value: progress } = adjustment;
                const brightness = 1 - (1 - VIGNETTE_BRIGHTNESS) * progress;
                for (const bg of this._background?._backgroundGroup ?? []) {
                    bg.content.set({
                        vignette: true,
                        brightness,
                    });
                }
            });
        };
        Workspace.prototype._onDestroy = function () {
            _onDestroy.call(this);

            if (this._adjChangedId)
                adjustment.disconnect(this._adjChangedId);
            this._adjChangedId = 0;
        };

        this._wsInit = _init;
        this._wsDestroy = _onDestroy;
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

            this._modal = Main.pushModal(this, {
                actionMode: Shell.ActionMode.OVERVIEW,
            });

            if (!this._modal) {
                this.hide();
                return false;
            }
        } else if (this._modal) {
            Main.popModal(this);
            this._modal = false;
        }
        return true;
    }

    _onDestroy() {
        if (this._wsInit)
            Workspace.prototype._init = this._wsInit;
        if (this._wsDestroy)
            Workspace.prototype._onDestroy = this._wsDestroy;

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
});

var WindowPickerToggle = GObject.registerClass(
class WindowPickerToggle extends St.Button {
    _init() {
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
        super._init({
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
});
