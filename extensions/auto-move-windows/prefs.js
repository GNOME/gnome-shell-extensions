// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-
// Start apps on custom workspaces
/* exported init buildPrefsWidget */

const { Gio, GLib, GObject, Gtk, Pango } = imports.gi;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;

const SETTINGS_KEY = 'application-list';

const WORKSPACE_MAX = 36; // compiled in limit of mutter

const AutoMoveSettingsWidget = GObject.registerClass(
class AutoMoveSettingsWidget extends Gtk.ScrolledWindow {
    _init() {
        super._init({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
        });

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            halign: Gtk.Align.CENTER,
            spacing: 12,
            margin_top: 36,
            margin_bottom: 36,
            margin_start: 36,
            margin_end: 36,
        });
        this.add(box);

        box.add(new Gtk.Label({
            label: '<b>%s</b>'.format(_('Workspace Rules')),
            use_markup: true,
            halign: Gtk.Align.START,
        }));

        this._list = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.NONE,
            valign: Gtk.Align.START,
        });
        this._list.set_header_func(this._updateHeader.bind(this));
        box.add(this._list);

        const context = this._list.get_style_context();
        const cssProvider = new Gtk.CssProvider();
        cssProvider.load_from_data(
            'list { min-width: 30em; }');

        context.add_provider(cssProvider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        context.add_class('frame');

        this._list.add(new NewRuleRow());

        this._actionGroup = new Gio.SimpleActionGroup();
        this._list.insert_action_group('rules', this._actionGroup);

        let action;
        action = new Gio.SimpleAction({ name: 'add' });
        action.connect('activate', this._onAddActivated.bind(this));
        this._actionGroup.add_action(action);

        action = new Gio.SimpleAction({
            name: 'remove',
            parameter_type: new GLib.VariantType('s'),
        });
        action.connect('activate', this._onRemoveActivated.bind(this));
        this._actionGroup.add_action(action);

        action = new Gio.SimpleAction({ name: 'update' });
        action.connect('activate', () => {
            this._settings.set_strv(SETTINGS_KEY,
                this._getRuleRows().map(row => `${row.id}:${row.value}`));
        });
        this._actionGroup.add_action(action);
        this._updateAction = action;

        this._settings = ExtensionUtils.getSettings();
        this._changedId = this._settings.connect('changed',
            this._sync.bind(this));
        this._sync();

        this.connect('destroy', () => this._settings.run_dispose());

        this.show_all();
    }

    _onAddActivated() {
        const dialog = new NewRuleDialog(this.get_toplevel());
        dialog.connect('response', (dlg, id) => {
            const appInfo = id === Gtk.ResponseType.OK
                ? dialog.get_widget().get_app_info() : null;
            if (appInfo) {
                this._settings.set_strv(SETTINGS_KEY, [
                    ...this._settings.get_strv(SETTINGS_KEY),
                    `${appInfo.get_id()}:1`,
                ]);
            }
            dialog.destroy();
        });
    }

    _onRemoveActivated(action, param) {
        const removed = param.deepUnpack();
        this._settings.set_strv(SETTINGS_KEY,
            this._settings.get_strv(SETTINGS_KEY).filter(entry => {
                const [id] = entry.split(':');
                return id !== removed;
            }));
    }

    _getRuleRows() {
        return this._list.get_children().filter(row => !!row.id);
    }

    _sync() {
        const oldRules = this._getRuleRows();
        const newRules = this._settings.get_strv(SETTINGS_KEY).map(entry => {
            const [id, value] = entry.split(':');
            return { id, value };
        });

        this._settings.block_signal_handler(this._changedId);
        this._updateAction.enabled = false;

        newRules.forEach(({ id, value }, index) => {
            const row = oldRules.find(r => r.id === id);
            const appInfo = row
                ? null : Gio.DesktopAppInfo.new(id);

            if (row)
                row.set({ value });
            else if (appInfo)
                this._list.insert(new RuleRow(appInfo, value), index);
        });

        const removed = oldRules.filter(
            ({ id }) => !newRules.find(r => r.id === id));
        removed.forEach(r => r.destroy());

        this._settings.unblock_signal_handler(this._changedId);
        this._updateAction.enabled = true;
    }

    _updateHeader(row, before) {
        if (!before || row.get_header())
            return;
        row.set_header(new Gtk.Separator());
    }
});

const RuleRow = GObject.registerClass({
    Properties: {
        'id': GObject.ParamSpec.string(
            'id', 'id', 'id',
            GObject.ParamFlags.READABLE,
            ''),
        'value': GObject.ParamSpec.uint(
            'value', 'value', 'value',
            GObject.ParamFlags.READWRITE,
            1, WORKSPACE_MAX, 1),
    },
}, class RuleRow extends Gtk.ListBoxRow {
    _init(appInfo, value) {
        super._init({
            activatable: false,
            value,
        });
        this._appInfo = appInfo;

        const box = new Gtk.Box({
            spacing: 6,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 6,
            margin_end: 6,
        });

        const icon = new Gtk.Image({
            gicon: appInfo.get_icon(),
            pixel_size: 32,
        });
        icon.get_style_context().add_class('icon-dropshadow');
        box.add(icon);

        const label = new Gtk.Label({
            label: appInfo.get_display_name(),
            halign: Gtk.Align.START,
            hexpand: true,
            max_width_chars: 20,
            ellipsize: Pango.EllipsizeMode.END,
        });
        box.add(label);

        const spinButton = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: WORKSPACE_MAX,
                step_increment: 1,
            }),
            snap_to_ticks: true,
            margin_end: 6,
        });
        this.bind_property('value',
            spinButton, 'value',
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL);
        box.add(spinButton);

        const button = new Gtk.Button({
            action_name: 'rules.remove',
            action_target: new GLib.Variant('s', this.id),
            image: new Gtk.Image({
                icon_name: 'edit-delete-symbolic',
                pixel_size: 16,
            }),
        });
        box.add(button);

        this.add(box);

        this.connect('notify::value', () => {
            const actionGroup = this.get_action_group('rules');
            actionGroup.activate_action('update', null);
        });

        this.show_all();
    }

    get id() {
        return this._appInfo.get_id();
    }
});

const NewRuleRow = GObject.registerClass(
class NewRuleRow extends Gtk.ListBoxRow {
    _init() {
        super._init({
            action_name: 'rules.add',
        });
        this.get_accessible().set_name(_('Add Rule'));

        this.add(new Gtk.Image({
            icon_name: 'list-add-symbolic',
            pixel_size: 16,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        }));

        this.show_all();
    }
});

const NewRuleDialog = GObject.registerClass(
class NewRuleDialog extends Gtk.AppChooserDialog {
    _init(parent) {
        super._init({
            transient_for: parent,
            modal: true,
        });

        this._settings = ExtensionUtils.getSettings();

        this.get_widget().set({
            show_all: true,
            show_other: true, // hide more button
        });

        this.get_widget().connect('application-selected',
            this._updateSensitivity.bind(this));
        this._updateSensitivity();

        this.show();
    }

    _updateSensitivity() {
        const rules = this._settings.get_strv(SETTINGS_KEY);
        const appInfo = this.get_widget().get_app_info();
        this.set_response_sensitive(Gtk.ResponseType.OK,
            appInfo && !rules.some(i => i.startsWith(appInfo.get_id())));
    }
});

function init() {
    ExtensionUtils.initTranslations();
}

function buildPrefsWidget() {
    return new AutoMoveSettingsWidget();
}
