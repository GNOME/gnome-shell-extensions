// SPDX-FileCopyrightText: 2011 Giovanni Campagna <gcampagna@src.gnome.org>
// SPDX-FileCopyrightText: 2011 Alessandro Crismani <alessandro.crismani@gmail.com>
// SPDX-FileCopyrightText: 2014 Florian Müllner <fmuellner@gnome.org>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// time during which windows are moved on startup if startup-only is true
const SESSION_AUTOSTART_TIMEOUT_MS = 20 * 1000;

class WindowMover {
    constructor(settings) {
        this._settings = settings;
        this._appSystem = Shell.AppSystem.get_default();
        this._appConfigs = new Map();
        this._appData = new Map();

        this._appSystem.connectObject('installed-changed',
            () => this._updateAppData(), this);

        this._settings.connectObject('changed::application-list',
            this._updateAppConfigs.bind(this), this);
        this._settings.connectObject('changed::startup-only',
            () => this._updateStartupOnly());
        this._updateStartupOnly();
    }

    _updateStartupOnly() {
        const startupOnly = this._settings.get_boolean('startup-only');
        if (this._startupOnly === startupOnly)
            return;

        this._startupOnly = startupOnly;

        if (startupOnly) {
            this._movesEnabled = Main.layoutManager._startingUp;

            if (this._movesEnabled) {
                this._startupTimeoutId = GLib.timeout_add_once(
                    GLib.PRIORITY_DEFAULT,
                    SESSION_AUTOSTART_TIMEOUT_MS,
                    () => {
                        this._movesEnabled = false;
                        this._updateAppConfigs();

                        delete this._startupTimeoutId;
                    });
            }
        } else {
            this._movesEnabled = true;
        }

        this._updateAppConfigs();
    }

    _updateAppConfigs() {
        this._appConfigs.clear();

        const appList = this._movesEnabled
            ? this._settings.get_strv('application-list')
            : [];
        appList.forEach(v => {
            const [appId, num] = v.split(':');
            this._appConfigs.set(appId, parseInt(num) - 1);
        });

        this._updateAppData();
    }

    _updateAppData() {
        const ids = [...this._appConfigs.keys()];
        const removedApps = [...this._appData.keys()]
            .filter(a => !ids.includes(a.id));
        removedApps.forEach(app => {
            app.disconnectObject(this);
            this._appData.delete(app);
        });

        const addedApps = ids
            .map(id => this._appSystem.lookup_app(id))
            .filter(app => app && !this._appData.has(app));
        addedApps.forEach(app => {
            app.connectObject('windows-changed',
                this._appWindowsChanged.bind(this), this);
            this._appData.set(app, {windows: app.get_windows()});
        });
    }

    destroy() {
        this._appSystem.disconnectObject(this);
        this._appSystem = null;

        this._settings.disconnectObject(this);
        this._settings = null;

        this._appConfigs.clear();
        this._updateAppData();

        if (this._startupTimeoutId)
            GLib.source_remove(this._startupTimeoutId);
        delete this._startupTimeoutId;
    }

    _moveWindow(window, workspaceNum) {
        if (window.skip_taskbar || window.is_on_all_workspaces())
            return;

        // ensure we have the required number of workspaces
        const workspaceManager = global.workspace_manager;
        for (let i = workspaceManager.n_workspaces; i <= workspaceNum; i++) {
            window.change_workspace_by_index(i - 1, false);
            workspaceManager.append_new_workspace(false, 0);
        }

        window.change_workspace_by_index(workspaceNum, false);
    }

    _appWindowsChanged(app) {
        const data = this._appData.get(app);
        let windows = app.get_windows();

        // If get_compositor_private() returns non-NULL on a removed windows,
        // the window still exists and is just moved to a different workspace
        // or something; assume it'll be added back immediately, so keep it
        // to avoid moving it again
        windows.push(...data.windows.filter(w => {
            return !windows.includes(w) && w.get_compositor_private() !== null;
        }));

        // In startup-only mode, we only want to move auto-started apps;
        // we can't filter for that, but at least we know that windows with
        // a startup ID were launched by the user
        if (this._startupOnly)
            windows = windows.filter(w => w.get_startup_id() === null);

        const workspaceNum = this._appConfigs.get(app.id);
        windows.filter(w => !data.windows.includes(w)).forEach(window => {
            this._moveWindow(window, workspaceNum);
        });
        data.windows = windows;
    }
}

export default class AutoMoveExtension extends Extension {
    enable() {
        this._injectionManager = new InjectionManager();
        this._injectionManager.overrideMethod(Main.wm._workspaceTracker, '_checkWorkspaces',
            originalMethod => this._getCheckWorkspaceOverride(originalMethod));

        this._windowMover = new WindowMover(this.getSettings());
    }

    disable() {
        this._injectionManager.clear();
        this._injectionManager = null;

        this._windowMover.destroy();
        this._windowMover = null;
    }

    _getCheckWorkspaceOverride(originalMethod) {
        /* eslint-disable no-invalid-this */
        return function () {
            const keepAliveWorkspaces = [];
            let foundNonEmpty = false;
            for (let i = this._workspaces.length - 1; i >= 0; i--) {
                if (!foundNonEmpty) {
                    foundNonEmpty = this._workspaces[i].list_windows().some(
                        w => !w.is_on_all_workspaces());
                } else if (!this._workspaces[i]._keepAliveId) {
                    keepAliveWorkspaces.push(this._workspaces[i]);
                }
            }

            // make sure the original method only removes empty workspaces at the end
            keepAliveWorkspaces.forEach(ws => (ws._keepAliveId = 1));
            try {
                return originalMethod.call(this);
            } finally {
                keepAliveWorkspaces.forEach(ws => delete ws._keepAliveId);
            }
        };
        /* eslint-enable no-invalid-this */
    }
}
