// SPDX-FileCopyrightText: 2012 Giovanni Campagna <gcampagna@src.gnome.org>
// SPDX-FileCopyrightText: 2014 Florian Müllner <fmuellner@gnome.org>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {WorkspacesPage} from './workspacePrefs.js';

export default class WorkspaceIndicatorPrefs extends ExtensionPreferences {
    getPreferencesWidget() {
        return new WorkspacesPage(this.getSettings());
    }
}
