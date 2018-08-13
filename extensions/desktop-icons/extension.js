
/* Desktop Icons GNOME Shell extension
 *
 * Copyright (C) 2017 Carlos Soriano <csoriano@gnome.org>
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

const Main = imports.ui.main;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const DesktopManager = Me.imports.desktopManager;


let injections = {};

function removeBackgroundMenu()
{
    injections['_addBackgroundMenu'] = Main.layoutManager._addBackgroundMenu;
    Main.layoutManager._addBackgroundMenu = function (bgManager) { };
}

function init()
{
}

var desktopManager = null;

function enable()
{
    removeBackgroundMenu();
    desktopManager = new DesktopManager.DesktopManager();
}

function disable()
{
    desktopManager.destroy();
    for (let prop in injections)
    {
        Main.layoutManager[prop] = injections[prop];
    }
}
