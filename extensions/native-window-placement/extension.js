// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-
// import just everything from workspace.js:
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const Pango = imports.gi.Pango;
const Shell = imports.gi.Shell;
const St = imports.gi.St;
const Signals = imports.signals;

const DND = imports.ui.dnd;
const Lightbox = imports.ui.lightbox;
const Main = imports.ui.main;
const Overview = imports.ui.overview;
const Panel = imports.ui.panel;
const Tweener = imports.ui.tweener;

const Workspace = imports.ui.workspace;
const WindowPositionFlags = Workspace.WindowPositionFlags;

const WindowPlacementStrategy = {
    NATURAL: 0,
    GRID: 1,
};

/* Begin user settings */
const PLACEMENT_STRATEGY = WindowPlacementStrategy.NATURAL;
const USE_MORE_SCREEN = true;
const WINDOW_CAPTIONS_ON_TOP = true;
/* End user settings - do not change anything below this line */

// testing settings for natural window placement strategy:
const WINDOW_PLACEMENT_NATURAL_FILLGAPS = true;                     // enlarge windows at the end to fill gaps         // not implemented yet
const WINDOW_PLACEMENT_NATURAL_GRID_FALLBACK = true;                // fallback to grid mode if all windows have the same size and positions.     // not implemented yet
const WINDOW_PLACEMENT_NATURAL_ACCURACY = 20;                       // accuracy of window translate moves  (KDE-default: 20)
const WINDOW_PLACEMENT_NATURAL_GAPS = 5;                            // half of the minimum gap between windows
const WINDOW_PLACEMENT_NATURAL_MAX_TRANSLATIONS = 5000;             // safety limit for preventing endless loop if something is wrong in the algorithm

const PLACE_WINDOW_CAPTIONS_ON_TOP = true;                          // place window titles in overview on top of windows with overlap parameter

function injectToFunction(parent, name, func) {
    let origin = parent[name];
    parent[name] = function() {
        let ret;
        ret = origin.apply(this, arguments);
        if (ret === undefined)
            ret = func.apply(this, arguments);
        return ret;
    }
}
const WORKSPACE_BORDER_GAP = 10;                                    // gap between the workspace area and the workspace selector

function Rect(x, y, width, height) {
    [this.x, this.y, this.width, this.height] = arguments;
}

Rect.prototype = {
    /**
     * used in _calculateWindowTransformationsNatural to replace Meta.Rectangle that is too slow.
     */

    copy: function() {
        return new Rect(this.x, this.y, this.width, this.height);
    },

    union: function(rect2) {
        let dest = this.copy();
        if (rect2.x < dest.x)
          {
            dest.width += dest.x - rect2.x;
            dest.x = rect2.x;
          }
        if (rect2.y < dest.y)
          {
            dest.height += dest.y - rect2.y;
            dest.y = rect2.y;
          }
        if (rect2.x + rect2.width > dest.x + dest.width)
          dest.width = rect2.x + rect2.width - dest.x;
        if (rect2.y + rect2.height > dest.y + dest.height)
          dest.height = rect2.y + rect2.height - dest.y;

        return dest;
    },

    adjusted: function(dx, dy, dx2, dy2) {
        let dest = this.copy();
        dest.x += dx;
        dest.y += dy;
        dest.width += -dx + dx2;
        dest.height += -dy + dy2;
        return dest;
    },

    overlap: function(rect2) {
        return !((this.x + this.width    <= rect2.x) ||
                 (rect2.x + rect2.width  <= this.x) ||
                 (this.y + this.height   <= rect2.y) ||
                 (rect2.y + rect2.height <= this.y));
    },

    center: function() {
        return [this.x + this.width / 2, this.y + this.height / 2];
    },

    translate: function(dx, dy) {
        this.x += dx;
        this.y += dy;
    }
};

let winInjections, workspaceInjections, connectedSignals;

function resetState() {
    winInjections = { };
    workspaceInjections = { };
    workViewInjections = { };
    connectedSignals = [ ];
}

function enable() {
    resetState();

    let placementStrategy = PLACEMENT_STRATEGY;
    let useMoreScreen = USE_MORE_SCREEN;

    /**
     * _calculateWindowTransformationsNatural:
     * @clones: Array of #MetaWindow
     *
     * Returns clones with matching target coordinates and scales to arrange windows in a natural way that no overlap exists and relative window size is preserved.
     * This function is almost a 1:1 copy of the function
     * PresentWindowsEffect::calculateWindowTransformationsNatural() from KDE, see:
     * https://projects.kde.org/projects/kde/kdebase/kde-workspace/repository/revisions/master/entry/kwin/effects/presentwindows/presentwindows.cpp
     */
    Workspace.Workspace.prototype._calculateWindowTransformationsNatural = function(clones) {
        // As we are using pseudo-random movement (See "slot") we need to make sure the list
        // is always sorted the same way no matter which window is currently active.
        clones = clones.sort(function (win1, win2) {
            return win2.metaWindow.get_stable_sequence() - win1.metaWindow.get_stable_sequence();
        });

        // Put a gap on the right edge of the workspace to separe it from the workspace selector
        let x_gap = WORKSPACE_BORDER_GAP;
        let y_gap = WORKSPACE_BORDER_GAP * this._height / this._width
        let area = new Rect(this._x, this._y, this._width - x_gap, this._height - y_gap);

        let bounds = area.copy();

        let direction = 0;
        let directions = [];
        let rects = [];
        for (let i = 0; i < clones.length; i++) {
            // save rectangles into 4-dimensional arrays representing two corners of the rectangular: [left_x, top_y, right_x, bottom_y]
            let rect = clones[i].metaWindow.get_outer_rect();
            rects[i] = new Rect(rect.x, rect.y, rect.width, rect.height);
            bounds = bounds.union(rects[i]);

            // This is used when the window is on the edge of the screen to try to use as much screen real estate as possible.
            directions[i] = direction;
            direction++;
            if (direction == 4) {
                direction = 0;
            }
        }

        let loop_counter = 0;
        let overlap;
        do {
            overlap = false;
            for (let i = 0; i < rects.length; i++) {
                for (let j = 0; j < rects.length; j++) {
                    if (i != j && rects[i].adjusted(-WINDOW_PLACEMENT_NATURAL_GAPS, -WINDOW_PLACEMENT_NATURAL_GAPS,
                                                    WINDOW_PLACEMENT_NATURAL_GAPS, WINDOW_PLACEMENT_NATURAL_GAPS).overlap(
                                                     rects[j].adjusted(-WINDOW_PLACEMENT_NATURAL_GAPS, -WINDOW_PLACEMENT_NATURAL_GAPS,
                                                                       WINDOW_PLACEMENT_NATURAL_GAPS, WINDOW_PLACEMENT_NATURAL_GAPS))) {
                        loop_counter++;
                        overlap = true;

                        // TODO: something like a Point2D would be nicer here:

                        // Determine pushing direction
                        let i_center = rects[i].center();
                        let j_center = rects[j].center();
                        let diff = [j_center[0] - i_center[0], j_center[1] - i_center[1]];

                        // Prevent dividing by zero and non-movement
                        if (diff[0] == 0 && diff[1] == 0)
                            diff[0] = 1;
                        // Try to keep screen/workspace aspect ratio
                        if ( bounds.height / bounds.width > area.height / area.width )
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


                        if (useMoreScreen) {
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

                            let i_center = rects[i].center();
                            diff[0] = 0;
                            diff[1] = 0;
                            if (xSection != 1 || ySection != 1) { // Remove this if you want the center to pull as well
                                if (xSection == 1)
                                    xSection = (directions[i] / 2 ? 2 : 0);
                                if (ySection == 1)
                                    ySection = (directions[i] % 2 ? 2 : 0);
                            }
                            if (xSection == 0 && ySection == 0) {
                                diff[0] = bounds.x - i_center[0];
                                diff[1] = bounds.y - i_center[1];
                            }
                            if (xSection == 2 && ySection == 0) {
                                diff[0] = bounds.x + bounds.width - i_center[0];
                                diff[1] = bounds.y - i_center[1];
                            }
                            if (xSection == 2 && ySection == 2) {
                                diff[0] = bounds.x + bounds.width - i_center[0];
                                diff[1] = bounds.y + bounds.height - i_center[1];
                            }
                            if (xSection == 0 && ySection == 2) {
                                diff[0] = bounds.x - i_center[0];
                                diff[1] = bounds.y + bounds.height - i_center[1];
                            }
                            if (diff[0] != 0 || diff[1] != 0) {
                                let length = Math.sqrt(diff[0]*diff[0] + diff[1]*diff[1]);
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
        } while (overlap && loop_counter < WINDOW_PLACEMENT_NATURAL_MAX_TRANSLATIONS);

        // Work out scaling by getting the most top-left and most bottom-right window coords.
        let scale;
        scale = Math.min(area.width / bounds.width,
                         area.height / bounds.height,
                         1.0);

        // Make bounding rect fill the screen size for later steps
        bounds.x = bounds.x - (area.width - bounds.width * scale) / 2;
        bounds.y = bounds.y - (area.height - bounds.height * scale) / 2;
        bounds.width = area.width / scale;
        bounds.height = area.height / scale;

        // Move all windows back onto the screen and set their scale
        for (let i = 0; i < rects.length; i++) {
            rects[i].translate(-bounds.x, -bounds.y);
        }

        // TODO: Implement the KDE part "Try to fill the gaps by enlarging windows if they have the space" here. (If this is wanted)

        // rescale to workspace
        let scales = [];

        let buttonOuterHeight, captionHeight;
        let buttonOuterWidth = 0;

        let targets = [];
        for (let i = 0; i < rects.length; i++) {
            rects[i].x = rects[i].x * scale + this._x;
            rects[i].y = rects[i].y * scale + this._y;

            targets[i] = [rects[i].x, rects[i].y, scale];
        }

        return [clones, targets];
    }
    workspaceInjections['_calculateWindowTransformationsNatural'] = undefined;

    /**
     * _calculateWindowTransformationsGrid:
     * @clones: Array of #MetaWindow
     *
     * Returns clones with matching target coordinates and scales to arrange windows in a grid.
     */
    Workspace.Workspace.prototype._calculateWindowTransformationsGrid = function(clones) {
        let slots = this._computeAllWindowSlots(clones.length);
        clones = this._orderWindowsByMotionAndStartup(clones, slots);
        let targets = [];

        for (let i = 0; i < clones.length; i++) {
            targets[i] = this._computeWindowLayout(clones[i].metaWindow, slots[i]);
        }

        return [clones, targets];
    }
    workspaceInjections['_calculateWindowTransformationsGrid'] = undefined;

    /**
     * positionWindows:
     * @flags:
     *  INITIAL - this is the initial positioning of the windows.
     *  ANIMATE - Indicates that we need animate changing position.
     */
    workspaceInjections['positionWindows'] = Workspace.Workspace.prototype.positionWindows;
    Workspace.Workspace.prototype.positionWindows = function(flags) {
        if (this._repositionWindowsId > 0) {
            Mainloop.source_remove(this._repositionWindowsId);
            this._repositionWindowsId = 0;
        }

        let clones = this._windows.slice();
        if (this._reservedSlot)
            clones.push(this._reservedSlot);

        let initialPositioning = flags & WindowPositionFlags.INITIAL;
        let animate = flags & WindowPositionFlags.ANIMATE;

        // Start the animations
	let targets = [];
        let scales = [];

        switch (placementStrategy) {
        case WindowPlacementStrategy.NATURAL:
            [clones, targets] = this._calculateWindowTransformationsNatural(clones);
            break;
        default:
            log ('Invalid window placement strategy');
            placementStrategy = WindowPlacementStrategy.GRID;
        case WindowPlacementStrategy.GRID:
            [clones, targets] = this._calculateWindowTransformationsGrid(clones);
            break;
        }

	let currentWorkspace = global.screen.get_active_workspace();
        let isOnCurrentWorkspace = this.metaWorkspace == null || this.metaWorkspace == currentWorkspace;

        for (let i = 0; i < clones.length; i++) {
            let clone = clones[i];
	    let [x, y , scale] = targets[i];
            let metaWindow = clone.metaWindow;
            let mainIndex = this._lookupIndex(metaWindow);
            let overlay = this._windowOverlays[mainIndex];

            // Positioning a window currently being dragged must be avoided;
            // we'll just leave a blank spot in the layout for it.
            if (clone.inDrag)
                continue;

            if (overlay)
                overlay.hide();
            if (animate && isOnCurrentWorkspace) {
                if (!metaWindow.showing_on_its_workspace()) {
                    /* Hidden windows should fade in and grow
                     * therefore we need to resize them now so they
                     * can be scaled up later */
                    if (initialPositioning) {
                        clone.actor.opacity = 0;
                        clone.actor.scale_x = 0;
                        clone.actor.scale_y = 0;
                        clone.actor.x = x;
                        clone.actor.y = y;
                    }

                    // Make the window slightly transparent to indicate it's hidden
                    Tweener.addTween(clone.actor,
                                     { opacity: 255,
                                       time: Overview.ANIMATION_TIME,
                                       transition: 'easeInQuad'
                                     });
                }

                Tweener.addTween(clone.actor,
                                 { x: x,
                                   y: y,
                                   scale_x: scale,
                                   scale_y: scale,
                                   time: Overview.ANIMATION_TIME,
                                   transition: 'easeOutQuad',
                                   onComplete: Lang.bind(this, function() {
				       this._showWindowOverlay(clone, overlay, true);
                                   })
                                 });
            } else {
                clone.actor.set_position(x, y);
                clone.actor.set_scale(scale, scale);
                this._showWindowOverlay(clone, overlay, isOnCurrentWorkspace);
            }
        }
    }

    /// position window titles on top of windows in overlay ////
    if (WINDOW_CAPTIONS_ON_TOP)  {
        winInjections['_init'] = Workspace.WindowOverlay.prototype._init;
	Workspace.WindowOverlay.prototype._init = function(windowClone, parentActor) {
            let metaWindow = windowClone.metaWindow;

            this._windowClone = windowClone;
            this._parentActor = parentActor;
            this._hidden = false;

            let title = new St.Label({ style_class: 'window-caption',
                                       text: metaWindow.title });
            title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            title._spacing = 0;
            title._overlap = 0;

            this._updateCaptionId = metaWindow.connect('notify::title', Lang.bind(this, function(w) {
		this.title.text = w.title;
	    }));

            let button = new St.Button({ style_class: 'window-close' });
            button._overlap = 0;

            this._idleToggleCloseId = 0;
            button.connect('clicked', Lang.bind(this, this._closeWindow));

            windowClone.actor.connect('destroy', Lang.bind(this, this._onDestroy));
            windowClone.actor.connect('enter-event', Lang.bind(this, this._onEnter));
            windowClone.actor.connect('leave-event', Lang.bind(this, this._onLeave));

            this._windowAddedId = 0;
            windowClone.connect('zoom-start', Lang.bind(this, this.hide));
            windowClone.connect('zoom-end', Lang.bind(this, this.show));

            button.hide();

            this.title = title;
            this.closeButton = button;

            parentActor.add_actor(this.title);
            parentActor.add_actor(this.closeButton);
            title.connect('style-changed', Lang.bind(this, this._onStyleChanged));
            button.connect('style-changed', Lang.bind(this, this._onStyleChanged));

            // force a style change if we are already on a stage - otherwise
            // the signal will be emitted normally when we are added
            if (parentActor.get_stage())
		this._onStyleChanged();
	},

        winInjections['chromeHeights'] = Workspace.WindowOverlay.prototype.chromeHeights;
	Workspace.WindowOverlay.prototype.chromeHeights = function () {
            return [Math.max( this.closeButton.height - this.closeButton._overlap, this.title.height - this.title._overlap),
		    0];
	},

        winInjections['updatePositions'] = Workspace.WindowOverlay.prototype.updatePositions;
	Workspace.WindowOverlay.prototype.updatePositions = function(cloneX, cloneY, cloneWidth, cloneHeight) {
            let button = this.closeButton;
            let title = this.title;

            let buttonX;
            let buttonY = cloneY - (button.height - button._overlap);
            if (St.Widget.get_default_direction() == St.TextDirection.RTL)
		buttonX = cloneX - (button.width - button._overlap);
            else
		buttonX = cloneX + (cloneWidth - button._overlap);

            button.set_position(Math.floor(buttonX), Math.floor(buttonY));

            if (!title.fullWidth)
		title.fullWidth = title.width;
            title.width = Math.min(title.fullWidth, cloneWidth);

            let titleX = cloneX + (cloneWidth - title.width) / 2;
	    let titleY = cloneY - title.height + title._overlap;
            title.set_position(Math.floor(titleX), Math.floor(titleY));
	},

        winInjections['_onStyleChanged'] = Workspace.WindowOverlay.prototype._onStyleChanged;
	Workspace.WindowOverlay.prototype._onStyleChanged = function() {
            let titleNode = this.title.get_theme_node();
            this.title._spacing = titleNode.get_length('-shell-caption-spacing');
	    this.title._overlap = titleNode.get_length('-shell-caption-overlap');

            let closeNode = this.closeButton.get_theme_node();
            this.closeButton._overlap = closeNode.get_length('-shell-close-overlap');

            this._parentActor.queue_relayout();
	}
    }
}

function removeInjection(object, injection, name) {
    if (injection[name] === undefined)
        delete object[name];
    else
        object[name] = injection[name];
}

function disable() {
    for (i in workspaceInjections)
        removeInjection(Workspace.Workspace.prototype, workspaceInjections, i);
    for (i in winInjections)
        removeInjection(Workspace.WindowOverlay.prototype, winInjections, i);

    for each (i in connectedSignals)
        i.obj.disconnect(i.id);

    global.stage.queue_relayout();
    resetState();
}

function init() {
    /* do nothing */
}
