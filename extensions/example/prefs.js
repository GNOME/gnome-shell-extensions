// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

function init() {
    Convenience.initTranslations();
}

const ExamplePrefsWidget = GObject.registerClass(
class ExamplePrefsWidget extends Gtk.Grid {
    _init(params) {
        super._init(params);
        this.margin = 12;
        this.row_spacing = this.column_spacing = 6;
        this.set_orientation(Gtk.Orientation.VERTICAL);

        this.add(new Gtk.Label({ label: '<b>' + _("Message") + '</b>',
                                 use_markup: true,
                                 halign: Gtk.Align.START }));

        let entry = new Gtk.Entry({ hexpand: true,
                                    margin_bottom: 12 });
        this.add(entry);

        this._settings = Convenience.getSettings();
        this._settings.bind('hello-text', entry, 'text', Gio.SettingsBindFlags.DEFAULT);

        // TRANSLATORS: Example is the name of the extension, should not be
        // translated
        let primaryText = _("Example aims to show how to build well behaved \
extensions for the Shell and as such it has little functionality on its own.\n\
Nevertheless it’s possible to customize the greeting message.");

        this.add(new Gtk.Label({ label: primaryText,
                                 wrap: true, xalign: 0 }));
    }
});

function buildPrefsWidget() {
    let widget = new ExamplePrefsWidget();
    widget.show_all();

    return widget;
}
