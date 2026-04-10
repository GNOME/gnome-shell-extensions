// SPDX-FileCopyrightText: 2013 Gabriel Rossetti <rossetti.gabriel@gmail.com>
// SPDX-FileCopyrightText: 2013 Florian Müllner <fmuellner@gnome.org>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import {AppIcon} from 'resource:///org/gnome/shell/ui/appDisplay.js';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class Extension {
    enable() {
        this._injectionManager = new InjectionManager();
        this._injectionManager.overrideMethod(AppIcon.prototype, 'activate',
            originalMethod => {
                return function () {
                    // eslint-disable-next-line no-invalid-this
                    originalMethod.call(this, 2);
                };
            });
    }

    disable() {
        this._injectionManager.clear();
        this._injectionManager = null;
    }
}
