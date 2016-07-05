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
    return origin;
}

let winInjections, workspaceInjections, workBaseInjections, workViewInjections, workDispInjections, createdActors, connectedSignals;

function resetState() {
    winInjections = { };
    workspaceInjections = { };
    workViewInjections = { };
    workBaseInjections = { };
    workDispInjections = { };
    createdActors = [ ];
    connectedSignals = [ ];
}

function enable() {
    resetState();

    Workspace.WindowOverlay.prototype.showTooltip = function(offset) {
        this._text.raise_top();
        this._text.show();
        this._text.text = (this._windowClone.slotId + offset).toString();
    }
    winInjections['showTooltip'] = undefined;

    Workspace.WindowOverlay.prototype.hideTooltip = function() {
        if (this._text && this._text.visible)
            this._text.hide();
    }
    winInjections['hideTooltip'] = undefined;

    Workspace.Workspace.prototype.showTooltip = function() {
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
    workspaceInjections['showTooltip'] = undefined;

    Workspace.Workspace.prototype.hideTooltip = function() {
        if (this._tip == null)
            return;
        if (!this._tip.get_parent())
            return;
        this._tip.hide();
    }
    workspaceInjections['hideTooltip'] = undefined;

    Workspace.Workspace.prototype.showWindowsTooltips = function(offset) {
        for (let i in this._windowOverlays) {
            if (this._windowOverlays[i] != null)
                this._windowOverlays[i].showTooltip(offset);
        }
    }
    workspaceInjections['showWindowsTooltips'] = undefined;

    Workspace.Workspace.prototype.hideWindowsTooltips = function() {
        for (let i in this._windowOverlays) {
            if (this._windowOverlays[i] != null)
                this._windowOverlays[i].hideTooltip();
        }
    }
    workspaceInjections['hideWindowsTooltips'] = undefined;

    WorkspacesView.WorkspacesDisplay.prototype.getWindowWithTooltip = function(id) {
        for (let j = 0; j < this._workspacesViews.length; j++) {
            let workspace = this._workspacesViews[j].getWorkspace(this._active);

            for (let i = 0; i < workspace._windowOverlays.length; i++) {
                if (workspace._windowOverlays[i]._text.text == id.toString())
                    return workspace._windowOverlays[i]._windowClone.metaWindow;
            }
        }

        return null;
    }
    workspaceInjections['getWindowWithTooltip'] = undefined;

    WorkspacesView.WorkspacesViewBase.prototype.getWorkspace = function(active) {
        if (this.hasOwnProperty('_workspace') && active == null)
            return [this._workspace];

        if (this.hasOwnProperty('_workspace') && active !== null)
            return this._workspace;

        if (active == null)
            return this._workspaces;

        return this._workspaces[active];
    }
    workBaseInjections['getWorkspace'] = undefined;

    WorkspacesView.WorkspacesDisplay.prototype._hideTooltips = function() {
        if (global.stage.get_key_focus() == global.stage)
            global.stage.set_key_focus(this._prevFocusActor);
        this._pickWindow = false;

        for (let j = 0; j < this._workspacesViews.length; j++) {
            let workspaces = this._workspacesViews[j].getWorkspace();
            for (let i = 0; i < workspaces.length; i++)
                workspaces[i].hideWindowsTooltips();
        }
    }
    workDispInjections['_hideTooltips'] = undefined;

    WorkspacesView.WorkspacesDisplay.prototype._hideWorkspacesTooltips = function() {
        global.stage.set_key_focus(this._prevFocusActor);
        this._pickWorkspace = false;
        for (let j = 0; j < this._workspacesViews.length; j++) {
            let workspaces = this._workspacesViews[j].getWorkspace();
            for (let i = 0; i < workspaces.length; i++)
                workspaces[i].hideTooltip();
        }
    }
    workDispInjections['_hideWorkspacesTooltips'] = undefined;

    WorkspacesView.WorkspacesDisplay.prototype._onKeyRelease = function(s, o) {
        if (this._pickWindow &&
            (o.get_key_symbol() == Clutter.KEY_Alt_L ||
             o.get_key_symbol() == Clutter.KEY_Alt_R))
            this._hideTooltips();
        if (this._pickWorkspace &&
            (o.get_key_symbol() == Clutter.KEY_Control_L ||
             o.get_key_symbol() == Clutter.KEY_Control_R))
            this._hideWorkspacesTooltips();
    }
    workDispInjections['_onKeyRelease'] = undefined;

    WorkspacesView.WorkspacesDisplay.prototype._setMonitorPositions = function() {
        let monitors = Main.layoutManager.monitors.slice(0);

        monitors = monitors.sort(function(mA, mB) {
            return mA.x - mB.x;
        });

        for (let i = 0; i < monitors.length; i++) {
            this._workspacesViews[monitors[i].index]._monitorPosition = i;
        }
    }
    workDispInjections['_setMonitorPositions'] = undefined;

    WorkspacesView.WorkspacesDisplay.prototype._onKeyPress = function(s, o) {
        if(Main.overview.viewSelector._activePage != Main.overview.viewSelector._workspacesPage)
            return false;

        if ((o.get_key_symbol() == Clutter.KEY_Alt_L ||
             o.get_key_symbol() == Clutter.KEY_Alt_R)
            && !this._pickWorkspace) {
            this._prevFocusActor = global.stage.get_key_focus();
            global.stage.set_key_focus(null);
            this._active = global.screen.get_active_workspace_index();
            this._pickWindow = true;

            let offset = 1;
            for (let i = 0; i < this._workspacesViews.length; i++) {
                let workspacesView, workspace, j = 0;

                do  {
                    workspacesView = this._workspacesViews[j];
                    j++;
                } while (workspacesView._monitorPosition !== i);

                workspace = workspacesView.getWorkspace(global.screen.get_active_workspace_index());

                workspace.showWindowsTooltips(offset);
                offset = offset + workspace._windowOverlays.length;
            }
            return true;
        }
        if ((o.get_key_symbol() == Clutter.KEY_Control_L ||
             o.get_key_symbol() == Clutter.KEY_Control_R)
            && !this._pickWindow) {
            this._prevFocusActor = global.stage.get_key_focus();
            global.stage.set_key_focus(null);
            this._pickWorkspace = true;
            let workspaces = this._workspacesViews[0].getWorkspace();
            for (let i = 0; i < workspaces.length; i++)
                workspaces[i].showTooltip();
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
            if (this._active != global.screen.get_active_workspace_index()) {
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

            let win = this.getWindowWithTooltip(c);
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

            let workspace = this._workspacesViews[0].getWorkspace(c - 1);
            if (workspace !== undefined)
                workspace.metaWorkspace.activate(global.get_current_time());

            this._hideWorkspacesTooltips();
            return true;
        }
        return false;
    }
    workDispInjections['_onKeyPress'] = undefined;

    winInjections['_init'] = injectToFunction(Workspace.WindowOverlay.prototype, '_init', function(windowClone, parentActor) {
        this._id = null;
        createdActors.push(this._text = new St.Label({ style_class: 'extension-windowsNavigator-window-tooltip' }));
        this._text.hide();
        parentActor.add_actor(this._text);
    });

    winInjections['relayout'] = injectToFunction(Workspace.WindowOverlay.prototype, 'relayout', function(animate) {
        let [cloneX, cloneY, cloneWidth, cloneHeight] = this._windowClone.slot;

        let textX = cloneX - 2;
        let textY = cloneY - 2;
        this._text.set_position(Math.floor(textX) + 5, Math.floor(textY) + 5);
        this._text.raise_top();
    });

    workspaceInjections['_init'] = injectToFunction(Workspace.Workspace.prototype, '_init', function(metaWorkspace) {
        if (metaWorkspace && metaWorkspace.index() < 9) {
            createdActors.push(this._tip = new St.Label({ style_class: 'extension-windowsNavigator-window-tooltip',
                                                          visible: false }));

            this.actor.add_actor(this._tip);
            let signalId = this.actor.connect('notify::scale-x', Lang.bind(this, function() {
                this._tip.set_scale(1 / this.actor.scale_x, 1 / this.actor.scale_x);
            }));
            connectedSignals.push({ obj: this.actor, id: signalId });
        } else
            this._tip = null;
    });

    workDispInjections['show'] = injectToFunction(WorkspacesView.WorkspacesDisplay.prototype, 'show', function() {
        this._pickWorkspace = false;
        this._pickWindow = false;
        this._keyPressEventId = global.stage.connect('key-press-event', Lang.bind(this, this._onKeyPress));
        this._keyReleaseEventId = global.stage.connect('key-release-event', Lang.bind(this, this._onKeyRelease));
        connectedSignals.push({ obj: global.stage, id: this._keyPressEventId });
        connectedSignals.push({ obj: global.stage, id: this._keyReleaseEventId });

        this._setMonitorPositions();
    });

    workDispInjections['hide'] = injectToFunction(WorkspacesView.WorkspacesDisplay.prototype, 'hide', function() {
        global.stage.disconnect(this._keyPressEventId);
        global.stage.disconnect(this._keyReleaseEventId);
        connectedSignals = [ ];
    });
}

function removeInjection(object, injection, name) {
    if (injection[name] === undefined)
        delete object[name];
    else
        object[name] = injection[name];
}

function disable() {
    let i;

    for (i in workspaceInjections)
        removeInjection(Workspace.Workspace.prototype, workspaceInjections, i);
    for (i in winInjections)
        removeInjection(Workspace.WindowOverlay.prototype, winInjections, i);
    for (i in workBaseInjections)
        removeInjection(WorkspacesView.WorkspacesViewBase.prototype, workBaseInjections, i);
    for (i in workDispInjections)
        removeInjection(WorkspacesView.WorkspacesDisplay.prototype, workDispInjections, i);
    for (i in workViewInjections)
        removeInjection(WorkspacesView.WorkspacesView.prototype, workViewInjections, i);

    for (i of connectedSignals)
        i.obj.disconnect(i.id);

    for (i of createdActors)
        i.destroy();

    resetState();
}

function init() {
    /* do nothing */
}
