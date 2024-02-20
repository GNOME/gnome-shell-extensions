// SPDX-FileCopyrightText: 2011 Erick Pérez Castellanos <erick.red@gmail.com>
// SPDX-FileCopyrightText: 2011 Giovanni Campagna <gcampagna@src.gnome.org>
// SPDX-FileCopyrightText: 2017 Florian Müllner <fmuellner@gnome.org>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {WorkspaceIndicator} from './workspaceIndicator.js';

export default class WorkspaceIndicatorExtension extends Extension {
    enable() {
        this._indicator = new WorkspaceIndicator({
            settings: this.getSettings(),
        });
        Main.panel.addToStatusArea('workspace-indicator', this._indicator);
    }

    disable() {
        this._indicator.destroy();
        delete this._indicator;
    }
}
