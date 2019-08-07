/* exported WindowPicker, WindowPickerToggle */
const { Clutter, GLib, GObject, Meta, Shell, St } = imports.gi;

const Layout = imports.ui.layout;
const Main = imports.ui.main;
const Overview = imports.ui.overview;
const { WorkspacesDisplay } = imports.ui.workspacesView;

let MyWorkspacesDisplay = class extends WorkspacesDisplay {
    constructor() {
        super();

        this.actor.add_constraint(
            new Layout.MonitorConstraint({
                primary: true,
                work_area: true,
            }));

        this.actor.connect('destroy', this._onDestroy.bind(this));

        this._workareasChangedId = global.display.connect('workareas-changed',
            this._onWorkAreasChanged.bind(this));
        this._onWorkAreasChanged();
    }

    show(...args) {
        if (!this._scrollEventId) {
            this._scrollEventId = Main.windowPicker.connect('scroll-event',
                this._onScrollEvent.bind(this));
        }

        super.show(...args);
    }

    hide(...args) {
        if (this._scrollEventId > 0)
            Main.windowPicker.disconnect(this._scrollEventId);
        this._scrollEventId = 0;

        super.hide(...args);
    }

    _onWorkAreasChanged() {
        let { primaryIndex } = Main.layoutManager;
        let workarea = Main.layoutManager.getWorkAreaForMonitor(primaryIndex);
        this.setWorkspacesFullGeometry(workarea);
    }

    _updateWorkspacesViews() {
        super._updateWorkspacesViews();

        this._workspacesViews.forEach(v => {
            Main.layoutManager.overviewGroup.remove_actor(v.actor);
            Main.windowPicker.add_actor(v.actor);
        });
    }

    _onDestroy() {
        if (this._workareasChangedId)
            global.display.disconnect(this._workareasChangedId);
        this._workareasChangedId = 0;
    }
};

var WindowPicker = GObject.registerClass({
    GTypeName: 'WindowListWindowPicker',
    Signals: {
        'open-state-changed': { param_types: [GObject.TYPE_BOOLEAN] },
    },
}, class extends Clutter.Actor {
    _init() {
        this._visible = false;
        this._modal = false;

        this._overlayKeyId = 0;
        this._stageKeyPressId = 0;

        super._init();

        this.connect('destroy', this._onDestroy.bind(this));

        global.bind_property('screen-width',
            this, 'width',
            GObject.BindingFlags.SYNC_CREATE);
        global.bind_property('screen-height',
            this, 'height',
            GObject.BindingFlags.SYNC_CREATE);

        this._backgroundGroup = new Meta.BackgroundGroup({ reactive: true });
        this.add_child(this._backgroundGroup);

        this._backgroundGroup.connect('scroll-event', (a, ev) => {
            this.emit('scroll-event', ev);
        });

        // Trick WorkspacesDisplay constructor into adding actions here
        let addActionOrig = Main.overview.addAction;
        Main.overview.addAction = a => this._backgroundGroup.add_action(a);

        this._workspacesDisplay = new MyWorkspacesDisplay();
        this.add_child(this._workspacesDisplay.actor);

        Main.overview.addAction = addActionOrig;

        this._bgManagers = [];

        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed',
            this._updateBackgrounds.bind(this));
        this._updateBackgrounds();

        Main.uiGroup.insert_child_below(this, global.window_group);

        if (!Main.sessionMode.hasOverview) {
            this._overlayKeyId = global.display.connect('overlay-key', () => {
                if (!this._visible)
                    this.open();
                else
                    this.close();
            });
        }
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
        this._shadeBackgrounds();
        this._fakeOverviewAnimation();
        this._workspacesDisplay.show(false);

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

        this._workspacesDisplay.animateFromOverview(false);
        this._unshadeBackgrounds();
        this._fakeOverviewAnimation(() => {
            this._workspacesDisplay.hide();
            this._fakeOverviewVisible(false);
        });

        global.stage.disconnect(this._stageKeyPressId);
        this._stageKeyPressId = 0;

        this.emit('open-state-changed', this._visible);
    }

    _fakeOverviewAnimation(onComplete) {
        Main.overview.animationInProgress = true;
        GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            Overview.ANIMATION_TIME,
            () => {
                Main.overview.animationInProgress = false;
                if (onComplete)
                    onComplete();
            });
    }

    _fakeOverviewVisible(visible) {
        // Fake overview state for WorkspacesDisplay
        Main.overview.visible = visible;

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

    _updateBackgrounds() {
        Main.overview._updateBackgrounds.call(this);
    }

    _shadeBackgrounds() {
        Main.overview._shadeBackgrounds.call(this);
    }

    _unshadeBackgrounds() {
        Main.overview._unshadeBackgrounds.call(this);
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
            x_fill: true,
            y_fill: true,
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
