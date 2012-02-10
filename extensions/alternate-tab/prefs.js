/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

/* most of the code is borrowed from
 * > js/ui/altTab.js <
 * of the gnome-shell source code
 */

const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const GObject = imports.gi.GObject;
const Lang = imports.lang;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;
const N_ = function(e) { return e };

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const SETTINGS_BEHAVIOUR_KEY = 'behaviour';
const SETTINGS_HIGHLIGHT_KEY = 'highlight-selected';

const MODES = {
    all_thumbnails: {
        name: N_("All & Thumbnails"),
        description: N_("This mode presents all applications from all workspaces in one selection \
list. Instead of using the application icon of every window, it uses small \
thumbnails resembling the window itself."),
        extra_widgets: [ ]
    },
    workspace_icons: {
        name: N_("Workspace & Icons"),
        description: N_("This mode let's you switch between the applications of your current \
workspace and gives you additionally the option to switch to the last used \
application of your previous workspace. This is always the last symbol in \
the list and is segregated by a separator/vertical line if available. \n\
Every window is represented by its application icon."),
        extra_widgets: [
            { label: N_("Move current selection to front before closing the popup"), key: SETTINGS_HIGHLIGHT_KEY }
        ]
    }
};

const AltTabSettingsWidget = new GObject.Class({
    Name: 'AlternateTab.Prefs.AltTabSettingsWidget',
    GTypeName: 'AltTabSettingsWidget',
    Extends: Gtk.Grid,

    _init : function(params) {
        this.parent(params);
        this.column_spacing = 10;
        this.margin = 10;

        this._settings = Convenience.getSettings();

        let introLabel = _("The Alternate Tab can be used in different modes, that \
affect the way windows are chosen and presented.");

        this.attach(new Gtk.Label({ label: introLabel, wrap: true, sensitive: true,
                                    margin_bottom: 10, margin_top: 5 }),
                    0, 0, 2, 1);

        let top = 1;
        let radio = null;
        let currentMode = this._settings.get_string(SETTINGS_BEHAVIOUR_KEY);
        for (let mode in MODES) {
            // copy the mode variable because it has function scope, not block scope
            // so cannot be used in a closure
            let modeCapture = mode;
            let obj = MODES[mode];
            let name = Gettext.gettext(obj.name);
            let description = Gettext.gettext(obj.description);
            let nextra = obj.extra_widgets.length;

            radio = new Gtk.RadioButton({ group: radio, label: name, valign: Gtk.Align.START });
            radio.connect('toggled', Lang.bind(this, function(widget) {
                if (widget.active)
                    this._settings.set_string(SETTINGS_BEHAVIOUR_KEY, modeCapture);
                this._updateSensitivity(widget, widget.active);
            }));
            this.attach(radio, 0, top, 1, nextra + 1);

            let descriptionLabel = new Gtk.Label({ label: description, wrap: true, sensitive: true,
                                                   xalign: 0.0, justify: Gtk.Justification.FILL });
            this.attach(descriptionLabel, 1, top, 1, 1);

            radio._extra = [];
            for (let i = 0; i < nextra; i++) {
                let key = obj.extra_widgets[i].key;
                let label = Gettext.gettext(obj.extra_widgets[i].label);

                let extra = new Gtk.CheckButton({ label: label });
                this._settings.bind(key, extra, 'active', Gio.SettingsBindFlags.DEFAULT);

                radio._extra.push(extra);
                this.attach(extra, 1, top + i + 1, 1, 1);                            
            }

            if (mode == currentMode)
                radio.active = true;
            this._updateSensitivity(radio, radio.active);

            top += nextra + 1;
        }
    },

    _updateSensitivity: function(widget, active) {
        for (let i = 0; i < widget._extra.length; i++)
            widget._extra[i].sensitive = active;
    },
});

function init() {
    Convenience.initTranslations();
}

function buildPrefsWidget() {
    let widget = new AltTabSettingsWidget();
    widget.show_all();

    return widget;
}
