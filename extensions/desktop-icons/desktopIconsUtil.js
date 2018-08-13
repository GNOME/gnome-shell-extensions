/* Desktop Icons GNOME Shell extension
 *
 * Copyright (C) 2017 Carlos Soriano <csoriano@redhat.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;

const TERMINAL_SCHEMA = 'org.gnome.desktop.default-applications.terminal';
const EXEC_KEY = 'exec';

function getDesktopDir() {
    let desktopPath = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP);
    return Gio.File.new_for_commandline_arg(desktopPath);
}

function getTerminalCommand(workdir) {
    let terminalSettings = new Gio.Settings({ schema_id: TERMINAL_SCHEMA });
    let exec = terminalSettings.get_string(EXEC_KEY);
    let command = `${exec} --working-directory=${workdir}`;

    return command;
}

function distanceBetweenPoints(x, y, x2, y2) {
    return Math.sqrt(Math.pow(x - x2, 2) + Math.pow(y - y2, 2));
}