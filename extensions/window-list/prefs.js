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
class WindowListPrefsWidget extends Gtk.Box {
    _init() {
        super._init({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_top: 36,
            margin_bottom: 36,
            margin_start: 36,
            margin_end: 36,
            halign: Gtk.Align.CENTER,
        });

        let groupingLabel = '<b>%s</b>'.format(_('Window Grouping'));
        this.add(new Gtk.Label({
            label: groupingLabel, use_markup: true,
            halign: Gtk.Align.START,
        }));

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_bottom: 12,
        });
        this.add(box);

        const context = box.get_style_context();
        const cssProvider = new Gtk.CssProvider();
        cssProvider.load_from_data(
            'box { padding: 12px; }');

        context.add_provider(cssProvider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        context.add_class('frame');
        context.add_class('view');

        this._settings = ExtensionUtils.getSettings();
        let currentMode = this._settings.get_string('grouping-mode');
        let range = this._settings.get_range('grouping-mode');
        let modes = range.deep_unpack()[1].deep_unpack();

        let modeLabels = {
            'never': _('Never group windows'),
            'auto': _('Group windows when space is limited'),
            'always': _('Always group windows'),
        };

        let radio = null;
        let currentRadio = null;
        for (let i = 0; i < modes.length; i++) {
            let mode = modes[i];
            let label = modeLabels[mode];
            if (!label) {
                log('Unhandled option "%s" for grouping-mode'.format(mode));
                continue;
            }

            radio = new Gtk.RadioButton({
                active: !i,
                label,
                group: radio,
                margin_end: 12,
            });
            box.add(radio);

            if (currentMode === mode)
                currentRadio = radio;

            radio.connect('toggled', button => {
                if (button.active)
                    this._settings.set_string('grouping-mode', mode);
            });
        }

        if (currentRadio)
            currentRadio.active = true;

        let check = new Gtk.CheckButton({
            label: _('Show on all monitors'),
        });
        this._settings.bind('show-on-all-monitors', check, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.add(check);

        check = new Gtk.CheckButton({
            label: _('Show windows from all workspaces'),
        });
        this._settings.bind('display-all-workspaces', check, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.add(check);

        this.show_all();
    }
});

function buildPrefsWidget() {
    return new WindowListPrefsWidget();
}
