// SPDX-FileCopyrightText: 2011 Maxim Ermilov <zaspire@rambler.ru>
// SPDX-FileCopyrightText: 2011 Giovanni Campagna <gcampagna@src.gnome.org>
// SPDX-FileCopyrightText: 2017 Florian Müllner <fmuellner@gnome.org>
// SPDX-FileCopyrightText: 2019 Marco Trevisan (Treviño) <mail@3v1n0.net>
// SPDX-FileCopyrightText: 2020 Thun Pin <thunpin@gmail.com>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import Clutter from 'gi://Clutter';
import Graphene from 'gi://Graphene';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as OverviewControls from 'resource:///org/gnome/shell/ui/overviewControls.js';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {WindowPreview} from 'resource:///org/gnome/shell/ui/windowPreview.js';
import {Workspace} from 'resource:///org/gnome/shell/ui/workspace.js';
import {WorkspacesView} from 'resource:///org/gnome/shell/ui/workspacesView.js';

const WINDOW_SLOT = 4;

export default class Extension {
    constructor() {
        this._injectionManager = new InjectionManager();
    }

    enable() {
        const previewProto = WindowPreview.prototype;

        this._injectionManager.overrideMethod(previewProto, '_init', originalMethod => {
            /* eslint-disable no-invalid-this */
            return function (...args) {
                originalMethod.call(this, ...args);

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
            };
            /* eslint-enable */
        });
        this._injectionManager.overrideMethod(previewProto, 'showTooltip', () => {
            /* eslint-disable no-invalid-this */
            return function (text) {
                this._text.set({text});
                this._text.show();
            };
            /* eslint-enable */
        });
        this._injectionManager.overrideMethod(previewProto, 'hideTooltip', () => {
            /* eslint-disable no-invalid-this */
            return function () {
                this._text?.hide();
            };
            /* eslint-enable */
        });

        const workspaceProto = Workspace.prototype;
        this._injectionManager.overrideMethod(workspaceProto, '_init', originalMethod => {
            /* eslint-disable no-invalid-this */
            return function (...args) {
                originalMethod.call(this, ...args);

                if (this.metaWorkspace && this.metaWorkspace.index() < 9) {
                    this._tip = new St.Label({
                        style_class: 'extension-windowsNavigator-window-tooltip',
                        visible: false,
                    });
                    this.add_child(this._tip);

                    this.connect('notify::scale-x', () => {
                        this._tip.set_scale(1 / this.scale_x, 1 / this.scale_x);
                    });
                } else {
                    this._tip = null;
                }
            };
            /* eslint-enable */
        });
        this._injectionManager.overrideMethod(workspaceProto, 'vfunc_allocate', originalMethod => {
            /* eslint-disable no-invalid-this */
            return function (box) {
                originalMethod.call(this, box);

                this._tip?.allocate_preferred_size(0, 0);
            };
            /* eslint-enable */
        });
        this._injectionManager.overrideMethod(workspaceProto, 'showTooltip', () => {
            /* eslint-disable no-invalid-this */
            return function () {
                if (!this._tip)
                    return;
                this._tip.text = (this.metaWorkspace.index() + 1).toString();
                this._tip.show();
                this.set_child_below_sibling(this._tip, null);
            };
            /* eslint-enable */
        });
        this._injectionManager.overrideMethod(workspaceProto, 'hideTooltip', () => {
            /* eslint-disable no-invalid-this */
            return function () {
                this._tip?.hide();
            };
            /* eslint-enable */
        });
        this._injectionManager.overrideMethod(workspaceProto, 'getWindowWithTooltip', () => {
            /* eslint-disable no-invalid-this */
            return function (id) {
                const {layoutManager} = this._container;
                const slot = layoutManager._windowSlots[id - 1];
                return slot ? slot[WINDOW_SLOT].metaWindow : null;
            };
            /* eslint-enable */
        });
        this._injectionManager.overrideMethod(workspaceProto, 'showWindowsTooltips', () => {
            /* eslint-disable no-invalid-this */
            return function () {
                const {layoutManager} = this._container;
                for (let i = 0; i < layoutManager._windowSlots.length; i++) {
                    if (layoutManager._windowSlots[i])
                        layoutManager._windowSlots[i][WINDOW_SLOT].showTooltip(`${i + 1}`);
                }
            };
            /* eslint-enable */
        });
        this._injectionManager.overrideMethod(workspaceProto, 'hideWindowsTooltips', () => {
            /* eslint-disable no-invalid-this */
            return function () {
                const {layoutManager} = this._container;
                for (let i in layoutManager._windowSlots) {
                    if (layoutManager._windowSlots[i])
                        layoutManager._windowSlots[i][WINDOW_SLOT].hideTooltip();
                }
            };
            /* eslint-enable */
        });

        const viewProto = WorkspacesView.prototype;
        this._injectionManager.overrideMethod(viewProto, '_init', originalMethod => {
            /* eslint-disable no-invalid-this */
            return function (...args) {
                originalMethod.call(this, ...args);

                this._pickWorkspace = false;
                this._pickWindow = false;
                global.stage.connectObject(
                    'key-press-event', this._onKeyPress.bind(this),
                    'key-release-event', this._onKeyRelease.bind(this),
                    this);
            };
            /* eslint-enable */
        });
        this._injectionManager.overrideMethod(viewProto, '_hideTooltips', () => {
            /* eslint-disable no-invalid-this */
            return function () {
                if (global.stage.get_key_focus() === null)
                    global.stage.set_key_focus(this._prevFocusActor);
                this._pickWindow = false;
                for (let i = 0; i < this._workspaces.length; i++)
                    this._workspaces[i].hideWindowsTooltips();
            };
            /* eslint-enable */
        });
        this._injectionManager.overrideMethod(viewProto, '_hideWorkspacesTooltips', () => {
            /* eslint-disable no-invalid-this */
            return function () {
                global.stage.set_key_focus(this._prevFocusActor);
                this._pickWorkspace = false;
                for (let i = 0; i < this._workspaces.length; i++)
                    this._workspaces[i].hideTooltip();
            };
            /* eslint-enable */
        });
        this._injectionManager.overrideMethod(viewProto, '_onKeyRelease', () => {
            /* eslint-disable no-invalid-this */
            return function (actor, event) {
                if (this._pickWindow &&
                    (event.get_key_symbol() === Clutter.KEY_Alt_L ||
                     event.get_key_symbol() === Clutter.KEY_Alt_R))
                    this._hideTooltips();
                if (this._pickWorkspace &&
                    (event.get_key_symbol() === Clutter.KEY_Control_L ||
                     event.get_key_symbol() === Clutter.KEY_Control_R))
                    this._hideWorkspacesTooltips();
            };
            /* eslint-enable */
        });
        this._injectionManager.overrideMethod(viewProto, '_onKeyPress', () => {
            /* eslint-disable no-invalid-this */
            return function (actor, event) {
                const {ControlsState} = OverviewControls;
                if (this._overviewAdjustment.value !== ControlsState.WINDOW_PICKER)
                    return false;

                let workspaceManager = global.workspace_manager;

                if ((event.get_key_symbol() === Clutter.KEY_Alt_L ||
                     event.get_key_symbol() === Clutter.KEY_Alt_R) &&
                    !this._pickWorkspace) {
                    this._prevFocusActor = global.stage.get_key_focus();
                    global.stage.set_key_focus(null);
                    this._active = workspaceManager.get_active_workspace_index();
                    this._pickWindow = true;
                    this._workspaces[workspaceManager.get_active_workspace_index()].showWindowsTooltips();
                    return true;
                }
                if ((event.get_key_symbol() === Clutter.KEY_Control_L ||
                     event.get_key_symbol() === Clutter.KEY_Control_R) &&
                    !this._pickWindow) {
                    this._prevFocusActor = global.stage.get_key_focus();
                    global.stage.set_key_focus(null);
                    this._pickWorkspace = true;
                    for (let i = 0; i < this._workspaces.length; i++)
                        this._workspaces[i].showTooltip();
                    return true;
                }

                if (global.stage.get_key_focus() !== null)
                    return false;

                // ignore shift presses, they're required to get numerals in azerty keyboards
                if ((this._pickWindow || this._pickWorkspace) &&
                    (event.get_key_symbol() === Clutter.KEY_Shift_L ||
                     event.get_key_symbol() === Clutter.KEY_Shift_R))
                    return true;

                if (this._pickWindow) {
                    if (this._active !== workspaceManager.get_active_workspace_index()) {
                        this._hideTooltips();
                        return false;
                    }

                    let c = event.get_key_symbol() - Clutter.KEY_KP_0;
                    if (c > 9 || c <= 0) {
                        c = event.get_key_symbol() - Clutter.KEY_0;
                        if (c > 9 || c <= 0) {
                            this._hideTooltips();
                            log(c);
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
                    let c = event.get_key_symbol() - Clutter.KEY_KP_0;
                    if (c > 9 || c <= 0) {
                        c = event.get_key_symbol() - Clutter.KEY_0;
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
            };
            /* eslint-enable */
        });
    }

    disable() {
        this._injectionManager.clear();
    }
}
