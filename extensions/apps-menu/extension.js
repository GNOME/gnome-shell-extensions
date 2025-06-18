// SPDX-FileCopyrightText: 2011 Vamsi Krishna Brahmajosyula <vamsikrishna.brahmajosyula@gmail.com>
// SPDX-FileCopyrightText: 2011 Giovanni Campagna <gcampagna@src.gnome.org>
// SPDX-FileCopyrightText: 2013 Debarshi Ray <debarshir@gnome.org>
// SPDX-FileCopyrightText: 2013 Florian Müllner <fmuellner@gnome.org>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GMenu from 'gi://GMenu';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const appSys = Shell.AppSystem.get_default();

const APPLICATION_ICON_SIZE = 32;
const HORIZ_FACTOR = 5;
const MENU_HEIGHT_OFFSET = 132;
const NAVIGATION_REGION_OVERSHOOT = 50;

Gio._promisify(Gio._LocalFilePrototype, 'query_info_async', 'query_info_finish');
Gio._promisify(Gio._LocalFilePrototype, 'set_attributes_async', 'set_attributes_finish');

class ApplicationMenuItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(button, app) {
        super();
        this._app = app;
        this._button = button;

        this._icon = this.getDragActor();
        this._icon.style_class = 'icon-dropshadow';
        this.add_child(this._icon);

        let appLabel = new St.Label({
            text: app.get_name(),
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(appLabel);
        this.label_actor = appLabel;

        this._delegate = this;
        let draggable = DND.makeDraggable(this);

        let maybeStartDrag = draggable._maybeStartDrag;
        draggable._maybeStartDrag = event => {
            if (this._dragEnabled)
                return maybeStartDrag.call(draggable, event);
            return false;
        };

        this.connect('notify::active', this._onActiveChanged.bind(this));
    }

    activate(event) {
        this._app.open_new_window(-1);
        this._button.selectCategory(null);
        this._button.menu.toggle();
        super.activate(event);

        Main.overview.hide();
    }

    _onActiveChanged() {
        if (!this.active)
            return;

        this._button.scrollToButton(this);
    }

    setDragEnabled(enabled) {
        this._dragEnabled = enabled;
    }

    getDragActor() {
        return this._app.create_icon_texture(APPLICATION_ICON_SIZE);
    }

    getDragActorSource() {
        return this._icon;
    }
}

class CategoryMenuItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

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
            name = _('Favorites');

        const label = new St.Label({text: name});
        this.add_child(label);
        this.actor.label_actor = label;

        this.connect('motion-event', this._onMotionEvent.bind(this));
        this.connect('notify::active', this._onActiveChanged.bind(this));
    }

    activate(event) {
        this._button.selectCategory(this._category);
        this._button.scrollToCatButton(this);
        super.activate(event);
    }

    _isNavigatingSubmenu([x, y]) {
        let [posX, posY] = this.get_transformed_position();

        if (this._oldX === -1) {
            this._oldX = x;
            this._oldY = y;
            return true;
        }

        let deltaX = Math.abs(x - this._oldX);
        let deltaY = Math.abs(y - this._oldY);

        this._oldX = x;
        this._oldY = y;

        // If it lies outside the x-coordinates then it is definitely outside.
        if (posX > x || posX + this.width < x)
            return false;

        // If it lies inside the menu item then it is definitely inside.
        if (posY <= y && posY + this.height >= y)
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
            y = posY + this.height + offset;
        }

        // Ensure that A is (0, 0).
        x -= posX;
        y -= posY + this.height;

        // Check which side of line AB the point P lies on by taking the
        // cross-product of AB and AP. See:
        // http://stackoverflow.com/questions/3461453/determine-which-side-of-a-line-a-point-lies
        if (this.width * y - NAVIGATION_REGION_OVERSHOOT * x <= 0)
            return true;

        return false;
    }

    _onMotionEvent(actor, event) {
        if (!this._grab) {
            this._oldX = -1;
            this._oldY = -1;
            const grab = global.stage.grab(this);
            if (grab.get_seat_state() !== Clutter.GrabState.NONE)
                this._grab = grab;
            else
                grab.dismiss();
        }
        this.hover = true;

        if (this._isNavigatingSubmenu(event.get_coords()))
            return true;

        this._oldX = -1;
        this._oldY = -1;
        this.hover = false;
        this._grab?.dismiss();
        delete this._grab;

        const targetActor = global.stage.get_event_actor(event);
        if (targetActor instanceof St.Widget)
            targetActor.sync_hover();

        return false;
    }

    _onActiveChanged() {
        if (!this.active)
            return;

        this._button.selectCategory(this._category);
        this._button.scrollToCatButton(this);
    }
}

class ApplicationsMenu extends PopupMenu.PopupMenu {
    constructor(sourceActor, arrowAlignment, arrowSide, button) {
        super(sourceActor, arrowAlignment, arrowSide);
        this._button = button;
    }

    isEmpty() {
        return false;
    }

    toggle() {
        if (this.isOpen)
            this._button.selectCategory(null);
        super.toggle();
    }
}

class DesktopTarget extends EventEmitter {
    constructor() {
        super();

        this._desktop = null;
        this._desktopDestroyedId = 0;

        this._windowAddedId =
            global.window_group.connect('child-added',
                this._onWindowAdded.bind(this));

        global.get_window_actors().forEach(a => {
            this._onWindowAdded(a.get_parent(), a);
        });
    }

    get hasDesktop() {
        return this._desktop !== null;
    }

    _onWindowAdded(group, actor) {
        if (!(actor instanceof Meta.WindowActor))
            return;

        if (actor.meta_window.get_window_type() === Meta.WindowType.DESKTOP)
            this._setDesktop(actor);
    }

    _setDesktop(desktop) {
        if (this._desktop) {
            this._desktop.disconnectObject(this);
            delete this._desktop._delegate;
        }

        this._desktop = desktop;
        this.emit('desktop-changed');

        if (this._desktop) {
            this._desktop.connectObject('destroy', () => {
                this._setDesktop(null);
            }, this);
            this._desktop._delegate = this;
        }
    }

    _getSourceAppInfo(source) {
        if (!(source instanceof ApplicationMenuItem))
            return null;
        return source._app.app_info;
    }

    async _markTrusted(file) {
        let modeAttr = Gio.FILE_ATTRIBUTE_UNIX_MODE;
        let trustedAttr = 'metadata::trusted';
        let queryFlags = Gio.FileQueryInfoFlags.NONE;
        let ioPriority = GLib.PRIORITY_DEFAULT;

        try {
            let info = await file.query_info_async(modeAttr, queryFlags, ioPriority, null);

            let mode = info.get_attribute_uint32(modeAttr) | 0o100;
            info.set_attribute_uint32(modeAttr, mode);
            info.set_attribute_string(trustedAttr, 'yes');
            await file.set_attributes_async(info, queryFlags, ioPriority, null);

            // Hack: force nautilus to reload file info
            info = new Gio.FileInfo();
            info.set_attribute_uint64(
                Gio.FILE_ATTRIBUTE_TIME_ACCESS, GLib.get_real_time());
            try {
                await file.set_attributes_async(info, queryFlags, ioPriority, null);
            } catch (e) {
                log(`Failed to update access time: ${e.message}`);
            }
        } catch (e) {
            log(`Failed to mark file as trusted: ${e.message}`);
        }
    }

    destroy() {
        global.window_group.disconnectObject(this);
        this._setDesktop(null);
    }

    handleDragOver(source, _actor, _x, _y, _time) {
        let appInfo = this._getSourceAppInfo(source);
        if (!appInfo)
            return DND.DragMotionResult.CONTINUE;

        return DND.DragMotionResult.COPY_DROP;
    }

    acceptDrop(source, _actor, _x, _y, _time) {
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
        } catch (e) {
            log(`Failed to copy to desktop: ${e.message}`);
        }

        return true;
    }
}

class MainLayout extends Clutter.BoxLayout {
    static {
        GObject.registerClass(this);
    }

    vfunc_get_preferred_height(container, forWidth) {
        const [mainChild] = container;
        const [minHeight, natHeight] =
            mainChild.get_preferred_height(forWidth);

        return [minHeight, natHeight + MENU_HEIGHT_OFFSET];
    }
}

class ApplicationsButton extends PanelMenu.Button {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super(1.0, null, false);

        this.setMenu(new ApplicationsMenu(this, 1.0, St.Side.TOP, this));
        Main.panel.menuManager.addMenu(this.menu);

        // At this moment applications menu is not keyboard navigable at
        // all (so not accessible), so it doesn't make sense to set as
        // role ATK_ROLE_MENU like other elements of the panel.
        this.accessible_role = Atk.Role.LABEL;

        this._label = new St.Label({
            text: _('Apps'),
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this.add_child(this._label);
        this.name = 'panelApplications';
        this.label_actor = this._label;

        Main.overview.connectObject(
            'showing', () => this.add_accessible_state(Atk.StateType.CHECKED),
            'hiding', () => this.remove_accessible_state(Atk.StateType.CHECKED),
            this);

        Main.wm.addKeybinding(
            'apps-menu-toggle-menu',
            Extension.lookupByURL(import.meta.url).getSettings(),
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this.menu.toggle());

        this._desktopTarget = new DesktopTarget();
        this._desktopTarget.connect('app-dropped', () => {
            this.menu.close();
        });
        this._desktopTarget.connect('desktop-changed', () => {
            this._applicationsButtons.forEach(item => {
                item.setDragEnabled(this._desktopTarget.hasDesktop);
            });
        });

        this._tree = new GMenu.Tree({menu_basename: 'applications.menu'});
        this._tree.connectObject('changed',
            () => this._onTreeChanged(), this);

        this._applicationsButtons = new Map();
        this.reloadFlag = false;
        this._createLayout();
        this._display();
        appSys.connectObject('installed-changed',
            () => this._onTreeChanged(), this);
    }

    _onTreeChanged() {
        if (this.menu.isOpen) {
            this._redisplay();
            this.mainBox.show();
        } else {
            this.reloadFlag = true;
        }
    }

    _onDestroy() {
        super._onDestroy();

        delete this._tree;

        Main.wm.removeKeybinding('apps-menu-toggle-menu');

        this._desktopTarget.destroy();
    }

    _onMenuKeyPress(actor, event) {
        let symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Left || symbol === Clutter.KEY_Right) {
            let direction = symbol === Clutter.KEY_Left
                ? Gtk.DirectionType.LEFT : Gtk.DirectionType.RIGHT;
            if (this.menu.actor.navigate_focus(global.stage.key_focus, direction, false))
                return true;
        }
        return super._onMenuKeyPress(actor, event);
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

    _redisplay() {
        this.applicationsBox.destroy_all_children();
        this.categoriesBox.destroy_all_children();
        this._display();
    }

    _loadCategory(categoryId, dir) {
        let iter = dir.iter();
        let nextType;
        while ((nextType = iter.next()) !== GMenu.TreeItemType.INVALID) {
            if (nextType === GMenu.TreeItemType.ENTRY) {
                let entry = iter.get_entry();
                let id;
                try {
                    id = entry.get_desktop_file_id(); // catch non-UTF8 filenames
                } catch {
                    continue;
                }
                let app = appSys.lookup_app(id);
                if (!app)
                    app = new Shell.App({app_info: entry.get_app_info()});
                if (app.get_app_info().should_show())
                    this.applicationsByCategory[categoryId].push(app);
            } else if (nextType === GMenu.TreeItemType.SEPARATOR) {
                this.applicationsByCategory[categoryId].push('separator');
            } else if (nextType === GMenu.TreeItemType.DIRECTORY) {
                let subdir = iter.get_directory();
                if (!subdir.get_is_nodisplay())
                    this._loadCategory(categoryId, subdir);
            }
        }
    }

    scrollToButton(button) {
        let appsScrollBoxAdj = this.applicationsScrollBox.get_vadjustment();
        let appsScrollBoxAlloc = this.applicationsScrollBox.get_allocation_box();
        let currentScrollValue = appsScrollBoxAdj.get_value();
        let boxHeight = appsScrollBoxAlloc.y2 - appsScrollBoxAlloc.y1;
        let buttonAlloc = button.get_allocation_box();
        let newScrollValue = currentScrollValue;
        if (currentScrollValue > buttonAlloc.y1 - 10)
            newScrollValue = buttonAlloc.y1 - 10;
        if (boxHeight + currentScrollValue < buttonAlloc.y2 + 10)
            newScrollValue = buttonAlloc.y2 - boxHeight + 10;
        if (newScrollValue !== currentScrollValue)
            appsScrollBoxAdj.set_value(newScrollValue);
    }

    scrollToCatButton(button) {
        let catsScrollBoxAdj = this.categoriesScrollBox.get_vadjustment();
        let catsScrollBoxAlloc = this.categoriesScrollBox.get_allocation_box();
        let currentScrollValue = catsScrollBoxAdj.get_value();
        let boxHeight = catsScrollBoxAlloc.y2 - catsScrollBoxAlloc.y1;
        let buttonAlloc = button.get_allocation_box();
        let newScrollValue = currentScrollValue;
        if (currentScrollValue > buttonAlloc.y1 - 10)
            newScrollValue = buttonAlloc.y1 - 10;
        if (boxHeight + currentScrollValue < buttonAlloc.y2 + 10)
            newScrollValue = buttonAlloc.y2 - boxHeight + 10;
        if (newScrollValue !== currentScrollValue)
            catsScrollBoxAdj.set_value(newScrollValue);
    }

    _createLayout() {
        let section = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(section);
        this.mainBox = new St.BoxLayout({layoutManager: new MainLayout()});
        this.leftBox = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
        });
        this.applicationsScrollBox = new St.ScrollView({
            style_class: 'apps-menu vfade',
            x_expand: true,
        });
        this.categoriesScrollBox = new St.ScrollView({
            style_class: 'vfade',
        });
        this.leftBox.add_child(this.categoriesScrollBox);

        this.applicationsBox = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
        });
        this.applicationsScrollBox.set_child(this.applicationsBox);
        this.categoriesBox = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
        });
        this.categoriesScrollBox.set_child(this.categoriesBox);

        this.mainBox.add_child(this.leftBox);
        this.mainBox.add_child(this.applicationsScrollBox);
        section.actor.add_child(this.mainBox);
    }

    _display() {
        this._applicationsButtons.clear();
        this.mainBox.hide();

        // Load categories
        this.applicationsByCategory = {};
        this._tree.load_sync();
        let root = this._tree.get_root_directory();
        let categoryMenuItem = new CategoryMenuItem(this, null);
        this.categoriesBox.add_child(categoryMenuItem);
        let iter = root.iter();
        let nextType;
        while ((nextType = iter.next()) !== GMenu.TreeItemType.INVALID) {
            if (nextType !== GMenu.TreeItemType.DIRECTORY)
                continue;

            let dir = iter.get_directory();
            if (dir.get_is_nodisplay())
                continue;

            let categoryId = dir.get_menu_id();
            this.applicationsByCategory[categoryId] = [];
            this._loadCategory(categoryId, dir);
            if (this.applicationsByCategory[categoryId].length > 0) {
                categoryMenuItem = new CategoryMenuItem(this, dir);
                this.categoriesBox.add_child(categoryMenuItem);
            }
        }

        // Load applications
        this._displayButtons(this._listApplications(null));
    }

    selectCategory(dir) {
        this.applicationsBox.get_children().forEach(c => {
            if (c._delegate instanceof PopupMenu.PopupSeparatorMenuItem)
                c._delegate.destroy();
            else
                this.applicationsBox.remove_child(c);
        });

        if (dir)
            this._displayButtons(this._listApplications(dir.get_menu_id()));
        else
            this._displayButtons(this._listApplications(null));
    }

    _displayButtons(apps) {
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
            if (!item.get_parent())
                this.applicationsBox.add_child(item);
        }
    }

    _listApplications(categoryMenuId) {
        let applist;

        if (categoryMenuId) {
            applist = this.applicationsByCategory[categoryMenuId];
        } else {
            applist = global.settings.get_strv('favorite-apps')
               .map(id => appSys.lookup_app(id))
               .filter(app => app);
        }

        return applist;
    }
}

export default class AppsMenuExtension extends Extension {
    enable() {
        this._appsMenuButton = new ApplicationsButton();
        const index = Main.sessionMode.panel.left.indexOf('activities') + 1;
        Main.panel.addToStatusArea(
            'apps-menu', this._appsMenuButton, index, 'left');
    }

    disable() {
        Main.panel.menuManager.removeMenu(this._appsMenuButton.menu);
        this._appsMenuButton.destroy();
        delete this._appsMenuButton;
    }
}
