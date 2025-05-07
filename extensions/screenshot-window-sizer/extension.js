// SPDX-FileCopyrightText: 2013 Owen Taylor <otaylor@redhat.com>
// SPDX-FileCopyrightText: 2013 Richard Hughes <richard@hughsie.com>
// SPDX-FileCopyrightText: 2014 Florian Müllner <fmuellner@gnome.org>
// SPDX-FileCopyrightText: 2016 Will Thompson <will@willthompson.co.uk>
// SPDX-FileCopyrightText: 2017 Florian Müllner <fmuellner@gnome.org>
// SPDX-FileCopyrightText: 2019 Adrien Plazas <kekun.plazas@laposte.net>
// SPDX-FileCopyrightText: 2019 Willy Stadnick <willy.stadnick@gmail.com>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const MESSAGE_FADE_TIME = 2000;

export default class ScreenshotWindowSizerExtension extends Extension {
    SIZES = [
        [624, 351],
        [800, 450],
        [1024, 576],
        [1000, 700],
        [1200, 675],
        [1600, 900],
        [360, 654], // Phone portrait maximized
        [720, 360], // Phone landscape fullscreen
    ];

    _flashMessage(message) {
        if (!this._text) {
            this._text = new St.Label({style_class: 'screenshot-sizer-message'});
            Main.uiGroup.add_child(this._text);
        }

        this._text.remove_all_transitions();
        this._text.text = message;

        this._text.opacity = 255;

        const monitor = Main.layoutManager.primaryMonitor;
        this._text.set_position(
            monitor.x + Math.floor(monitor.width / 2 - this._text.width / 2),
            monitor.y + Math.floor(monitor.height / 2 - this._text.height / 2));

        this._text.ease({
            opacity: 0,
            duration: MESSAGE_FADE_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this._hideMessage(),
        });
    }

    _hideMessage() {
        this._text.destroy();
        delete this._text;
    }

    /**
     * @param {Meta.Display} display - the display
     * @param {Meta.Window=} window - for per-window bindings, the window
     * @param {Clutter.Event} event - the triggering event
     * @param {Meta.KeyBinding} binding - the key binding
     */
    _cycleScreenshotSizes(display, window, event, binding) {
        const backwards = binding.is_reversed();

        // Unmaximize first
        if (window.is_maximized())
            window.unmaximize();

        let workArea = window.get_work_area_current_monitor();
        let outerRect = window.get_frame_rect();

        // Double both axes if on a hidpi display
        let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        let scaledSizes = this.SIZES.map(size => size.map(wh => wh * scaleFactor))
            .filter(([w, h]) => w <= workArea.width && h <= workArea.height);

        // Find the nearest 16:9 size for the current window size
        let nearestIndex;
        let nearestError;

        for (let i = 0; i < scaledSizes.length; i++) {
            let [width, height] = scaledSizes[i];

            // get the best initial window size
            let error = Math.abs(width - outerRect.width) + Math.abs(height - outerRect.height);
            if (nearestIndex === undefined || error < nearestError) {
                nearestIndex = i;
                nearestError = error;
            }
        }

        // get the next size up or down from ideal
        let newIndex = (nearestIndex + (backwards ? -1 : 1)) % scaledSizes.length;
        let [newWidth, newHeight] = scaledSizes.at(newIndex);

        // Push the window onscreen if it would be resized offscreen
        let newX = outerRect.x;
        let newY = outerRect.y;
        if (newX + newWidth > workArea.x + workArea.width)
            newX = Math.max(workArea.x + workArea.width - newWidth);
        if (newY + newHeight > workArea.y + workArea.height)
            newY = Math.max(workArea.y + workArea.height - newHeight);

        const id = window.connect('size-changed', () => {
            window.disconnect(id);
            this._notifySizeChange(window);
        });
        window.move_resize_frame(true, newX, newY, newWidth, newHeight);
    }

    /**
     * @param {Meta.Window} window - the window whose size changed
     */
    _notifySizeChange(window) {
        const {scaleFactor} = St.ThemeContext.get_for_stage(global.stage);
        let newOuterRect = window.get_frame_rect();
        let message = '%d×%d'.format(
            newOuterRect.width / scaleFactor,
            newOuterRect.height / scaleFactor);

        // The new size might have been constrained by geometry hints (e.g. for
        // a terminal) - in that case, include the actual ratio to the message
        // we flash
        let actualNumerator = 9 * newOuterRect.width / newOuterRect.height;
        if (Math.abs(actualNumerator - 16) > 0.01)
            message += ' (%.2f:9)'.format(actualNumerator);

        this._flashMessage(message);
    }

    enable() {
        Main.wm.addKeybinding(
            'cycle-screenshot-sizes',
            this.getSettings(),
            Meta.KeyBindingFlags.PER_WINDOW,
            Shell.ActionMode.NORMAL,
            this._cycleScreenshotSizes.bind(this));
        Main.wm.addKeybinding(
            'cycle-screenshot-sizes-backward',
            this.getSettings(),
            Meta.KeyBindingFlags.PER_WINDOW | Meta.KeyBindingFlags.IS_REVERSED,
            Shell.ActionMode.NORMAL,
            this._cycleScreenshotSizes.bind(this));
    }

    disable() {
        Main.wm.removeKeybinding('cycle-screenshot-sizes');
        Main.wm.removeKeybinding('cycle-screenshot-sizes-backward');
    }
}
