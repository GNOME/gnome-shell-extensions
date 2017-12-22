// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-
// Start apps on custom workspaces

const Mainloop = imports.mainloop;
const Shell = imports.gi.Shell;

const Main = imports.ui.main;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const SETTINGS_KEY = 'application-list';

let settings;

class WindowMover {
    constructor() {
        this._settings = settings;
        this._windowTracker = Shell.WindowTracker.get_default();

        let display = global.screen.get_display();
        // Connect after so the handler from ShellWindowTracker has already run
        this._windowCreatedId = display.connect_after('window-created', this._findAndMove.bind(this));
    }

    destroy() {
        if (this._windowCreatedId) {
            global.screen.get_display().disconnect(this._windowCreatedId);
            this._windowCreatedId = 0;
        }
    }

    _ensureAtLeastWorkspaces(num, window) {
        for (let i = global.screen.n_workspaces; i <= num; i++) {
            window.change_workspace_by_index(i - 1, false);
            global.screen.append_new_workspace(false, 0);
        }
    }

    _findAndMove(display, window, noRecurse) {
        if (window.skip_taskbar)
            return;

        let spaces = this._settings.get_strv(SETTINGS_KEY);

        let app = this._windowTracker.get_window_app(window);
        if (!app) {
            if (!noRecurse) {
                // window is not tracked yet
                Mainloop.idle_add(() => {
                    this._findAndMove(display, window, true);
                    return false;
                });
            } else
                log ('Cannot find application for window');
            return;
        }
        let app_id = app.get_id();
        for (let i = 0; i < spaces.length; i++) {
            let appsToSpace = spaces[i].split(":");
            // Match application id
            if (appsToSpace[0] == app_id) {
                let workspaceNum = parseInt(appsToSpace[1]) - 1;

                if (workspaceNum >= global.screen.n_workspaces)
                    this._ensureAtLeastWorkspaces(workspace_num, window);

                window.change_workspace_by_index(workspaceNum, false);
            }
        }
    }
};

let prevCheckWorkspaces;
let winMover;

function init() {
    Convenience.initTranslations();
    settings = Convenience.getSettings();
}

function myCheckWorkspaces() {
    let keepAliveWorkspaces = [];
    let foundNonEmpty = false;
    for (let i = this._workspaces.length - 1; i >= 0; i--) {
        if (!foundNonEmpty)
            foundNonEmpty = this._workspaces[i].list_windows().length > 0;
        else if (!this._workspaces[i]._keepAliveId)
            keepAliveWorkspaces.push(this._workspaces[i]);
    }

    // make sure the original method only removes empty workspaces at the end
    keepAliveWorkspaces.forEach(ws => { ws._keepAliveId = 1; });
    prevCheckWorkspaces.call(this);
    keepAliveWorkspaces.forEach(ws => { delete ws._keepAliveId; });

    return false;
}

function enable() {
    prevCheckWorkspaces = Main.wm._workspaceTracker._checkWorkspaces;
    Main.wm._workspaceTracker._checkWorkspaces = myCheckWorkspaces;

    winMover = new WindowMover();
}

function disable() {
    Main.wm._workspaceTracker._checkWorkspaces = prevCheckWorkspaces;
    winMover.destroy();
}
