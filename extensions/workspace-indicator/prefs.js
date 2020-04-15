// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-
/* exported init buildPrefsWidget */

const { Gio, GLib, GObject, Gtk, Pango } = imports.gi;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;
const N_ = e => e;

const ExtensionUtils = imports.misc.extensionUtils;

const WORKSPACE_SCHEMA = 'org.gnome.desktop.wm.preferences';
const WORKSPACE_KEY = 'workspace-names';

const WorkspaceSettingsWidget = GObject.registerClass(
class WorkspaceSettingsWidget extends Gtk.ScrolledWindow {
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
        this.set_child(box);

        box.append(new Gtk.Label({
            label: '<b>%s</b>'.format(_('Workspace Names')),
            use_markup: true,
            halign: Gtk.Align.START,
        }));

        this._list = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.NONE,
            valign: Gtk.Align.START,
            show_separators: true,
        });
        this._list.connect('row-activated', (l, row) => row.edit());
        box.append(this._list);

        const context = this._list.get_style_context();
        const cssProvider = new Gtk.CssProvider();
        cssProvider.load_from_data(
            'list { min-width: 25em; }');

        context.add_provider(cssProvider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        context.add_class('frame');

        this._list.append(new NewWorkspaceRow());

        this._actionGroup = new Gio.SimpleActionGroup();
        this._list.insert_action_group('workspaces', this._actionGroup);

        let action;
        action = new Gio.SimpleAction({ name: 'add' });
        action.connect('activate', () => {
            const names = this._settings.get_strv(WORKSPACE_KEY);
            this._settings.set_strv(WORKSPACE_KEY, [
                ...names,
                _('Workspace %d').format(names.length + 1),
            ]);
        });
        this._actionGroup.add_action(action);

        action = new Gio.SimpleAction({
            name: 'remove',
            parameter_type: new GLib.VariantType('s'),
        });
        action.connect('activate', (a, param) => {
            const removed = param.deepUnpack();
            this._settings.set_strv(WORKSPACE_KEY,
                this._settings.get_strv(WORKSPACE_KEY)
                    .filter(name => name !== removed));
        });
        this._actionGroup.add_action(action);

        action = new Gio.SimpleAction({ name: 'update' });
        action.connect('activate', () => {
            const names = this._getWorkspaceRows().map(row => row.name);
            this._settings.set_strv(WORKSPACE_KEY, names);
        });
        this._actionGroup.add_action(action);

        this._settings = new Gio.Settings({
            schema_id: WORKSPACE_SCHEMA,
        });
        this._settings.connect(`changed::${WORKSPACE_KEY}`,
            this._sync.bind(this));
        this._sync();
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
});

const WorkspaceRow = GObject.registerClass(
class WorkspaceRow extends Gtk.ListBoxRow {
    _init(name) {
        super._init({ name });

        const controller = new Gtk.ShortcutController();
        controller.add_shortcut(new Gtk.Shortcut({
            trigger: Gtk.ShortcutTrigger.parse_string('Escape'),
            action: Gtk.CallbackAction.new(this._stopEdit.bind(this)),
        }));
        this.add_controller(controller);

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
        });
        box.append(button);

        this._entry = new Gtk.Entry({
            max_width_chars: 25,
        });

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
});

const NewWorkspaceRow = GObject.registerClass(
class NewWorkspaceRow extends Gtk.ListBoxRow {
    _init() {
        super._init({
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
});

function init() {
    ExtensionUtils.initTranslations();
}

function buildPrefsWidget() {
    return new WorkspaceSettingsWidget();
}
