// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-
/* exported init buildPrefsWidget */

const { Gio, GObject, Gtk } = imports.gi;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;


function init() {
    ExtensionUtils.initTranslations();
}

const WindowListPrefsWidget = GObject.registerClass(
class WindowListPrefsWidget extends Gtk.Grid {
    _init(params) {
        super._init(params);

        this.margin = 24;
        this.row_spacing = 6;
        this.orientation = Gtk.Orientation.VERTICAL;

        let groupingLabel = '<b>%s</b>'.format(_('Window Grouping'));
        this.add(new Gtk.Label({
            label: groupingLabel, use_markup: true,
            halign: Gtk.Align.START
        }));

        let align = new Gtk.Alignment({ left_padding: 12 });
        this.add(align);

        let grid = new Gtk.Grid({
            orientation: Gtk.Orientation.VERTICAL,
            row_spacing: 6,
            column_spacing: 6
        });
        align.add(grid);

        this._settings = ExtensionUtils.getSettings();
        let currentMode = this._settings.get_string('grouping-mode');
        let range = this._settings.get_range('grouping-mode');
        let modes = range.deep_unpack()[1].deep_unpack();

        let modeLabels = {
            'never': _('Never group windows'),
            'auto': _('Group windows when space is limited'),
            'always': _('Always group windows')
        };

        let radio = null;
        for (let i = 0; i < modes.length; i++) {
            let mode = modes[i];
            let label = modeLabels[mode];
            if (!label) {
                log('Unhandled option "%s" for grouping-mode'.format(mode));
                continue;
            }

            radio = new Gtk.RadioButton({
                active: currentMode == mode,
                label: label,
                group: radio
            });
            grid.add(radio);

            radio.connect('toggled', button => {
                if (button.active)
                    this._settings.set_string('grouping-mode', mode);
            });
        }

        let check = new Gtk.CheckButton({
            label: _('Show on all monitors'),
            margin_top: 6
        });
        this._settings.bind('show-on-all-monitors', check, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.add(check);
    }
});

function buildPrefsWidget() {
    let widget = new WindowListPrefsWidget();
    widget.show_all();

    return widget;
}
