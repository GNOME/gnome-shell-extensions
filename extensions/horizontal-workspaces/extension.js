/* exported init */
const { Meta } = imports.gi;

const { ThumbnailsBox } = imports.ui.workspaceThumbnail;

class Extension {
    constructor() {
        this._origUpdateSwitcherVisibility =
            ThumbnailsBox.prototype._updateSwitcherVisibility;
    }

    enable() {
        global.workspace_manager.override_workspace_layout(
            Meta.DisplayCorner.TOPLEFT,
            false,
            1,
            -1);

        ThumbnailsBox.prototype._updateSwitcherVisibility = function () {
            this.hide();
        };
    }

    disable() {
        global.workspace_manager.override_workspace_layout(
            Meta.DisplayCorner.TOPLEFT,
            false,
            -1,
            1);

        ThumbnailsBox.prototype._updateSwitcherVisibility =
            this._origUpdateSwitcherVisibility;
    }
}

function init() {
    return new Extension();
}
