/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Atk = imports.gi.Atk;
const DND = imports.ui.dnd;
const GMenu = imports.gi.GMenu;
const Shell = imports.gi.Shell;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Gtk = imports.gi.Gtk;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Signals = imports.signals;
const Pango = imports.gi.Pango;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const appSys = Shell.AppSystem.get_default();

const APPLICATION_ICON_SIZE = 32;
const HORIZ_FACTOR = 5;
const MENU_HEIGHT_OFFSET = 132;
const NAVIGATION_REGION_OVERSHOOT = 50;

class ActivitiesMenuItem extends PopupMenu.PopupBaseMenuItem {
    constructor(button) {
        super();
        this._button = button;
        this.actor.add_child(new St.Label({ text: _("Activities Overview") }));
    }

    activate(event) {
        this._button.menu.toggle();
        Main.overview.toggle();
        super.activate(event);
    }
};

class ApplicationMenuItem extends PopupMenu.PopupBaseMenuItem {
    constructor(button, app) {
        super();
        this._app = app;
        this._button = button;

        this._iconBin = new St.Bin();
        this.actor.add_child(this._iconBin);

        let appLabel = new St.Label({ text: app.get_name(), y_expand: true,
                                      y_align: Clutter.ActorAlign.CENTER });
        this.actor.add_child(appLabel);
        this.actor.label_actor = appLabel;

        let textureCache = St.TextureCache.get_default();
        let iconThemeChangedId = textureCache.connect('icon-theme-changed',
                                                      this._updateIcon.bind(this));
        this.actor.connect('destroy', () => {
            textureCache.disconnect(iconThemeChangedId);
        });
        this._updateIcon();

        this.actor._delegate = this;
        let draggable = DND.makeDraggable(this.actor);

        let maybeStartDrag = draggable._maybeStartDrag;
        draggable._maybeStartDrag = (event) => {
            if (this._dragEnabled)
                return maybeStartDrag.call(draggable, event);
            return false;
        };

        draggable.connect('drag-begin', () => {
            Shell.util_set_hidden_from_pick(Main.legacyTray.actor, true);
        });
        draggable.connect('drag-end', () => {
            Shell.util_set_hidden_from_pick(Main.legacyTray.actor, false);
        });
    }

    activate(event) {
        this._app.open_new_window(-1);
        this._button.selectCategory(null, null);
        this._button.menu.toggle();
        super.activate(event);
    }

    setActive(active, params) {
        if (active)
            this._button.scrollToButton(this);
        super.setActive(active, params);
    }

    setDragEnabled(enable) {
        this._dragEnabled = enable;
    }

    getDragActor() {
        return this._app.create_icon_texture(APPLICATION_ICON_SIZE);
    }

    getDragActorSource() {
        return this._iconBin;
    }

    _updateIcon() {
        this._iconBin.set_child(this.getDragActor());
    }
};

class CategoryMenuItem extends PopupMenu.PopupBaseMenuItem {
    constructor(button, category) {
        super();
        this._category = category;
        this._button = button;

        this._oldX = -1;
        this._oldY = -1;

        let name;
        if (this._category)
            name = this._category.get_name();
        else
            name = _("Favorites");

        this.actor.add_child(new St.Label({ text: name }));
        this.actor.connect('motion-event', this._onMotionEvent.bind(this));
    }

    activate(event) {
        this._button.selectCategory(this._category, this);
        this._button.scrollToCatButton(this);
        super.activate(event);
    }

    _isNavigatingSubmenu([x, y]) {
        let [posX, posY] = this.actor.get_transformed_position();

        if (this._oldX == -1) {
            this._oldX = x;
            this._oldY = y;
            return true;
        }

        let deltaX = Math.abs(x - this._oldX);
        let deltaY = Math.abs(y - this._oldY);

        this._oldX = x;
        this._oldY = y;

        // If it lies outside the x-coordinates then it is definitely outside.
        if (posX > x || posX + this.actor.width < x)
            return false;

        // If it lies inside the menu item then it is definitely inside.
        if (posY <= y && posY + this.actor.height >= y)
            return true;

        // We want the keep-up triangle only if the movement is more
        // horizontal than vertical.
        if (deltaX * HORIZ_FACTOR < deltaY)
            return false;

        // Check whether the point lies inside triangle ABC, and a similar
        // triangle on the other side of the menu item.
        //
        //   +---------------------+
        //   | menu item           |
        // A +---------------------+ C
        //              P          |
        //                         B

        // Ensure that the point P always lies below line AC so that we can
        // only check for triangle ABC.
        if (posY > y) {
            let offset = posY - y;
            y = posY + this.actor.height + offset;
        }

        // Ensure that A is (0, 0).
        x -= posX;
        y -= posY + this.actor.height;

        // Check which side of line AB the point P lies on by taking the
        // cross-product of AB and AP. See:
        // http://stackoverflow.com/questions/3461453/determine-which-side-of-a-line-a-point-lies
        if (((this.actor.width * y) - (NAVIGATION_REGION_OVERSHOOT * x)) <= 0)
             return true;

        return false;
    }

    _onMotionEvent(actor, event) {
        if (!Clutter.get_pointer_grab()) {
            this._oldX = -1;
            this._oldY = -1;
            Clutter.grab_pointer(this.actor);
        }
        this.actor.hover = true;

        if (this._isNavigatingSubmenu(event.get_coords()))
            return true;

        this._oldX = -1;
        this._oldY = -1;
        this.actor.hover = false;
        Clutter.ungrab_pointer();

        let source = event.get_source();
        if (source instanceof St.Widget)
            source.sync_hover();

        return false;
    }

    setActive(active, params) {
        if (active) {
            this._button.selectCategory(this._category, this);
            this._button.scrollToCatButton(this);
        }
        super.setActive(active, params);
    }
};

class ApplicationsMenu extends PopupMenu.PopupMenu {
    constructor(sourceActor, arrowAlignment, arrowSide, button) {
        super(sourceActor, arrowAlignment, arrowSide);
        this._button = button;
    }

    isEmpty() {
        return false;
    }

    open(animate) {
        this._button.hotCorner.setBarrierSize(0);
        if (this._button.hotCorner.actor) // fallback corner
            this._button.hotCorner.actor.hide();
        super.open(animate);
    }

    close(animate) {
        let size = Main.layoutManager.panelBox.height;
        this._button.hotCorner.setBarrierSize(size);
        if (this._button.hotCorner.actor) // fallback corner
            this._button.hotCorner.actor.show();
        super.close(animate);
    }

    toggle() {
        if (this.isOpen) {
            this._button.selectCategory(null, null);
        } else {
            if (Main.overview.visible)
                Main.overview.hide();
        }
        super.toggle();
    }
};

class DesktopTarget {
    constructor() {
        this._desktop = null;
        this._desktopDestroyedId = 0;

        this._windowAddedId =
            global.window_group.connect('actor-added',
                                        this._onWindowAdded.bind(this));

        global.get_window_actors().forEach(a => {
            this._onWindowAdded(a.get_parent(), a);
        });
    }

    get hasDesktop() {
        return this._desktop != null;
    }

    _onWindowAdded(group, actor) {
        if (!(actor instanceof Meta.WindowActor))
            return;

        if (actor.meta_window.get_window_type() == Meta.WindowType.DESKTOP)
            this._setDesktop(actor);
    }

    _setDesktop(desktop) {
        if (this._desktop) {
            this._desktop.disconnect(this._desktopDestroyedId);
            this._desktopDestroyedId = 0;

            delete this._desktop._delegate;
        }

        this._desktop = desktop;
        this.emit('desktop-changed');

        if (this._desktop) {
            this._desktopDestroyedId = this._desktop.connect('destroy', () => {
                this._setDesktop(null);
            });
            this._desktop._delegate = this;
        }
    }

    _getSourceAppInfo(source) {
        if (!(source instanceof ApplicationMenuItem))
            return null;
        return source._app.app_info;
    }

    _touchFile(file) {
        let queryFlags = Gio.FileQueryInfoFlags.NONE;
        let ioPriority = GLib.PRIORITY_DEFAULT;

        let info = new Gio.FileInfo();
        info.set_attribute_uint64(Gio.FILE_ATTRIBUTE_TIME_ACCESS,
                                  GLib.get_real_time());
        file.set_attributes_async (info, queryFlags, ioPriority, null,
            (o, res) => {
                try {
                    o.set_attributes_finish(res);
                } catch(e) {
                    log('Failed to update access time: ' + e.message);
                }
            });
    }

    _markTrusted(file) {
        let modeAttr = Gio.FILE_ATTRIBUTE_UNIX_MODE;
        let trustedAttr = 'metadata::trusted';
        let queryFlags = Gio.FileQueryInfoFlags.NONE;
        let ioPriority = GLib.PRIORITY_DEFAULT;

        file.query_info_async(modeAttr, queryFlags, ioPriority, null,
            (o, res) => {
                try {
                    let info = o.query_info_finish(res);
                    let mode = info.get_attribute_uint32(modeAttr) | 0o100;

                    info.set_attribute_uint32(modeAttr, mode);
                    info.set_attribute_string(trustedAttr, 'yes');
                    file.set_attributes_async (info, queryFlags, ioPriority, null,
                        (o, res) => {
                            o.set_attributes_finish(res);

                            // Hack: force nautilus to reload file info
                            this._touchFile(file);
                        });
                } catch(e) {
                    log('Failed to mark file as trusted: ' + e.message);
                }
            });
    }

    destroy() {
        if (this._windowAddedId)
            global.window_group.disconnect(this._windowAddedId);
        this._windowAddedId = 0;

        this._setDesktop(null);
    }

    handleDragOver(source, actor, x, y, time) {
        let appInfo = this._getSourceAppInfo(source);
        if (!appInfo)
            return DND.DragMotionResult.CONTINUE;

        return DND.DragMotionResult.COPY_DROP;
    }

    acceptDrop(source, actor, x, y, time) {
        let appInfo = this._getSourceAppInfo(source);
        if (!appInfo)
            return false;

        this.emit('app-dropped');

        let desktop = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP);

        let src = Gio.File.new_for_path(appInfo.get_filename());
        let dst = Gio.File.new_for_path(GLib.build_filenamev([desktop, src.get_basename()]));

        try {
            // copy_async() isn't introspectable :-(
            src.copy(dst, Gio.FileCopyFlags.OVERWRITE, null, null);
            this._markTrusted(dst);
        } catch(e) {
            log('Failed to copy to desktop: ' + e.message);
        }

        return true;
    }
};
Signals.addSignalMethods(DesktopTarget.prototype);

class ApplicationsButton extends PanelMenu.Button {
    constructor() {
        super(1.0, null, false);

        this.setMenu(new ApplicationsMenu(this.actor, 1.0, St.Side.TOP, this));
        Main.panel.menuManager.addMenu(this.menu);

        // At this moment applications menu is not keyboard navigable at
        // all (so not accessible), so it doesn't make sense to set as
        // role ATK_ROLE_MENU like other elements of the panel.
        this.actor.accessible_role = Atk.Role.LABEL;

        let hbox = new St.BoxLayout({ style_class: 'panel-status-menu-box' });

        this._label = new St.Label({ text: _("Applications"),
                                     y_expand: true,
                                     y_align: Clutter.ActorAlign.CENTER });
        hbox.add_child(this._label);
        hbox.add_child(PopupMenu.arrowIcon(St.Side.BOTTOM));

        this.actor.add_actor(hbox);
        this.actor.name = 'panelApplications';
        this.actor.label_actor = this._label;

        this.actor.connect('captured-event', this._onCapturedEvent.bind(this));
        this.actor.connect('destroy', this._onDestroy.bind(this));

        this._showingId = Main.overview.connect('showing', () => {
            this.actor.add_accessible_state (Atk.StateType.CHECKED);
        });
        this._hidingId = Main.overview.connect('hiding', () => {
            this.actor.remove_accessible_state (Atk.StateType.CHECKED);
        });
        Main.layoutManager.connect('startup-complete',
                                   this._setKeybinding.bind(this));
        this._setKeybinding();

        this._desktopTarget = new DesktopTarget();
        this._desktopTarget.connect('app-dropped', () => {
            this.menu.close();
        });
        this._desktopTarget.connect('desktop-changed', () => {
            this._applicationsButtons.forEach(item => {
                item.setDragEnabled(this._desktopTarget.hasDesktop);
            });
        });

        this._tree = new GMenu.Tree({ menu_basename: 'applications.menu' });
        this._treeChangedId = this._tree.connect('changed',
                                                 this._onTreeChanged.bind(this));

        this._applicationsButtons = new Map();
        this.reloadFlag = false;
        this._createLayout();
        this._display();
        this._installedChangedId = appSys.connect('installed-changed',
                                                  this._onTreeChanged.bind(this));
    }

    _onTreeChanged() {
        if (this.menu.isOpen) {
            this._redisplay();
            this.mainBox.show();
        } else {
            this.reloadFlag = true;
        }
    }

    get hotCorner() {
        return Main.layoutManager.hotCorners[Main.layoutManager.primaryIndex];
    }

    _createVertSeparator() {
        let separator = new St.DrawingArea({ style_class: 'calendar-vertical-separator',
                                             pseudo_class: 'highlighted' });
        separator.connect('repaint', this._onVertSepRepaint.bind(this));
        return separator;
    }

    _onDestroy() {
        Main.overview.disconnect(this._showingId);
        Main.overview.disconnect(this._hidingId);
        appSys.disconnect(this._installedChangedId);
        this._tree.disconnect(this._treeChangedId);
        this._tree = null;

        Main.wm.setCustomKeybindingHandler('panel-main-menu',
                                           Shell.ActionMode.NORMAL |
                                           Shell.ActionMode.OVERVIEW,
                                           Main.sessionMode.hasOverview ?
                                           Main.overview.toggle.bind(Main.overview) :
                                           null);

        this._desktopTarget.destroy();
    }

    _onCapturedEvent(actor, event) {
        if (event.type() == Clutter.EventType.BUTTON_PRESS) {
            if (!Main.overview.shouldToggleByCornerOrButton())
                return true;
        }
        return false;
    }

    _onMenuKeyPress(actor, event) {
        let symbol = event.get_key_symbol();
        if (symbol == Clutter.KEY_Left || symbol == Clutter.KEY_Right) {
            let direction = symbol == Clutter.KEY_Left ? Gtk.DirectionType.LEFT
                                                       : Gtk.DirectionType.RIGHT;
            if (this.menu.actor.navigate_focus(global.stage.key_focus, direction, false))
                return true;
        }
        return super._onMenuKeyPress(actor, event);
    }

    _onVertSepRepaint(area) {
        let cr = area.get_context();
        let themeNode = area.get_theme_node();
        let [width, height] = area.get_surface_size();
        let stippleColor = themeNode.get_color('-stipple-color');
        let stippleWidth = themeNode.get_length('-stipple-width');
        let x = Math.floor(width/2) + 0.5;
        cr.moveTo(x, 0);
        cr.lineTo(x, height);
        Clutter.cairo_set_source_color(cr, stippleColor);
        cr.setDash([1, 3], 1); // Hard-code for now
        cr.setLineWidth(stippleWidth);
        cr.stroke();
    }

    _onOpenStateChanged(menu, open) {
       if (open) {
           if (this.reloadFlag) {
               this._redisplay();
               this.reloadFlag = false;
           }
           this.mainBox.show();
       }
       super._onOpenStateChanged(menu, open);
    }

    _setKeybinding() {
        Main.wm.setCustomKeybindingHandler('panel-main-menu',
                                           Shell.ActionMode.NORMAL |
                                           Shell.ActionMode.OVERVIEW,
                                           () => { this.menu.toggle(); });
    }

    _redisplay() {
        this.applicationsBox.destroy_all_children();
        this.categoriesBox.destroy_all_children();
        this._display();
    }

    _loadCategory(categoryId, dir) {
        let iter = dir.iter();
        let nextType;
        while ((nextType = iter.next()) != GMenu.TreeItemType.INVALID) {
            if (nextType == GMenu.TreeItemType.ENTRY) {
                let entry = iter.get_entry();
                let id;
                try {
                    id = entry.get_desktop_file_id(); // catch non-UTF8 filenames
                } catch(e) {
                    continue;
                }
                let app = appSys.lookup_app(id);
                if (!app)
                    app = new Shell.App({ app_info: entry.get_app_info() });
                if (app.get_app_info().should_show())
                    this.applicationsByCategory[categoryId].push(app);
            } else if (nextType == GMenu.TreeItemType.SEPARATOR) {
                this.applicationsByCategory[categoryId].push('separator');
            } else if (nextType == GMenu.TreeItemType.DIRECTORY) {
                let subdir = iter.get_directory();
                if (!subdir.get_is_nodisplay())
                    this._loadCategory(categoryId, subdir);
            }
        }
    }

    scrollToButton(button) {
        let appsScrollBoxAdj = this.applicationsScrollBox.get_vscroll_bar().get_adjustment();
        let appsScrollBoxAlloc = this.applicationsScrollBox.get_allocation_box();
        let currentScrollValue = appsScrollBoxAdj.get_value();
        let boxHeight = appsScrollBoxAlloc.y2 - appsScrollBoxAlloc.y1;
        let buttonAlloc = button.actor.get_allocation_box();
        let newScrollValue = currentScrollValue;
        if (currentScrollValue > buttonAlloc.y1 - 10)
            newScrollValue = buttonAlloc.y1 - 10;
        if (boxHeight + currentScrollValue < buttonAlloc.y2 + 10)
            newScrollValue = buttonAlloc.y2 - boxHeight + 10;
        if (newScrollValue != currentScrollValue)
            appsScrollBoxAdj.set_value(newScrollValue);
    }

    scrollToCatButton(button) {
        let catsScrollBoxAdj = this.categoriesScrollBox.get_vscroll_bar().get_adjustment();
        let catsScrollBoxAlloc = this.categoriesScrollBox.get_allocation_box();
        let currentScrollValue = catsScrollBoxAdj.get_value();
        let boxHeight = catsScrollBoxAlloc.y2 - catsScrollBoxAlloc.y1;
        let buttonAlloc = button.actor.get_allocation_box();
        let newScrollValue = currentScrollValue;
        if (currentScrollValue > buttonAlloc.y1 - 10)
            newScrollValue = buttonAlloc.y1 - 10;
        if (boxHeight + currentScrollValue < buttonAlloc.y2 + 10)
            newScrollValue = buttonAlloc.y2 - boxHeight + 10;
        if (newScrollValue != currentScrollValue)
            catsScrollBoxAdj.set_value(newScrollValue);
    }

    _createLayout() {
        let section = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(section);
        this.mainBox = new St.BoxLayout({ vertical: false });
        this.leftBox = new St.BoxLayout({ vertical: true });
        this.applicationsScrollBox = new St.ScrollView({ x_fill: true, y_fill: false,
                                                         y_align: St.Align.START,
                                                         style_class: 'apps-menu vfade' });
        this.applicationsScrollBox.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC);
        let vscroll = this.applicationsScrollBox.get_vscroll_bar();
        vscroll.connect('scroll-start', () => {
            this.menu.passEvents = true;
        });
        vscroll.connect('scroll-stop', () => {
            this.menu.passEvents = false;
        });
        this.categoriesScrollBox = new St.ScrollView({ x_fill: true, y_fill: false,
                                                       y_align: St.Align.START,
                                                       style_class: 'vfade' });
        this.categoriesScrollBox.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC);
        vscroll = this.categoriesScrollBox.get_vscroll_bar();
        vscroll.connect('scroll-start', () => { this.menu.passEvents = true; });
        vscroll.connect('scroll-stop', () => { this.menu.passEvents = false; });
        this.leftBox.add(this.categoriesScrollBox, { expand: true,
                                                     x_fill: true, y_fill: true,
                                                     y_align: St.Align.START });

        let activities = new ActivitiesMenuItem(this);
        this.leftBox.add(activities.actor, { expand: false,
                                             x_fill: true, y_fill: false,
                                             y_align: St.Align.START });

        this.applicationsBox = new St.BoxLayout({ vertical: true });
        this.applicationsScrollBox.add_actor(this.applicationsBox);
        this.categoriesBox = new St.BoxLayout({ vertical: true });
        this.categoriesScrollBox.add_actor(this.categoriesBox);

        this.mainBox.add(this.leftBox);
        this.mainBox.add(this._createVertSeparator(), { expand: false, x_fill: false, y_fill: true});
        this.mainBox.add(this.applicationsScrollBox, { expand: true, x_fill: true, y_fill: true });
        section.actor.add_actor(this.mainBox);
    }

    _display() {
        this._applicationsButtons.clear();
        this.mainBox.style=('width: 35em;');
        this.mainBox.hide();

        //Load categories
        this.applicationsByCategory = {};
        this._tree.load_sync();
        let root = this._tree.get_root_directory();
        let categoryMenuItem = new CategoryMenuItem(this, null);
        this.categoriesBox.add_actor(categoryMenuItem.actor);
        let iter = root.iter();
        let nextType;
        while ((nextType = iter.next()) != GMenu.TreeItemType.INVALID) {
            if (nextType == GMenu.TreeItemType.DIRECTORY) {
                let dir = iter.get_directory();
                if (!dir.get_is_nodisplay()) {
                    let categoryId = dir.get_menu_id();
                    this.applicationsByCategory[categoryId] = [];
                    this._loadCategory(categoryId, dir);
                    if (this.applicationsByCategory[categoryId].length > 0) {
                        let categoryMenuItem = new CategoryMenuItem(this, dir);
                        this.categoriesBox.add_actor(categoryMenuItem.actor);
                    }
                }
            }
        }

        //Load applications
        this._displayButtons(this._listApplications(null));

        let height = this.categoriesBox.height + MENU_HEIGHT_OFFSET + 'px';
        this.mainBox.style+=('height: ' + height);
    }

    selectCategory(dir, categoryMenuItem) {
        this.applicationsBox.get_children().forEach(c => {
            if (c._delegate instanceof PopupMenu.PopupSeparatorMenuItem)
                c._delegate.destroy();
            else
                this.applicationsBox.remove_actor(c);
        });

        if (dir)
            this._displayButtons(this._listApplications(dir.get_menu_id()));
        else
            this._displayButtons(this._listApplications(null));
    }

    _displayButtons(apps) {
         if (apps) {
            for (let i = 0; i < apps.length; i++) {
               let app = apps[i];
               let item;
               if (app instanceof Shell.App)
                   item = this._applicationsButtons.get(app);
               else
                   item = new PopupMenu.PopupSeparatorMenuItem();
               if (!item) {
                  item = new ApplicationMenuItem(this, app);
                  item.setDragEnabled(this._desktopTarget.hasDesktop);
                  this._applicationsButtons.set(app, item);
               }
               if (!item.actor.get_parent())
                  this.applicationsBox.add_actor(item.actor);
            }
         }
    }

    _listApplications(category_menu_id) {
        let applist;

        if (category_menu_id) {
            applist = this.applicationsByCategory[category_menu_id];
        } else {
            applist = new Array();
            let favorites = global.settings.get_strv('favorite-apps');
            for (let i = 0; i < favorites.length; i++) {
                let app = appSys.lookup_app(favorites[i]);
                if (app)
                    applist.push(app);
            }
        }

        return applist;
    }

    destroy() {
        super.destroy();
    }
};

let appsMenuButton;
let activitiesButton;

function enable() {
    activitiesButton = Main.panel.statusArea['activities'];
    activitiesButton.container.hide();
    appsMenuButton = new ApplicationsButton();
    Main.panel.addToStatusArea('apps-menu', appsMenuButton, 1, 'left');
}

function disable() {
    Main.panel.menuManager.removeMenu(appsMenuButton.menu);
    appsMenuButton.destroy();
    activitiesButton.container.show();
}

function init(metadata) {
    Convenience.initTranslations();
}
