// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-
/* exported enable disable */
const Workspace = imports.ui.workspace;

const ExtensionUtils = imports.misc.extensionUtils;

// testing settings for natural window placement strategy:
const WINDOW_PLACEMENT_NATURAL_ACCURACY = 20;                       // accuracy of window translate moves  (KDE-default: 20)
const WINDOW_PLACEMENT_NATURAL_GAPS = 5;                            // half of the minimum gap between windows
const WINDOW_PLACEMENT_NATURAL_MAX_TRANSLATIONS = 5000;             // safety limit for preventing endless loop if something is wrong in the algorithm

class Rect {
    constructor(x, y, width, height) {
        [this.x, this.y, this.width, this.height] = [x, y, width, height];
    }

    /**
     * used in _calculateWindowTransformationsNatural to replace Meta.Rectangle that is too slow.
     */
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
        return !((this.x + this.width    <= rect2.x) ||
                 (rect2.x + rect2.width  <= this.x) ||
                 (this.y + this.height   <= rect2.y) ||
                 (rect2.y + rect2.height <= this.y));
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
    constructor(settings) {
        super();
        this._settings = settings;
    }

    computeLayout(windows, layout) {
        layout.windows = windows;
    }

    /**
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
            let rect = clones[i].metaWindow.get_frame_rect();
            rects[i] = new Rect(rect.x, rect.y, rect.width, rect.height);
            bounds = bounds.union(rects[i]);

            // This is used when the window is on the edge of the screen to try to use as much screen real estate as possible.
            directions[i] = direction;
            direction++;
            if (direction == 4) {
                direction = 0;
            }
        }

        let loopCounter = 0;
        let overlap;
        do {
            overlap = false;
            for (let i = 0; i < rects.length; i++) {
                for (let j = 0; j < rects.length; j++) {
                    let adjustments = [-1, -1, 1, 1]
                        .map(v => v *= WINDOW_PLACEMENT_NATURAL_GAPS);
                    let iAdjusted = rects[i].adjusted(...adjustments);
                    let jAdjusted = rects[j].adjusted(...adjustments);
                    if (i != j && iAdjusted.overlap(jAdjusted)) {
                        loopCounter++;
                        overlap = true;

                        // TODO: something like a Point2D would be nicer here:

                        // Determine pushing direction
                        let iCenter = rects[i].center();
                        let jCenter = rects[j].center();
                        let diff = [jCenter[0] - iCenter[0], jCenter[1] - iCenter[1]];

                        // Prevent dividing by zero and non-movement
                        if (diff[0] == 0 && diff[1] == 0)
                            diff[0] = 1;
                        // Try to keep screen/workspace aspect ratio
                        if ( bounds.height / bounds.width > areaRect.height / areaRect.width )
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

                            let iCenter = rects[i].center();
                            diff[0] = 0;
                            diff[1] = 0;
                            if (xSection != 1 || ySection != 1) { // Remove this if you want the center to pull as well
                                if (xSection == 1)
                                    xSection = (directions[i] / 2 ? 2 : 0);
                                if (ySection == 1)
                                    ySection = (directions[i] % 2 ? 2 : 0);
                            }
                            if (xSection == 0 && ySection == 0) {
                                diff[0] = bounds.x - iCenter[0];
                                diff[1] = bounds.y - iCenter[1];
                            }
                            if (xSection == 2 && ySection == 0) {
                                diff[0] = bounds.x + bounds.width - iCenter[0];
                                diff[1] = bounds.y - iCenter[1];
                            }
                            if (xSection == 2 && ySection == 2) {
                                diff[0] = bounds.x + bounds.width - iCenter[0];
                                diff[1] = bounds.y + bounds.height - iCenter[1];
                            }
                            if (xSection == 0 && ySection == 2) {
                                diff[0] = bounds.x - iCenter[0];
                                diff[1] = bounds.y + bounds.height - iCenter[1];
                            }
                            if (diff[0] != 0 || diff[1] != 0) {
                                let length = Math.sqrt(diff[0] * diff[0] + diff[1] * diff[1]);
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
        scale = Math.min(areaRect.width / bounds.width,
                         areaRect.height / bounds.height,
                         1.0);

        // Make bounding rect fill the screen size for later steps
        bounds.x = bounds.x - (areaRect.width - bounds.width * scale) / 2;
        bounds.y = bounds.y - (areaRect.height - bounds.height * scale) / 2;
        bounds.width = areaRect.width / scale;
        bounds.height = areaRect.height / scale;

        // Move all windows back onto the screen and set their scale
        for (let i = 0; i < rects.length; i++) {
            rects[i].translate(-bounds.x, -bounds.y);
        }

        // rescale to workspace
        let slots = [];
        for (let i = 0; i < rects.length; i++) {
            rects[i].x = rects[i].x * scale + areaRect.x;
            rects[i].y = rects[i].y * scale + areaRect.y;

            slots.push([rects[i].x, rects[i].y, scale, clones[i]]);
        }

        return slots;
    }
}

let winInjections, workspaceInjections;

function resetState() {
    winInjections = { };
    workspaceInjections = { };
}

function enable() {
    resetState();

    let settings = ExtensionUtils.getSettings();

    workspaceInjections['_getBestLayout'] = Workspace.Workspace.prototype._getBestLayout;
    Workspace.Workspace.prototype._getBestLayout = function(windows) {
        let strategy = new NaturalLayoutStrategy(settings);
        let layout = { strategy };
        strategy.computeLayout(windows, layout);

        return layout;
    };

    /// position window titles on top of windows in overlay ////
    winInjections['relayout'] = Workspace.WindowOverlay.prototype.relayout;
    Workspace.WindowOverlay.prototype.relayout = function(animate) {
        if (settings.get_boolean('window-captions-on-top')) {
            let [, , , cloneHeight] = this._windowClone.slot;
            this.title.translation_y = -cloneHeight;
        }

        winInjections['relayout'].call(this, animate);
    };
}

function removeInjection(object, injection, name) {
    if (injection[name] === undefined)
        delete object[name];
    else
        object[name] = injection[name];
}

function disable() {
    var i;

    for (i in workspaceInjections)
        removeInjection(Workspace.Workspace.prototype, workspaceInjections, i);
    for (i in winInjections)
        removeInjection(Workspace.WindowOverlay.prototype, winInjections, i);

    global.stage.queue_relayout();
    resetState();
}
