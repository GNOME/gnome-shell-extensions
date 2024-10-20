// SPDX-FileCopyrightText: 2011 Giovanni Campagna <gcampagna@src.gnome.org>
// SPDX-FileCopyrightText: 2011 Stefano Facchini <stefano.facchini@gmail.com>
// SPDX-FileCopyrightText: 2011 Wepmaschda <wepmaschda@gmx.de>
// SPDX-FileCopyrightText: 2015 Florian Müllner <fmuellner@gnome.org>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import Clutter from 'gi://Clutter';

import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {WindowPreview} from 'resource:///org/gnome/shell/ui/windowPreview.js';
import * as Workspace from 'resource:///org/gnome/shell/ui/workspace.js';

// testing settings for natural window placement strategy:
const WINDOW_PLACEMENT_NATURAL_ACCURACY = 20;                       // accuracy of window translate moves  (KDE-default: 20)
const WINDOW_PLACEMENT_NATURAL_GAPS = 5;                            // half of the minimum gap between windows
const WINDOW_PLACEMENT_NATURAL_MAX_TRANSLATIONS = 5000;             // safety limit for preventing endless loop if something is wrong in the algorithm

class Rect {
    constructor(x, y, width, height) {
        [this.x, this.y, this.width, this.height] = [x, y, width, height];
    }

    // used in _calculateWindowTransformationsNatural to replace Meta.Rectangle that is too slow.
    copy() {
        return new Rect(this.x, this.y, this.width, this.height);
    }

    union(rect2) {
        let dest = this.copy();
        if (rect2.x < dest.x) {
            dest.width += dest.x - rect2.x;
            dest.x = rect2.x;
        }
        if (rect2.y < dest.y) {
            dest.height += dest.y - rect2.y;
            dest.y = rect2.y;
        }
        if (rect2.x + rect2.width > dest.x + dest.width)
            dest.width = rect2.x + rect2.width - dest.x;
        if (rect2.y + rect2.height > dest.y + dest.height)
            dest.height = rect2.y + rect2.height - dest.y;

        return dest;
    }

    adjusted(dx, dy, dx2, dy2) {
        let dest = this.copy();
        dest.x += dx;
        dest.y += dy;
        dest.width += -dx + dx2;
        dest.height += -dy + dy2;
        return dest;
    }

    overlap(rect2) {
        return !(this.x + this.width    <= rect2.x ||
                 rect2.x + rect2.width  <= this.x ||
                 this.y + this.height   <= rect2.y ||
                 rect2.y + rect2.height <= this.y);
    }

    center() {
        return [this.x + this.width / 2, this.y + this.height / 2];
    }

    translate(dx, dy) {
        this.x += dx;
        this.y += dy;
    }
}

class NaturalLayoutStrategy extends Workspace.LayoutStrategy {
    constructor(params, settings) {
        super(params);
        this._settings = settings;
    }

    computeLayout(windows, _params) {
        return {
            windows,
        };
    }

    /*
     * Returns clones with matching target coordinates and scales to arrange windows in a natural way that no overlap exists and relative window size is preserved.
     * This function is almost a 1:1 copy of the function
     * PresentWindowsEffect::calculateWindowTransformationsNatural() from KDE, see:
     * https://projects.kde.org/projects/kde/kdebase/kde-workspace/repository/revisions/master/entry/kwin/effects/presentwindows/presentwindows.cpp
     */
    computeWindowSlots(layout, area) {
        // As we are using pseudo-random movement (See "slot") we need to make sure the list
        // is always sorted the same way no matter which window is currently active.

        let areaRect = new Rect(area.x, area.y, area.width, area.height);
        let bounds = areaRect.copy();
        let clones = layout.windows;

        let direction = 0;
        let directions = [];
        let rects = [];
        for (let i = 0; i < clones.length; i++) {
            // save rectangles into 4-dimensional arrays representing two corners of the rectangular: [left_x, top_y, right_x, bottom_y]
            let rect = clones[i].boundingBox;
            rects[i] = new Rect(rect.x, rect.y, rect.width, rect.height);
            bounds = bounds.union(rects[i]);

            // This is used when the window is on the edge of the screen to try to use as much screen real estate as possible.
            directions[i] = direction;
            direction++;
            if (direction === 4)
                direction = 0;
        }

        let loopCounter = 0;
        let overlap;
        do {
            overlap = false;
            for (let i = 0; i < rects.length; i++) {
                for (let j = 0; j < rects.length; j++) {
                    let adjustments = [-1, -1, 1, 1]
                        .map(v => (v *= WINDOW_PLACEMENT_NATURAL_GAPS));
                    let iAdjusted = rects[i].adjusted(...adjustments);
                    let jAdjusted = rects[j].adjusted(...adjustments);
                    if (i !== j && iAdjusted.overlap(jAdjusted)) {
                        loopCounter++;
                        overlap = true;

                        // TODO: something like a Point2D would be nicer here:

                        // Determine pushing direction
                        let iCenter = rects[i].center();
                        let jCenter = rects[j].center();
                        let diff = [jCenter[0] - iCenter[0], jCenter[1] - iCenter[1]];

                        // Prevent dividing by zero and non-movement
                        if (diff[0] === 0 && diff[1] === 0)
                            diff[0] = 1;
                        // Try to keep screen/workspace aspect ratio
                        if (bounds.height / bounds.width > areaRect.height / areaRect.width)
                            diff[0] *= 2;
                        else
                            diff[1] *= 2;

                        // Approximate a vector of between 10px and 20px in magnitude in the same direction
                        let length = Math.sqrt(diff[0] * diff[0] + diff[1] * diff[1]);
                        diff[0] = diff[0] * WINDOW_PLACEMENT_NATURAL_ACCURACY / length;
                        diff[1] = diff[1] * WINDOW_PLACEMENT_NATURAL_ACCURACY / length;

                        // Move both windows apart
                        rects[i].translate(-diff[0], -diff[1]);
                        rects[j].translate(diff[0], diff[1]);


                        if (this._settings.get_boolean('use-more-screen')) {
                            // Try to keep the bounding rect the same aspect as the screen so that more
                            // screen real estate is utilised. We do this by splitting the screen into nine
                            // equal sections, if the window center is in any of the corner sections pull the
                            // window towards the outer corner. If it is in any of the other edge sections
                            // alternate between each corner on that edge. We don't want to determine it
                            // randomly as it will not produce consistant locations when using the filter.
                            // Only move one window so we don't cause large amounts of unnecessary zooming
                            // in some situations. We need to do this even when expanding later just in case
                            // all windows are the same size.
                            // (We are using an old bounding rect for this, hopefully it doesn't matter)
                            let xSection = Math.round((rects[i].x - bounds.x) / (bounds.width / 3));
                            let ySection = Math.round((rects[i].y - bounds.y) / (bounds.height / 3));

                            iCenter = rects[i].center();
                            diff[0] = 0;
                            diff[1] = 0;
                            if (xSection !== 1 || ySection !== 1) { // Remove this if you want the center to pull as well
                                if (xSection === 1)
                                    xSection = directions[i] / 2 ? 2 : 0;
                                if (ySection === 1)
                                    ySection = directions[i] % 2 ? 2 : 0;
                            }
                            if (xSection === 0 && ySection === 0) {
                                diff[0] = bounds.x - iCenter[0];
                                diff[1] = bounds.y - iCenter[1];
                            }
                            if (xSection === 2 && ySection === 0) {
                                diff[0] = bounds.x + bounds.width - iCenter[0];
                                diff[1] = bounds.y - iCenter[1];
                            }
                            if (xSection === 2 && ySection === 2) {
                                diff[0] = bounds.x + bounds.width - iCenter[0];
                                diff[1] = bounds.y + bounds.height - iCenter[1];
                            }
                            if (xSection === 0 && ySection === 2) {
                                diff[0] = bounds.x - iCenter[0];
                                diff[1] = bounds.y + bounds.height - iCenter[1];
                            }
                            if (diff[0] !== 0 || diff[1] !== 0) {
                                length = Math.sqrt(diff[0] * diff[0] + diff[1] * diff[1]);
                                diff[0] *= WINDOW_PLACEMENT_NATURAL_ACCURACY / length / 2;   // /2 to make it less influencing than the normal center-move above
                                diff[1] *= WINDOW_PLACEMENT_NATURAL_ACCURACY / length / 2;
                                rects[i].translate(diff[0], diff[1]);
                            }
                        }

                        // Update bounding rect
                        bounds = bounds.union(rects[i]);
                        bounds = bounds.union(rects[j]);
                    }
                }
            }
        } while (overlap && loopCounter < WINDOW_PLACEMENT_NATURAL_MAX_TRANSLATIONS);

        // Work out scaling by getting the most top-left and most bottom-right window coords.
        let scale;
        scale = Math.min(
            areaRect.width / bounds.width,
            areaRect.height / bounds.height,
            1.0);

        // Make bounding rect fill the screen size for later steps
        bounds.x -= (areaRect.width - bounds.width * scale) / 2;
        bounds.y -= (areaRect.height - bounds.height * scale) / 2;
        bounds.width = areaRect.width / scale;
        bounds.height = areaRect.height / scale;

        // Move all windows back onto the screen and set their scale
        for (let i = 0; i < rects.length; i++)
            rects[i].translate(-bounds.x, -bounds.y);


        // rescale to workspace
        let slots = [];
        for (let i = 0; i < rects.length; i++) {
            rects[i].x = rects[i].x * scale + areaRect.x;
            rects[i].y = rects[i].y * scale + areaRect.y;
            rects[i].width *= scale;
            rects[i].height *= scale;

            slots.push([rects[i].x, rects[i].y, rects[i].width, rects[i].height, clones[i]]);
        }

        return slots;
    }
}

export default class NativeWindowPlacementExtension extends Extension {
    constructor(metadata) {
        super(metadata);

        this._injectionManager = new InjectionManager();
    }

    enable() {
        const settings = this.getSettings();

        const layoutProto = Workspace.WorkspaceLayout.prototype;
        const previewProto = WindowPreview.prototype;

        this._injectionManager.overrideMethod(layoutProto, '_createBestLayout', () => {
            /* eslint-disable no-invalid-this */
            return function () {
                this._layoutStrategy = new NaturalLayoutStrategy({
                    monitor: Main.layoutManager.monitors[this._monitorIndex],
                }, settings);
                return this._layoutStrategy.computeLayout(this._sortedWindows);
            };
            /* eslint-enable no-invalid-this */
        });

        // position window titles on top of windows in overlay
        this._injectionManager.overrideMethod(previewProto, '_init', originalMethod => {
            /* eslint-disable no-invalid-this */
            return function (...args) {
                originalMethod.call(this, ...args);

                if (!settings.get_boolean('window-captions-on-top'))
                    return;

                const alignConstraint = this._title.get_constraints().find(
                    c => c.align_axis && c.align_axis === Clutter.AlignAxis.Y_AXIS);
                alignConstraint.factor = 0;

                const bindConstraint = this._title.get_constraints().find(
                    c => c.coordinate && c.coordinate === Clutter.BindCoordinate.Y);
                bindConstraint.offset = 0;
            };
            /* eslint-enable no-invalid-this */
        });

        this._injectionManager.overrideMethod(previewProto, '_adjustOverlayOffsets', originalMethod => {
            /* eslint-disable no-invalid-this */
            return function (...args) {
                originalMethod.call(this, ...args);

                if (settings.get_boolean('window-captions-on-top'))
                    this._title.translation_y = -this._title.translation_y;
            };
            /* eslint-enable no-invalid-this */
        });
    }

    disable() {
        this._injectionManager.clear();
        global.stage.queue_relayout();
    }
}
