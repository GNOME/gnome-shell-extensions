// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-
// Load shell theme from ~/.local/share/themes/name/gnome-shell
/* exported init */

const { Gio, GLib } = imports.gi;
const Main = imports.ui.main;

const SETTINGS_KEY = 'name';

const ExtensionUtils = imports.misc.extensionUtils;

class ThemeManager {
    constructor() {
        this._settings = ExtensionUtils.getSettings();
    }

    enable() {
        this._changedId = this._settings.connect(`changed::${SETTINGS_KEY}`, this._changeTheme.bind(this));
        this._changeTheme();
    }

    disable() {
        if (this._changedId) {
            this._settings.disconnect(this._changedId);
            this._changedId = 0;
        }

        Main.setThemeStylesheet(null);
        Main.loadTheme();
    }

    _changeTheme() {
        let _stylesheet = null;
        let _themeName = this._settings.get_string(SETTINGS_KEY);

        if (_themeName) {
            let _userCssStylesheetCompat = GLib.build_filenamev([
                GLib.get_home_dir(), '.themes', _themeName, 'gnome-shell', 'gnome-shell.css'
            ]);
            let fileCompat = Gio.file_new_for_path(_userCssStylesheetCompat);
            let _userCssStylesheet = GLib.build_filenamev([
                GLib.get_user_data_dir(), 'themes', _themeName, 'gnome-shell', 'gnome-shell.css'
            ]);
            let file = Gio.file_new_for_path(_userCssStylesheet);
            if (fileCompat.query_exists(null))
                _stylesheet = _userCssStylesheetCompat;
            else if (file.query_exists(null))
                _stylesheet = _userCssStylesheet;
            else {
                let sysdirs = GLib.get_system_data_dirs();
                sysdirs.unshift(GLib.get_user_data_dir());
                for (let i = 0; i < sysdirs.length; i++) {
                    _userCssStylesheet = GLib.build_filenamev([
                        sysdirs[i], 'themes', _themeName, 'gnome-shell', 'gnome-shell.css'
                    ]);
                    let file = Gio.file_new_for_path(_userCssStylesheet);
                    if (file.query_exists(null)) {
                        _stylesheet = _userCssStylesheet;
                        break;
                    }
                }
            }
        }

        if (_stylesheet)
            global.log(`loading user theme: ${_stylesheet}`);
        else
            global.log('loading default theme (Adwaita)');
        Main.setThemeStylesheet(_stylesheet);
        Main.loadTheme();
    }
}

function init() {
    return new ThemeManager();
}
