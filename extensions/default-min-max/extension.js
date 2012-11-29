// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

const Meta = imports.gi.Meta;

const BUTTON_LAYOUT_KEY = 'button-layout';
const EXTENSION_SCHEMA = 'org.gnome.desktop.wm.preferences';
const SHELL_OVERRIDES_SCHEMA = 'org.gnome.shell.overrides';

function init(metadata) {
}

function enable() {
    // Override gnome-shell's overrides
    Meta.prefs_override_preference_schema(BUTTON_LAYOUT_KEY, EXTENSION_SCHEMA);
}

function disable() {
    // Restore gnome-shell's overrides
    Meta.prefs_override_preference_schema(BUTTON_LAYOUT_KEY, SHELL_OVERRIDES_SCHEMA);
}
