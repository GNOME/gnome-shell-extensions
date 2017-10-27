/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const GObject = imports.gi.GObject;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;
const N_ = e => e;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const SETTINGS_APP_ICON_MODE = 'app-icon-mode';
const SETTINGS_CURRENT_WORKSPACE_ONLY = 'current-workspace-only';

const MODES = {
    'thumbnail-only': N_("Thumbnail only"),
    'app-icon-only': N_("Application icon only"),
    'both': N_("Thumbnail and application icon"),
};

const AltTabSettingsWidget = GObject.registerClass(
class AltTabSettingsWidget extends Gtk.Grid {
    _init(params) {
        super._init(params);
        this.margin = 24;
        this.row_spacing = 6;
        this.orientation = Gtk.Orientation.VERTICAL;

        this._settings = new Gio.Settings({ schema_id: 'org.gnome.shell.window-switcher' });

        let presentLabel = '<b>' + _("Present windows as") + '</b>';
        this.add(new Gtk.Label({ label: presentLabel, use_markup: true,
                                 halign: Gtk.Align.START }));

        let align = new Gtk.Alignment({ left_padding: 12 });
        this.add(align);

        let grid = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                  row_spacing: 6,
                                  column_spacing: 6 });
        align.add(grid);

        let radio = null;
        let currentMode = this._settings.get_string(SETTINGS_APP_ICON_MODE);
        for (let mode in MODES) {
            // copy the mode variable because it has function scope, not block scope
            // so cannot be used in a closure
            let modeCapture = mode;
            let name = Gettext.gettext(MODES[mode]);

            radio = new Gtk.RadioButton({ group: radio, label: name, valign: Gtk.Align.START });
            radio.connect('toggled', widget => {
                if (widget.active)
                    this._settings.set_string(SETTINGS_APP_ICON_MODE, modeCapture);
            });
            grid.add(radio);

            if (mode == currentMode)
                radio.active = true;
        }

        let check = new Gtk.CheckButton({ label: _("Show only windows in the current workspace"),
                                          margin_top: 6 });
        this._settings.bind(SETTINGS_CURRENT_WORKSPACE_ONLY, check, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.add(check);
    }
});

function init() {
    Convenience.initTranslations();
}

function buildPrefsWidget() {
    let widget = new AltTabSettingsWidget();
    widget.show_all();

    return widget;
}
