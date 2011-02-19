// Start apps on custom workspaces

const Glib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const Main = imports.ui.main;

const SETTINGS_SCHEMA = 'org.gnome.shell.extensions.auto-move-windows';
const SETTINGS_KEY = 'application-list';

function WindowMover() {
    this._init();
}

WindowMover.prototype = {
    _init: function() {
	this._settings = new Gio.Settings({ schema: SETTINGS_SCHEMA });
	this._windowTracker = Shell.WindowTracker.get_default();

	let display = global.screen.get_display();
	// Connect after so the handler from ShellWindowTracker has already run
	display.connect_after('window-created', Lang.bind(this, this._findAndMove));
    },

    _ensureAtLeastWorkspaces: function(num) {
        for (let j = global.screen.n_workspaces; j <= num; j++) {
            global.screen.append_new_workspace(false, 0);
        }
    },

    _findAndMove: function(display, window, noRecurse) {
	if (!this._windowTracker.is_window_interesting(window))
	    return;

	let spaces = this._settings.get_strv(SETTINGS_KEY);

	let app = this._windowTracker.get_window_app(window);
	if (!app) {
	    if (!noRecurse) {
		// window is not tracked yet
		Mainloop.idle_add(Lang.bind(this, function() {
		    this._findAndMove(display, window, true);
		    return false;
		}));
	    } else
		log ('Cannot find application for window');
	    return;
	}
	let app_id = app.get_id();
        for ( let j = 0 ; j < spaces.length; j++ ) {
            let apps_to_space = spaces[j].split(":");
            // Match application id
            if (apps_to_space[0] == app_id) {
		let workspace_num = parseInt(apps_to_space[1]);
		this._ensureAtLeastWorkspaces(workspace_num);

		window.change_workspace_by_index(workspace_num, false, global.get_current_time());
            }
        }
    }
}

function main(extensionMeta) {
    new WindowMover();
}