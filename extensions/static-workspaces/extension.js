// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

const Meta = imports.gi.Meta;

function init(metadata) {
}

function enable() {
    // Override gnome-shell's overrides
    Meta.prefs_override_preference_schema('dynamic-workspaces',
                                          'org.gnome.mutter');
}

function disable() {
    // Restore gnome-shell's overrides
    Meta.prefs_override_preference_schema('dynamic-workspaces',
                                          'org.gnome.shell.overrides');
}
