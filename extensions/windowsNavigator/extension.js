/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */
const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const St = imports.gi.St;

const Main = imports.ui.main;
const Workspace = imports.ui.workspace;
const WorkspacesView = imports.ui.workspacesView;

function injectToFunction(parent, name, func) {
    let origin = parent[name];
    parent[name] = function() {
        let ret;
        ret = origin.apply(this, arguments);
        if (ret === undefined)
            ret = func.apply(this, arguments);
        return ret;
    }
}

function main() {
    Workspace.WindowOverlay.prototype.setId = function(id) {
        if (this._text.visible && id == null)
            this._text.hide();
        this._id = id;
        if (id != null)
            this._text.text = this._id.toString();
    }
    Workspace.WindowOverlay.prototype.getId = function() {
        return this._id;
    }
    Workspace.WindowOverlay.prototype.showTooltip = function() {
        if (this._id === null)
            return;
        this._text.raise_top();
        this._text.show();
        this._text.text = this._id.toString();
    }
    Workspace.WindowOverlay.prototype.hideTooltip = function() {
        if (this._text.visible)
            this._text.hide();
    }

    Workspace.Workspace.prototype.showTooltip = function() {
        if (this._tip == null)
            return;
        this._tip.text = (this.metaWorkspace.index() + 1).toString();
        this._tip.x = this._x;
        this._tip.y = this._y;
        this._tip.show();
        this._tip.raise_top();
    }
    Workspace.Workspace.prototype.hideTooltip = function() {
        if (this._tip == null)
            return;
        if (!this._tip.get_parent())
            return;
        this._tip.hide();
    }
    Workspace.Workspace.prototype.getWindowWithTooltip = function(id) {
        for (let i in this._windowOverlays) {
            if (this._windowOverlays[i] == null)
                continue;
            if (this._windowOverlays[i].getId() === id)
                return this._windowOverlays[i]._windowClone.metaWindow;
        }
        return null;
    }
    Workspace.Workspace.prototype.showWindowsTooltips = function() {
        for (let i in this._windowOverlays) {
            if (this._windowOverlays[i] != null)
                this._windowOverlays[i].showTooltip();
        }
    }
    Workspace.Workspace.prototype.hideWindowsTooltips = function() {
        for (let i in this._windowOverlays) {
            if (this._windowOverlays[i] != null)
                this._windowOverlays[i].hideTooltip();
        }
    }

    WorkspacesView.WorkspacesView.prototype._hideTooltips = function() {
        if (global.stage.get_key_focus() == global.stage)
            global.stage.set_key_focus(this._prevFocusActor);
        this._pickWindow = false;
        for (let i = 0; i < this._workspaces.length; i++)
            this._workspaces[i].hideWindowsTooltips();
    }

    WorkspacesView.WorkspacesView.prototype._hideWorkspacesTooltips = function() {
        global.stage.set_key_focus(this._prevFocusActor);
        this._pickWorkspace = false;
        for (let i = 0; i < this._workspaces.length; i++)
            this._workspaces[i].hideTooltip();
    }

    WorkspacesView.WorkspacesView.prototype._onKeyRelease = function(s, o) {
        if (this._pickWindow && o.get_key_symbol() == Clutter.Alt_L)
            this._hideTooltips();
        if (this._pickWorkspace && o.get_key_symbol() == Clutter.Control_L)
            this._hideWorkspacesTooltips();
    }
    WorkspacesView.WorkspacesView.prototype._onKeyPress = function(s, o) {
        if (o.get_key_symbol() == Clutter.Alt_L && !this._pickWorkspace) {
            this._prevFocusActor = global.stage.get_key_focus();
            global.stage.set_key_focus(null);
            this._active = global.screen.get_active_workspace_index();
            this._pickWindow = true;
            this._workspaces[global.screen.get_active_workspace_index()].showWindowsTooltips();
            return true;
        }
        if (o.get_key_symbol() == Clutter.Control_L && !this._pickWindow) {
            this._prevFocusActor = global.stage.get_key_focus();
            global.stage.set_key_focus(null);
            this._pickWorkspace = true;
            for (let i = 0; i < this._workspaces.length; i++)
                this._workspaces[i].showTooltip();
            return true;
        }

        if (global.stage.get_key_focus() != global.stage)
            return false;

        if (this._pickWindow) {
            if (this._active != global.screen.get_active_workspace_index()) {
                this._hideTooltips();
                return false;
            }
            let c = o.get_key_unicode();
            if (c > '9'.charCodeAt(0) || c < '0'.charCodeAt(0)) {
                this._hideTooltips();
                return false;
            }
            let win = this._workspaces[this._active].getWindowWithTooltip(c - '0'.charCodeAt(0));
            this._hideTooltips();
            if (win)
                Main.activateWindow(win, global.get_current_time());
            return true;
        }
        if (this._pickWorkspace) {
            let c = o.get_key_unicode();
            if (c > '9'.charCodeAt(0) || c < '0'.charCodeAt(0)) {
                this._hideWorkspacesTooltips();
                return false;
            }
            let workspace = this._workspaces[c - '0'.charCodeAt(0) - 1];
            if (workspace !== undefined)
                workspace.metaWorkspace.activate(global.get_current_time());
            this._hideWorkspacesTooltips();
            return true;
        }
        return false;
    }

    injectToFunction(Workspace.WindowOverlay.prototype, '_init', function(windowClone, parentActor) {
        this._id = null;
        this._text = new St.Label({ style_class: 'extension-windowsNavigator-window-tooltip' });
        this._text.hide();
        parentActor.add_actor(this._text);
    });
    injectToFunction(Workspace.WindowOverlay.prototype, 'updatePositions', function(cloneX, cloneY, cloneWidth, cloneHeight) {
        let textX = cloneX - 2;
        let textY = cloneY - 2;
        this._text.set_position(Math.floor(textX), Math.floor(textY));
        this._text.raise_top();
    });
    injectToFunction(Workspace.Workspace.prototype, '_init', function(metaWorkspace) {
        if (metaWorkspace && metaWorkspace.index() < 9) {
            this._tip = new St.Label({ style_class: 'extension-windowsNavigator-window-tooltip',
                                       visible: false });

            this.actor.add_actor(this._tip);
            this.actor.connect('notify::scale-x', Lang.bind(this, function() {
                this._tip.set_scale(1 / this.actor.scale_x, 1 / this.actor.scale_x);
            }));
        } else
            this._tip = null;
    });
    injectToFunction(Workspace.Workspace.prototype, 'positionWindows', function(flags) {
        let visibleClones = this._windows.slice();
        if (this._reservedSlot)
            visibleClones.push(this._reservedSlot);

        let slots = this._computeAllWindowSlots(visibleClones.length);
        visibleClones = this._orderWindowsByMotionAndStartup(visibleClones, slots);
        for (let i = 0; i < visibleClones.length; i++) {
            let clone = visibleClones[i];
            let metaWindow = clone.metaWindow;
            let mainIndex = this._lookupIndex(metaWindow);
            let overlay = this._windowOverlays[mainIndex];
            if (overlay)
                overlay.setId(i < 9 ? i + 1 : null);
        }
    });

    injectToFunction(WorkspacesView.WorkspacesView.prototype, '_init', function(width, height, x, y, workspaces) {
        this._pickWorkspace = false;
        this._pickWindow = false;
        this._keyPressEventId = global.stage.connect('key-press-event', Lang.bind(this, this._onKeyPress));
        this._keyReleaseEventId = global.stage.connect('key-release-event', Lang.bind(this, this._onKeyRelease));
    });
    injectToFunction(WorkspacesView.WorkspacesView.prototype, '_onDestroy', function() {
        global.stage.disconnect(this._keyPressEventId);
        global.stage.disconnect(this._keyReleaseEventId);
    });
}
