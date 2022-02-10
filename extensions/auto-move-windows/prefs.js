// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-
// Start apps on custom workspaces
/* exported init buildPrefsWidget */

const { Adw, Gio, GLib, GObject, Gtk } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;

const _ = ExtensionUtils.gettext;

const SETTINGS_KEY = 'application-list';

const WORKSPACE_MAX = 36; // compiled in limit of mutter

class AutoMoveSettingsWidget extends Adw.PreferencesGroup {
    static {
        GObject.registerClass(this);

        this.install_action('rules.add', null, self => self._addNewRule());
        this.install_action('rules.remove', 's',
            (self, name, param) => self._removeRule(param.unpack()));
        this.install_action('rules.update', null, self => self._saveRules());
    }

    constructor() {
        super({
            title: _('Workspace Rules'),
        });

        this._list = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.NONE,
            css_classes: ['boxed-list'],
        });
        this.add(this._list);

        this._list.append(new NewRuleRow());

        this._settings = ExtensionUtils.getSettings();
        this._changedId = this._settings.connect('changed',
            this._sync.bind(this));
        this._sync();

        this.connect('destroy', () => this._settings.run_dispose());
    }

    _addNewRule() {
        const dialog = new NewRuleDialog(this.get_root());
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
        dialog.show();
    }

    _removeRule(removedId) {
        this._settings.set_strv(SETTINGS_KEY,
            this._settings.get_strv(SETTINGS_KEY).filter(entry => {
                const [id] = entry.split(':');
                return id !== removedId;
            }));
    }

    _saveRules() {
        this._settings.set_strv(SETTINGS_KEY,
            this._getRuleRows().map(row => `${row.id}:${row.value}`));
    }

    _getRuleRows() {
        return [...this._list].filter(row => !!row.id);
    }

    _sync() {
        const oldRules = this._getRuleRows();
        const newRules = this._settings.get_strv(SETTINGS_KEY).map(entry => {
            const [id, value] = entry.split(':');
            return { id, value };
        });

        this._settings.block_signal_handler(this._changedId);
        this.action_set_enabled('rules.update', false);

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
        removed.forEach(r => this._list.remove(r));

        this._settings.unblock_signal_handler(this._changedId);
        this.action_set_enabled('rules.update', true);
    }
}

class WorkspaceSelector extends Gtk.Widget {
    static [GObject.properties] = {
        'number': GObject.ParamSpec.uint(
            'number', 'number', 'number',
            GObject.ParamFlags.READWRITE,
            1, WORKSPACE_MAX, 1),
    };

    static {
        GObject.registerClass(this);

        this.set_layout_manager_type(Gtk.BoxLayout);
    }

    constructor() {
        super();

        this.layout_manager.spacing = 6;

        const label = new Gtk.Label({
            xalign: 1,
            margin_end: 6,
        });
        this.bind_property('number',
            label, 'label',
            GObject.BindingFlags.SYNC_CREATE);
        label.set_parent(this);

        const buttonProps = {
            css_classes: ['circular'],
            valign: Gtk.Align.CENTER,
        };

        this._decButton = new Gtk.Button({
            icon_name: 'list-remove-symbolic',
            ...buttonProps,
        });
        this._decButton.set_parent(this);
        this._decButton.connect('clicked', () => this.number--);

        this._incButton = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            ...buttonProps,
        });
        this._incButton.set_parent(this);
        this._incButton.connect('clicked', () => this.number++);

        this.connect('notify::number', () => this._syncButtons());
        this._syncButtons();
    }

    _syncButtons() {
        this._decButton.sensitive = this.number > 1;
        this._incButton.sensitive = this.number < WORKSPACE_MAX;
    }
}

class RuleRow extends Adw.ActionRow {
    static [GObject.properties] = {
        'id': GObject.ParamSpec.string(
            'id', 'id', 'id',
            GObject.ParamFlags.READABLE,
            ''),
        'value': GObject.ParamSpec.uint(
            'value', 'value', 'value',
            GObject.ParamFlags.READWRITE,
            1, WORKSPACE_MAX, 1),
    };

    static {
        GObject.registerClass(this);
    }

    constructor(appInfo, value) {
        super({
            activatable: false,
            title: appInfo.get_display_name(),
            value,
        });
        this._appInfo = appInfo;

        const icon = new Gtk.Image({
            css_classes: ['icon-dropshadow'],
            gicon: appInfo.get_icon(),
            pixel_size: 32,
        });
        this.add_prefix(icon);

        const wsButton = new WorkspaceSelector();
        this.bind_property('value',
            wsButton, 'number',
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL);
        this.add_suffix(wsButton);

        const button = new Gtk.Button({
            action_name: 'rules.remove',
            action_target: new GLib.Variant('s', this.id),
            icon_name: 'edit-delete-symbolic',
            has_frame: false,
            valign: Gtk.Align.CENTER,
        });
        this.add_suffix(button);

        this.connect('notify::value',
            () => this.activate_action('rules.update', null));
    }

    get id() {
        return this._appInfo.get_id();
    }
}

class NewRuleRow extends Gtk.ListBoxRow {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({
            action_name: 'rules.add',
            child: new Gtk.Image({
                icon_name: 'list-add-symbolic',
                pixel_size: 16,
                margin_top: 12,
                margin_bottom: 12,
                margin_start: 12,
                margin_end: 12,
            }),
        });
        this.update_property(
            [Gtk.AccessibleProperty.LABEL], [_('Add Rule')]);
    }
}

class NewRuleDialog extends Gtk.AppChooserDialog {
    static {
        GObject.registerClass(this);
    }

    constructor(parent) {
        super({
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
    }

    _updateSensitivity() {
        const rules = this._settings.get_strv(SETTINGS_KEY);
        const appInfo = this.get_widget().get_app_info();
        this.set_response_sensitive(Gtk.ResponseType.OK,
            appInfo && !rules.some(i => i.startsWith(appInfo.get_id())));
    }
}

/** */
function init() {
    ExtensionUtils.initTranslations();
}

/**
 * @returns {Gtk.Widget} - the prefs widget
 */
function buildPrefsWidget() {
    return new AutoMoveSettingsWidget();
}
