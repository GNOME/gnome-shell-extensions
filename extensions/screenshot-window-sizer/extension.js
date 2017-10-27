/* Screenshot Window Sizer for Gnome Shell
 *
 * Copyright (c) 2013 Owen Taylor <otaylor@redhat.com>
 * Copyright (c) 2013 Richard Hughes <richard@hughsie.com>
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

const Gio = imports.gi.Gio;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const Main = imports.ui.main;
const Tweener = imports.ui.tweener;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const MESSAGE_FADE_TIME = 2;

let text, button;

function hideMessage() {
    text.destroy();
    text = null;
}

function flashMessage(message) {
    if (!text) {
        text = new St.Label({ style_class: 'screenshot-sizer-message' });
        Main.uiGroup.add_actor(text);
    }

    Tweener.removeTweens(text);
    text.text = message;

    text.opacity = 255;

    let monitor = Main.layoutManager.primaryMonitor;
    text.set_position(monitor.x + Math.floor(monitor.width / 2 - text.width / 2),
                      monitor.y + Math.floor(monitor.height / 2 - text.height / 2));

    Tweener.addTween(text,
                     { opacity: 0,
                       time: MESSAGE_FADE_TIME,
                       transition: 'easeOutQuad',
                       onComplete: hideMessage });
}

let SIZES = [
    [624, 351],
    [800, 450],
    [1024, 576],
    [1200, 675],
    [1600, 900]
];

function cycleScreenshotSizes(display, screen, window, binding) {
    // Probably this isn't useful with 5 sizes, but you can decrease instead
    // of increase by holding down shift.
    let modifiers = binding.get_modifiers();
    let backwards = (modifiers & Meta.VirtualModifier.SHIFT_MASK) != 0;

    // Unmaximize first
    if (window.maximized_horizontally || window.maximizedVertically)
        window.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);

    let workArea = window.get_work_area_current_monitor();
    let outerRect = window.get_frame_rect();

    // Double both axes if on a hidpi display
    let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
    let scaledSizes = SIZES.map(size => size.map(wh => wh * scaleFactor));

    // Find the nearest 16:9 size for the current window size
    let nearestIndex;
    let nearestError;

    for (let i = 0; i < scaledSizes.length; i++) {
        let [width, height] = scaledSizes[i];

        // ignore sizes bigger than the workArea
        if (width > workArea.width || height > workArea.height)
            continue;

        // get the best initial window size
        let error = Math.abs(width - outerRect.width) + Math.abs(height - outerRect.height);
        if (nearestIndex == null || error < nearestError) {
            nearestIndex = i;
            nearestError = error;
        }
    }

    // get the next size up or down from ideal
    let newIndex = (nearestIndex + (backwards ? -1 : 1)) % scaledSizes.length;
    let newWidth, newHeight;
    [newWidth, newHeight] = scaledSizes[newIndex];
    if (newWidth > workArea.width || newHeight > workArea.height)
        [newWidth, newHeight] = scaledSizes[0];

    // Push the window onscreen if it would be resized offscreen
    let newX = outerRect.x;
    let newY = outerRect.y;
    if (newX + newWidth > workArea.x + workArea.width)
        newX = Math.max(workArea.x + workArea.width - newWidth);
    if (newY + newHeight > workArea.y + workArea.height)
        newY = Math.max(workArea.y + workArea.height - newHeight);

    window.move_resize_frame(true, newX, newY, newWidth, newHeight);

    let newOuterRect = window.get_frame_rect();
    let message = '%d×%d'.format(
            (newOuterRect.width / scaleFactor),
            (newOuterRect.height / scaleFactor));

    // The new size might have been constrained by geometry hints (e.g. for
    // a terminal) - in that case, include the actual ratio to the message
    // we flash
    let actualNumerator = (newOuterRect.width / newOuterRect.height) * 9;
    if (Math.abs(actualNumerator - 16) > 0.01)
        message += ' (%.2f:9)'.format(actualNumerator);

    flashMessage(message);
}

function init() {
}

function enable() {
    Main.wm.addKeybinding('cycle-screenshot-sizes',
                          Convenience.getSettings(),
                          Meta.KeyBindingFlags.PER_WINDOW,
                          Shell.ActionMode.NORMAL,
                          cycleScreenshotSizes);
    Main.wm.addKeybinding('cycle-screenshot-sizes-backward',
                          Convenience.getSettings(),
                          Meta.KeyBindingFlags.PER_WINDOW |
                          Meta.KeyBindingFlags.IS_REVERSED,
                          Shell.ActionMode.NORMAL,
                          cycleScreenshotSizes);
}

function disable() {
    Main.wm.removeKeybinding('cycle-screenshot-sizes');
    Main.wm.removeKeybinding('cycle-screenshot-sizes-backward');
}
