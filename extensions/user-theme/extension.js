// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-
// Load shell theme from ~/.local/share/themes/name/gnome-shell

import Gio from 'gi://Gio';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const Main = imports.ui.main;

import {getThemeDirs, getModeThemeDirs} from './util.js';

const SETTINGS_KEY = 'name';

export default class ThemeManager extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._settings.connect(`changed::${SETTINGS_KEY}`, this._changeTheme.bind(this));
        this._changeTheme();
    }

    disable() {
        this._settings?.run_dispose();
        this._settings = null;

        Main.setThemeStylesheet(null);
        Main.loadTheme();
    }

    _changeTheme() {
        let stylesheet = null;
        let themeName = this._settings.get_string(SETTINGS_KEY);

        if (themeName) {
            const stylesheetPaths = getThemeDirs()
                .map(dir => `${dir}/${themeName}/gnome-shell/gnome-shell.css`);

            stylesheetPaths.push(...getModeThemeDirs()
                .map(dir => `${dir}/${themeName}.css`));

            stylesheet = stylesheetPaths.find(path => {
                let file = Gio.file_new_for_path(path);
                return file.query_exists(null);
            });
        }

        if (stylesheet)
            log(`loading user theme: ${stylesheet}`);
        else
            log('loading default theme (Adwaita)');
        Main.setThemeStylesheet(stylesheet);
        Main.loadTheme();
    }
}
