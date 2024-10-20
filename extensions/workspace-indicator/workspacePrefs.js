// SPDX-FileCopyrightText: 2012 Giovanni Campagna <gcampagna@src.gnome.org>
// SPDX-FileCopyrightText: 2014 Florian Müllner <fmuellner@gnome.org>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const N_ = e => e;

const WORKSPACE_SCHEMA = 'org.gnome.desktop.wm.preferences';
const WORKSPACE_KEY = 'workspace-names';

class GeneralGroup extends Adw.PreferencesGroup {
    static {
        GObject.registerClass(this);
    }

    constructor(settings) {
        super();

        const row = new Adw.SwitchRow({
            title: _('Show Previews'),
        });
        this.add(row);

        settings.bind('embed-previews',
            row, 'active',
            Gio.SettingsBindFlags.DEFAULT);
    }
}

class NewItem extends GObject.Object {}
GObject.registerClass(NewItem);

class NewItemModel extends GObject.Object {
    static [GObject.interfaces] = [Gio.ListModel];
    static {
        GObject.registerClass(this);
    }

    #item = new NewItem();

    vfunc_get_item_type() {
        return NewItem;
    }

    vfunc_get_n_items() {
        return 1;
    }

    vfunc_get_item(_pos) {
        return this.#item;
    }
}

class WorkspacesList extends GObject.Object {
    static [GObject.interfaces] = [Gio.ListModel];
    static {
        GObject.registerClass(this);
    }

    #settings = new Gio.Settings({schema_id: WORKSPACE_SCHEMA});
    #names = this.#settings.get_strv(WORKSPACE_KEY);
    #items = Gtk.StringList.new(this.#names);
    #changedId;

    constructor() {
        super();

        this.#changedId =
            this.#settings.connect(`changed::${WORKSPACE_KEY}`, () => {
                const removed = this.#names.length;
                this.#names = this.#settings.get_strv(WORKSPACE_KEY);
                this.#items.splice(0, removed, this.#names);
                this.items_changed(0, removed, this.#names.length);
            });
    }

    append() {
        const name = _('Workspace %d').format(this.#names.length + 1);

        this.#names.push(name);
        this.#settings.block_signal_handler(this.#changedId);
        this.#settings.set_strv(WORKSPACE_KEY, this.#names);
        this.#settings.unblock_signal_handler(this.#changedId);

        const pos = this.#items.get_n_items();
        this.#items.append(name);
        this.items_changed(pos, 0, 1);
    }

    remove(name) {
        const pos = this.#names.indexOf(name);
        if (pos < 0)
            return;

        this.#names.splice(pos, 1);

        this.#settings.block_signal_handler(this.#changedId);
        this.#settings.set_strv(WORKSPACE_KEY, this.#names);
        this.#settings.unblock_signal_handler(this.#changedId);

        this.#items.remove(pos);
        this.items_changed(pos, 1, 0);
    }

    rename(oldName, newName) {
        const pos = this.#names.indexOf(oldName);
        if (pos < 0)
            return;

        this.#names.splice(pos, 1, newName);
        this.#items.splice(pos, 1, [newName]);

        this.#settings.block_signal_handler(this.#changedId);
        this.#settings.set_strv(WORKSPACE_KEY, this.#names);
        this.#settings.unblock_signal_handler(this.#changedId);
    }

    vfunc_get_item_type() {
        return Gtk.StringObject;
    }

    vfunc_get_n_items() {
        return this.#items.get_n_items();
    }

    vfunc_get_item(pos) {
        return this.#items.get_item(pos);
    }
}

class WorkspacesGroup extends Adw.PreferencesGroup {
    static {
        GObject.registerClass(this);

        this.install_action('workspaces.add', null,
            self => self._workspaces.append());
        this.install_action('workspaces.remove', 's',
            (self, name, param) => self._workspaces.remove(param.unpack()));
        this.install_action('workspaces.rename', '(ss)',
            (self, name, param) => self._workspaces.rename(...param.deepUnpack()));
    }

    constructor() {
        super({
            title: _('Workspace Names'),
        });

        this._workspaces = new WorkspacesList();

        const store = new Gio.ListStore({item_type: Gio.ListModel});
        const listModel = new Gtk.FlattenListModel({model: store});
        store.append(this._workspaces);
        store.append(new NewItemModel());

        this._list = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.NONE,
            css_classes: ['boxed-list'],
        });
        this.add(this._list);

        const newRowProps = {
            title: _('Add Workspace'),
            action_name: 'workspaces.add',
            start_icon_name: 'list-add-symbolic',
        };

        this._list.bind_model(listModel, item => {
            return item instanceof NewItem
                ? new Adw.ButtonRow({...newRowProps})
                : new WorkspaceRow(item.string);
        });
    }
}

class WorkspaceRow extends Adw.EntryRow {
    static {
        GObject.registerClass(this);
    }

    constructor(name) {
        super({
            name,
            text: name,
        });

        const button = new Gtk.Button({
            tooltip_text: _('Remove'),
            action_name: 'workspaces.remove',
            icon_name: 'edit-delete-symbolic',
            has_frame: false,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
        });
        this.add_suffix(button);

        this.bind_property_full('name',
            button, 'action-target',
            GObject.BindingFlags.SYNC_CREATE,
            (bind, target) => [true, new GLib.Variant('s', target)],
            null);

        this.connect('changed', () => {
            this.activate_action('workspaces.rename',
                new GLib.Variant('(ss)', [this.name, this.text]));
            this.name = this.text;
        });
    }
}

export class WorkspacesPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass(this);
    }

    constructor(settings) {
        super({
            title: _('Workspaces'),
            icon_name: 'view-grid-symbolic',
        });

        this.add(new GeneralGroup(settings));
        this.add(new WorkspacesGroup());
    }
}
