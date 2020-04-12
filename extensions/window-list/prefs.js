// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-
/* exported init buildPrefsWidget */

const { Gio, GLib, GObject, Gtk } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;

const _ = ExtensionUtils.gettext;

/** */
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

        this._actionGroup = new Gio.SimpleActionGroup();
        this.insert_action_group('window-list', this._actionGroup);

        this._settings = ExtensionUtils.getSettings();
        this._actionGroup.add_action(
            this._settings.create_action('grouping-mode'));
        this._actionGroup.add_action(
            this._settings.create_action('show-on-all-monitors'));
        this._actionGroup.add_action(
            this._settings.create_action('display-all-workspaces'));

        let groupingLabel = '<b>%s</b>'.format(_('Window Grouping'));
        this.append(new Gtk.Label({
            label: groupingLabel, use_markup: true,
            halign: Gtk.Align.START,
        }));

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_bottom: 12,
        });
        this.append(box);

        const context = box.get_style_context();
        const cssProvider = new Gtk.CssProvider();
        cssProvider.load_from_data(
            'box { padding: 12px; }');

        context.add_provider(cssProvider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        context.add_class('frame');
        context.add_class('view');

        const modes = [
            { mode: 'never', label: _('Never group windows') },
            { mode: 'auto', label: _('Group windows when space is limited') },
            { mode: 'always', label: _('Always group windows') },
        ];
        let group = null;
        for (const { mode, label } of modes) {
            const check = new Gtk.CheckButton({
                action_name: 'window-list.grouping-mode',
                action_target: new GLib.Variant('s', mode),
                label,
                group,
                margin_end: 12,
            });
            group = check;
            box.append(check);
        }

        this.append(new Gtk.CheckButton({
            label: _('Show on all monitors'),
            action_name: 'window-list.show-on-all-monitors',
        }));

        this.append(new Gtk.CheckButton({
            label: _('Show windows from all workspaces'),
            action_name: 'window-list.display-all-workspaces',
        }));
    }
});

/**
 * @returns {Gtk.Widget} - the prefs widget
 */
function buildPrefsWidget() {
    return new WindowListPrefsWidget();
}
