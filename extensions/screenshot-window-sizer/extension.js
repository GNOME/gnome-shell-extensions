/* exported enable disable */
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

const {Clutter, Meta, Shell, St} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;

const MESSAGE_FADE_TIME = 2000;

let text;

/** */
function hideMessage() {
    text.destroy();
    text = null;
}

/**
 * @param {string} message - the message to flash
 */
function flashMessage(message) {
    if (!text) {
        text = new St.Label({style_class: 'screenshot-sizer-message'});
        Main.uiGroup.add_actor(text);
    }

    text.remove_all_transitions();
    text.text = message;

    text.opacity = 255;

    let monitor = Main.layoutManager.primaryMonitor;
    text.set_position(
        monitor.x + Math.floor(monitor.width / 2 - text.width / 2),
        monitor.y + Math.floor(monitor.height / 2 - text.height / 2));

    text.ease({
        opacity: 0,
        duration: MESSAGE_FADE_TIME,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        onComplete: hideMessage,
    });
}

let SIZES = [
    [624, 351],
    [800, 450],
    [1024, 576],
    [1200, 675],
    [1600, 900],
    [360, 654], // Phone portrait maximized
    [720, 360], // Phone landscape fullscreen
];

/**
 * @param {Meta.Display} display - the display
 * @param {Meta.Window=} window - for per-window bindings, the window
 * @param {Meta.KeyBinding} binding - the key binding
 */
function cycleScreenshotSizes(display, window, binding) {
    // Probably this isn't useful with 5 sizes, but you can decrease instead
    // of increase by holding down shift.
    let modifiers = binding.get_modifiers();
    let backwards = (modifiers & Meta.VirtualModifier.SHIFT_MASK) !== 0;

    // Unmaximize first
    if (window.get_maximized() !== 0)
        window.unmaximize(Meta.MaximizeFlags.BOTH);

    let workArea = window.get_work_area_current_monitor();
    let outerRect = window.get_frame_rect();

    // Double both axes if on a hidpi display
    let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
    let scaledSizes = SIZES.map(size => size.map(wh => wh * scaleFactor))
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
    let [newWidth, newHeight] = scaledSizes[newIndex];

    // Push the window onscreen if it would be resized offscreen
    let newX = outerRect.x;
    let newY = outerRect.y;
    if (newX + newWidth > workArea.x + workArea.width)
        newX = Math.max(workArea.x + workArea.width - newWidth);
    if (newY + newHeight > workArea.y + workArea.height)
        newY = Math.max(workArea.y + workArea.height - newHeight);

    const id = window.connect('size-changed', () => {
        window.disconnect(id);
        _notifySizeChange(window);
    });
    window.move_resize_frame(true, newX, newY, newWidth, newHeight);
}

/**
 * @param {Meta.Window} window - the window whose size changed
 */
function _notifySizeChange(window) {
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

    flashMessage(message);
}

/** */
function enable() {
    Main.wm.addKeybinding(
        'cycle-screenshot-sizes',
        ExtensionUtils.getSettings(),
        Meta.KeyBindingFlags.PER_WINDOW,
        Shell.ActionMode.NORMAL,
        cycleScreenshotSizes);
    Main.wm.addKeybinding(
        'cycle-screenshot-sizes-backward',
        ExtensionUtils.getSettings(),
        Meta.KeyBindingFlags.PER_WINDOW | Meta.KeyBindingFlags.IS_REVERSED,
        Shell.ActionMode.NORMAL,
        cycleScreenshotSizes);
}

/** */
function disable() {
    Main.wm.removeKeybinding('cycle-screenshot-sizes');
    Main.wm.removeKeybinding('cycle-screenshot-sizes-backward');
}
