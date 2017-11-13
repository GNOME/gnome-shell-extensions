// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-
// Start apps on custom workspaces

const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;
const N_ = e => e;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const SETTINGS_KEY = 'application-list';

const WORKSPACE_MAX = 36; // compiled in limit of mutter

const Columns = {
    APPINFO: 0,
    DISPLAY_NAME: 1,
    ICON: 2,
    WORKSPACE: 3,
    ADJUSTMENT: 4
};

const Widget = GObject.registerClass({
    GTypeName: 'AutoMoveWindowsPrefsWidget',
}, class Widget extends Gtk.Grid {
    _init(params) {
        super._init(params);
        this.set_orientation(Gtk.Orientation.VERTICAL);

        this._settings = Convenience.getSettings();
        this._settings.connect('changed', this._refresh.bind(this));
        this._changedPermitted = false;

        this._store = new Gtk.ListStore();
        this._store.set_column_types([Gio.AppInfo, GObject.TYPE_STRING, Gio.Icon, GObject.TYPE_INT,
                                      Gtk.Adjustment]);

        let scrolled = new Gtk.ScrolledWindow({ shadow_type: Gtk.ShadowType.IN});
        scrolled.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC);
        this.add(scrolled);


        this._treeView = new Gtk.TreeView({ model: this._store,
                                            hexpand: true, vexpand: true });
        this._treeView.get_selection().set_mode(Gtk.SelectionMode.SINGLE);

        let appColumn = new Gtk.TreeViewColumn({ expand: true, sort_column_id: Columns.DISPLAY_NAME,
                                                 title: _("Application") });
        let iconRenderer = new Gtk.CellRendererPixbuf;
        appColumn.pack_start(iconRenderer, false);
        appColumn.add_attribute(iconRenderer, "gicon", Columns.ICON);
        let nameRenderer = new Gtk.CellRendererText;
        appColumn.pack_start(nameRenderer, true);
        appColumn.add_attribute(nameRenderer, "text", Columns.DISPLAY_NAME);
        this._treeView.append_column(appColumn);

        let workspaceColumn = new Gtk.TreeViewColumn({ title: _("Workspace"),
                                                       sort_column_id: Columns.WORKSPACE });
        let workspaceRenderer = new Gtk.CellRendererSpin({ editable: true });
        workspaceRenderer.connect('edited', this._workspaceEdited.bind(this));
        workspaceColumn.pack_start(workspaceRenderer, true);
        workspaceColumn.add_attribute(workspaceRenderer, "adjustment", Columns.ADJUSTMENT);
        workspaceColumn.add_attribute(workspaceRenderer, "text", Columns.WORKSPACE);
        this._treeView.append_column(workspaceColumn);

        scrolled.add(this._treeView);

        let toolbar = new Gtk.Toolbar({ icon_size: Gtk.IconSize.SMALL_TOOLBAR });
        toolbar.get_style_context().add_class(Gtk.STYLE_CLASS_INLINE_TOOLBAR);
        this.add(toolbar);

        let newButton = new Gtk.ToolButton({ icon_name: 'bookmark-new-symbolic',
                                             label: _("Add Rule"),
                                             is_important: true });
        newButton.connect('clicked', this._createNew.bind(this));
        toolbar.add(newButton);

        let delButton = new Gtk.ToolButton({ icon_name: 'edit-delete-symbolic'  });
        delButton.connect('clicked', this._deleteSelected.bind(this));
        toolbar.add(delButton);

        let selection = this._treeView.get_selection();
        selection.connect('changed', () => {
            delButton.sensitive = selection.count_selected_rows() > 0;
        });
        delButton.sensitive = selection.count_selected_rows() > 0;

        this._changedPermitted = true;
        this._refresh();
    }

    _createNew() {
        let dialog = new Gtk.Dialog({ title: _("Create new matching rule"),
                                      transient_for: this.get_toplevel(),
                                      use_header_bar: true,
                                      modal: true });
        dialog.add_button(Gtk.STOCK_CANCEL, Gtk.ResponseType.CANCEL);
        let addButton = dialog.add_button(_("Add"), Gtk.ResponseType.OK);
        dialog.set_default_response(Gtk.ResponseType.OK);

        let grid = new Gtk.Grid({ column_spacing: 10,
                                  row_spacing: 15,
                                  margin: 10 });
        dialog._appChooser = new Gtk.AppChooserWidget({ show_all: true });
        dialog._appChooser.connect('application-selected', (w, appInfo) => {
            addButton.sensitive = appInfo && this._checkId(appInfo.get_id());
        });
        let appInfo = dialog._appChooser.get_app_info();
        addButton.sensitive = appInfo && this._checkId(appInfo.get_id());

        grid.attach(dialog._appChooser, 0, 0, 2, 1);
        grid.attach(new Gtk.Label({ label: _("Workspace"),
                                    halign: Gtk.Align.END }), 0, 1, 1, 1);
        let adjustment = new Gtk.Adjustment({ lower: 1,
                                              upper: WORKSPACE_MAX,
                                              step_increment: 1
                                            });
        dialog._spin = new Gtk.SpinButton({ adjustment: adjustment,
                                            snap_to_ticks: true });
        dialog._spin.set_value(1);
        grid.attach(dialog._spin, 1, 1, 1, 1);
        dialog.get_content_area().add(grid);

        dialog.connect('response', (dialog, id) => {
            if (id != Gtk.ResponseType.OK) {
                dialog.destroy();
                return;
            }

            let appInfo = dialog._appChooser.get_app_info();
            if (!appInfo)
                return;
            let index = Math.floor(dialog._spin.value);
            if (isNaN(index) || index < 0)
                index = 1;

            this._changedPermitted = false;
            this._appendItem(appInfo.get_id(), index);
            this._changedPermitted = true;

            let iter = this._store.append();
            let adj = new Gtk.Adjustment({ lower: 1,
                                           upper: WORKSPACE_MAX,
                                           step_increment: 1,
                                           value: index });
            this._store.set(iter,
                            [Columns.APPINFO, Columns.ICON, Columns.DISPLAY_NAME, Columns.WORKSPACE, Columns.ADJUSTMENT],
                            [appInfo, appInfo.get_icon(), appInfo.get_display_name(), index, adj]);

            dialog.destroy();
        });
        dialog.show_all();
    }

    _deleteSelected() {
        let [any, model, iter] = this._treeView.get_selection().get_selected();

        if (any) {
            let appInfo = this._store.get_value(iter, Columns.APPINFO);

            this._changedPermitted = false;
            this._removeItem(appInfo.get_id());
            this._changedPermitted = true;
            this._store.remove(iter);
        }
    }

    _workspaceEdited(renderer, pathString, text) {
        let index = parseInt(text);
        if (isNaN(index) || index < 0)
            index = 1;
        let path = Gtk.TreePath.new_from_string(pathString);
        let [model, iter] = this._store.get_iter(path);
        let appInfo = this._store.get_value(iter, Columns.APPINFO);

        this._changedPermitted = false;
        this._changeItem(appInfo.get_id(), index);
        this._store.set_value(iter, Columns.WORKSPACE, index);
        this._changedPermitted = true;
    }

    _refresh() {
        if (!this._changedPermitted)
            // Ignore this notification, model is being modified outside
            return;

        this._store.clear();

        let currentItems = this._settings.get_strv(SETTINGS_KEY);
        let validItems = [ ];
        for (let i = 0; i < currentItems.length; i++) {
            let [id, index] = currentItems[i].split(':');
            let appInfo = Gio.DesktopAppInfo.new(id);
            if (!appInfo)
                continue;
            validItems.push(currentItems[i]);

            let iter = this._store.append();
            let adj = new Gtk.Adjustment({ lower: 1,
                                           upper: WORKSPACE_MAX,
                                           step_increment: 1,
                                           value: index });
            this._store.set(iter,
                            [Columns.APPINFO, Columns.ICON, Columns.DISPLAY_NAME, Columns.WORKSPACE, Columns.ADJUSTMENT],
                            [appInfo, appInfo.get_icon(), appInfo.get_display_name(), parseInt(index), adj]);
        }

        if (validItems.length != currentItems.length) // some items were filtered out
            this._settings.set_strv(SETTINGS_KEY, validItems);
    }

    _checkId(id) {
        let items = this._settings.get_strv(SETTINGS_KEY);
        return !items.some(i => i.startsWith(id + ':'));
    }

    _appendItem(id, workspace) {
        let currentItems = this._settings.get_strv(SETTINGS_KEY);
        currentItems.push(id + ':' + workspace);
        this._settings.set_strv(SETTINGS_KEY, currentItems);
    }

    _removeItem(id) {
        let currentItems = this._settings.get_strv(SETTINGS_KEY);
        let index = currentItems.map(el => el.split(':')[0]).indexOf(id);

        if (index < 0)
            return;
        currentItems.splice(index, 1);
        this._settings.set_strv(SETTINGS_KEY, currentItems);
    }

    _changeItem(id, workspace) {
        let currentItems = this._settings.get_strv(SETTINGS_KEY);
        let index = currentItems.map(el => el.split(':')[0]).indexOf(id);

        if (index < 0)
            currentItems.push(id + ':' + workspace);
        else
            currentItems[index] = id + ':' + workspace;
        this._settings.set_strv(SETTINGS_KEY, currentItems);
    }
});


function init() {
    Convenience.initTranslations();
}

function buildPrefsWidget() {
    let widget = new Widget({ margin: 12 });
    widget.show_all();

    return widget;
}
