/* exported enable disable */
const { Meta } = imports.gi;

function enable() {
    global.workspace_manager.override_workspace_layout(
        Meta.DisplayCorner.TOPLEFT,
        false,
        1,
        -1);
}

function disable() {
    global.workspace_manager.override_workspace_layout(
        Meta.DisplayCorner.TOPLEFT,
        false,
        -1,
        1);
}
