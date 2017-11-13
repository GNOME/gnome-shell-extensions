// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;
const N_ = e => e;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const WORKSPACE_SCHEMA = 'org.gnome.desktop.wm.preferences';
const WORKSPACE_KEY = 'workspace-names';

const WorkspaceNameModel = GObject.registerClass(
class WorkspaceNameModel extends Gtk.ListStore {
    _init(params) {
        super._init(params);
        this.set_column_types([GObject.TYPE_STRING]);

        this.Columns = {
            LABEL: 0,
        };

        this._settings = new Gio.Settings({ schema_id: WORKSPACE_SCHEMA });
        //this._settings.connect('changed::workspace-names', this._reloadFromSettings.bind(this));

        this._reloadFromSettings();

        // overriding class closure doesn't work, because GtkTreeModel
        // plays tricks with marshallers and class closures
        this.connect('row-changed', this._onRowChanged.bind(this));
        this.connect('row-inserted', this._onRowInserted.bind(this));
        this.connect('row-deleted', this._onRowDeleted.bind(this));
    }

    _reloadFromSettings() {
        if (this._preventChanges)
            return;
        this._preventChanges = true;

        let newNames = this._settings.get_strv(WORKSPACE_KEY);

        let i = 0;
        let [ok, iter] = this.get_iter_first();
        while (ok && i < newNames.length) {
            this.set(iter, [this.Columns.LABEL], [newNames[i]]);

            ok = this.iter_next(iter);
            i++;
        }

        while (ok)
            ok = this.remove(iter);

        for ( ; i < newNames.length; i++) {
            iter = this.append();
            this.set(iter, [this.Columns.LABEL], [newNames[i]]);
        }

        this._preventChanges = false;
    }

    _onRowChanged(self, path, iter) {
        if (this._preventChanges)
            return;
        this._preventChanges = true;

        let index = path.get_indices()[0];
        let names = this._settings.get_strv(WORKSPACE_KEY);

        if (index >= names.length) {
            // fill with blanks
            for (let i = names.length; i <= index; i++)
                names[i] = '';
        }

        names[index] = this.get_value(iter, this.Columns.LABEL);

        this._settings.set_strv(WORKSPACE_KEY, names);

        this._preventChanges = false;
    }

    _onRowInserted(self, path, iter) {
        if (this._preventChanges)
            return;
        this._preventChanges = true;

        let index = path.get_indices()[0];
        let names = this._settings.get_strv(WORKSPACE_KEY);
        let label = this.get_value(iter, this.Columns.LABEL) || '';
        names.splice(index, 0, label);

        this._settings.set_strv(WORKSPACE_KEY, names);

        this._preventChanges = false;
    }

    _onRowDeleted(self, path) {
        if (this._preventChanges)
            return;
        this._preventChanges = true;

        let index = path.get_indices()[0];
        let names = this._settings.get_strv(WORKSPACE_KEY);

        if (index >= names.length)
            return;

        names.splice(index, 1);

        // compact the array
        for (let i = names.length -1; i >= 0 && !names[i]; i++)
            names.pop();

        this._settings.set_strv(WORKSPACE_KEY, names);

        this._preventChanges = false;
    }
});

const WorkspaceSettingsWidget = GObject.registerClass(
class WorkspaceSettingsWidget extends Gtk.Grid {
    _init(params) {
        super._init(params);
        this.margin = 12;
        this.orientation = Gtk.Orientation.VERTICAL;

        this.add(new Gtk.Label({ label: '<b>' + _("Workspace Names") + '</b>',
                                 use_markup: true, margin_bottom: 6,
                                 hexpand: true, halign: Gtk.Align.START }));

        let scrolled = new Gtk.ScrolledWindow({ shadow_type: Gtk.ShadowType.IN });
        scrolled.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC);
        this.add(scrolled);

        this._store = new WorkspaceNameModel();
        this._treeView = new Gtk.TreeView({ model: this._store,
                                            headers_visible: false,
                                            reorderable: true,
                                            hexpand: true,
                                            vexpand: true
                                          });

        let column = new Gtk.TreeViewColumn({ title: _("Name") });
        let renderer = new Gtk.CellRendererText({ editable: true });
        renderer.connect('edited', this._cellEdited.bind(this));
        column.pack_start(renderer, true);
        column.add_attribute(renderer, 'text', this._store.Columns.LABEL);
        this._treeView.append_column(column);

        scrolled.add(this._treeView);

        let toolbar = new Gtk.Toolbar({ icon_size: Gtk.IconSize.SMALL_TOOLBAR });
        toolbar.get_style_context().add_class(Gtk.STYLE_CLASS_INLINE_TOOLBAR);

        let newButton = new Gtk.ToolButton({ icon_name: 'list-add-symbolic' });
        newButton.connect('clicked', this._newClicked.bind(this));
        toolbar.add(newButton);

        let delButton = new Gtk.ToolButton({ icon_name: 'list-remove-symbolic' });
        delButton.connect('clicked', this._delClicked.bind(this));
        toolbar.add(delButton);

        let selection = this._treeView.get_selection();
        selection.connect('changed', () => {
            delButton.sensitive = selection.count_selected_rows() > 0;
        });
        delButton.sensitive = selection.count_selected_rows() > 0;

        this.add(toolbar);
    }

    _cellEdited(renderer, path, new_text) {
        let [ok, iter] = this._store.get_iter_from_string(path);

        if (ok)
            this._store.set(iter, [this._store.Columns.LABEL], [new_text]);
    }

    _newClicked() {
        let iter = this._store.append();
        let index = this._store.get_path(iter).get_indices()[0];

        let label = _("Workspace %d").format(index + 1);
        this._store.set(iter, [this._store.Columns.LABEL], [label]);
    }

    _delClicked() {
        let [any, model, iter] = this._treeView.get_selection().get_selected();

        if (any)
            this._store.remove(iter);
    }
});

function init() {
    Convenience.initTranslations();
}

function buildPrefsWidget() {
    let widget = new WorkspaceSettingsWidget();
    widget.show_all();

    return widget;
}
