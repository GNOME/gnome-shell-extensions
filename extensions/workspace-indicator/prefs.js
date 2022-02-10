// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-
/* exported init buildPrefsWidget */

const { Adw, Gio, GLib, GObject, Gtk, Pango } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;

const _ = ExtensionUtils.gettext;
const N_ = e => e;

const WORKSPACE_SCHEMA = 'org.gnome.desktop.wm.preferences';
const WORKSPACE_KEY = 'workspace-names';

class WorkspaceSettingsWidget extends Adw.PreferencesGroup {
    static {
        GObject.registerClass(this);

        this.install_action('workspaces.add', null,
            self => self._addNewName());
        this.install_action('workspaces.remove', 's',
            (self, name, param) => self._removeName(param.unpack()));
        this.install_action('workspaces.update', null,
            self => self._saveNames());
    }

    constructor() {
        super({
            title: _('Workspace Names'),
        });

        this._list = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.NONE,
            css_classes: ['boxed-list'],
        });
        this._list.connect('row-activated', (l, row) => row.edit());
        this.add(this._list);

        this._list.append(new NewWorkspaceRow());

        this._settings = new Gio.Settings({
            schema_id: WORKSPACE_SCHEMA,
        });
        this._settings.connect(`changed::${WORKSPACE_KEY}`,
            this._sync.bind(this));
        this._sync();
    }

    _addNewName() {
        const names = this._settings.get_strv(WORKSPACE_KEY);
        this._settings.set_strv(WORKSPACE_KEY, [
            ...names,
            _('Workspace %d').format(names.length + 1),
        ]);
    }

    _removeName(removedName) {
        this._settings.set_strv(WORKSPACE_KEY,
            this._settings.get_strv(WORKSPACE_KEY)
                .filter(name => name !== removedName));
    }

    _saveNames() {
        const names = this._getWorkspaceRows().map(row => row.name);
        this._settings.set_strv(WORKSPACE_KEY, names);
    }

    _getWorkspaceRows() {
        return [...this._list].filter(row => row.name);
    }

    _sync() {
        const rows = this._getWorkspaceRows();

        const oldNames = rows.map(row => row.name);
        const newNames = this._settings.get_strv(WORKSPACE_KEY);

        const removed = oldNames.filter(n => !newNames.includes(n));
        const added = newNames.filter(n => !oldNames.includes(n));

        removed.forEach(n => this._list.remove(rows.find(r => r.name === n)));
        added.forEach(n => {
            this._list.insert(new WorkspaceRow(n), newNames.indexOf(n));
        });
    }
}

class WorkspaceRow extends Adw.PreferencesRow {
    static {
        GObject.registerClass(this);
    }

    constructor(name) {
        super({ name });

        const box = new Gtk.Box({
            spacing: 12,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 6,
            margin_end: 6,
        });

        const label = new Gtk.Label({
            hexpand: true,
            xalign: 0,
            max_width_chars: 25,
            ellipsize: Pango.EllipsizeMode.END,
        });
        this.bind_property('name', label, 'label',
            GObject.BindingFlags.SYNC_CREATE);
        box.append(label);

        const button = new Gtk.Button({
            action_name: 'workspaces.remove',
            action_target: new GLib.Variant('s', name),
            icon_name: 'edit-delete-symbolic',
            has_frame: false,
        });
        box.append(button);

        this._entry = new Gtk.Entry({
            max_width_chars: 25,
        });

        const controller = new Gtk.ShortcutController();
        controller.add_shortcut(new Gtk.Shortcut({
            trigger: Gtk.ShortcutTrigger.parse_string('Escape'),
            action: Gtk.CallbackAction.new(() => {
                this._stopEdit();
                return true;
            }),
        }));
        this._entry.add_controller(controller);

        this._stack = new Gtk.Stack();
        this._stack.add_named(box, 'display');
        this._stack.add_named(this._entry, 'edit');
        this.child = this._stack;

        this._entry.connect('activate', () => {
            this.name = this._entry.text;
            this._stopEdit();
        });
        this._entry.connect('notify::has-focus', () => {
            if (this._entry.has_focus)
                return;
            this._stopEdit();
        });

        this.connect('notify::name', () => {
            button.action_target = new GLib.Variant('s', this.name);
            this.activate_action('workspaces.update', null);
        });
    }

    edit() {
        this._entry.text = this.name;
        this._entry.grab_focus();
        this._stack.visible_child_name = 'edit';
    }

    _stopEdit() {
        this.grab_focus();
        this._stack.visible_child_name = 'display';
    }
}

class NewWorkspaceRow extends Adw.PreferencesRow {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({
            action_name: 'workspaces.add',
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
            [Gtk.AccessibleProperty.LABEL], [_('Add Workspace')]);
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
    return new WorkspaceSettingsWidget();
}
