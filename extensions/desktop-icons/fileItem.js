/* Desktop Icons GNOME Shell extension
 *
 * Copyright (C) 2017 Carlos Soriano <csoriano@redhat.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const St = imports.gi.St;
const Pango = imports.gi.Pango;
const Meta = imports.gi.Meta;

const Signals = imports.signals;

const Background = imports.ui.background;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Util = imports.misc.util;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Extension = Me.imports.extension;
const Settings = Me.imports.settings;
const DBusUtils = Me.imports.dbusUtils;

const DRAG_TRESHOLD = 8;

var FileItem = class {

    constructor(file, fileInfo) {
        let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;

        this._file = file;
        this._fileInfo = fileInfo;
        let savedCoordinates = fileInfo.get_attribute_as_string('metadata::nautilus-icon-position');

        if (savedCoordinates != null)
            this._savedPositions = savedCoordinates.split(',').map(x => Number(x));
        else
            this._savedPositions = [0, 0]

        this.actor = new St.Bin({ visible: true });
        this.actor.set_height(Settings.ICON_MAX_SIZE);
        this.actor.set_width(Settings.ICON_MAX_SIZE);
        this.actor._delegate = this;

        this._container = new St.BoxLayout({
            reactive: true,
            track_hover: true,
            can_focus: true,
            style_class: 'file-item',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            vertical: true
        });
        this.actor.add_actor(this._container);

        this._icon = new St.Icon({
            gicon: fileInfo.get_icon(),
            icon_size: Settings.ICON_SIZE
        });
        this._iconContainer = new St.Bin({ visible: true });
        this._iconContainer.child = this._icon;
        this._container.add_actor(this._iconContainer);

        this._label = new St.Label({
            text: fileInfo.get_attribute_as_string('standard::display-name'),
            style_class: 'name-label'
        });
        this._attributeCanExecute = fileInfo.get_attribute_boolean('access::can-execute');
        this._fileType = fileInfo.get_file_type();
        this._isDirectory = this._fileType == Gio.FileType.DIRECTORY;
        this._attributeContentType = fileInfo.get_content_type();
        this._isDesktopFile = this._attributeContentType == 'application/x-desktop';
        this._attributeHidden = fileInfo.get_is_hidden();

        this._loadContentsCancellable = new Gio.Cancellable();
        this._setMetadataCancellable = null;
        if (this._isDesktopFile)
            this._prepareDesktopFile();

        this._container.add_actor(this._label);
        let clutterText = this._label.get_clutter_text();
        /* TODO: Convert to gobject.set for 3.30 */
        clutterText.set_line_wrap(true);
        clutterText.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR)
        clutterText.set_ellipsize(Pango.EllipsizeMode.END);

        this._container.connect('button-press-event', (actor, event) => this._onPressButton(actor, event));
        this._container.connect('motion-event', (actor, event) => this._onMotion(actor, event));
        this._container.connect('button-release-event', (actor, event) => this._onReleaseButton(actor, event));

        this._createMenu();

        this._selected = false;
        this._primaryButtonPressed = false
        if (this._attributeCanExecute && !this._isDesktopFile)
            this._execLine = this.file.get_path();
    }

    get file() {
        return this._file;
    }

    _prepareDesktopFile() {
        this.file.load_contents_async(this._loadContentsCancellable,
            (source, result) => {
                let contents;
                try {
                    let [ok, loadedContents, etag_out] = source.load_contents_finish(result);
                    contents = loadedContents;
                } catch (error) {
                    if (!error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) 
                        log('Error loading Desktop files: ' + error.message);
                    return;
                }

                let keyfile = new GLib.KeyFile();
                keyfile.load_from_bytes(contents, GLib.KeyFileFlags.NONE);
                log(keyfile.get_groups());

                this._execLine = keyfile.get_locale_string('Desktop Entry', 'Exec', null);

                let iconStr = keyfile.get_locale_string('Desktop Entry', 'Icon', null);
                if (iconStr == null)
                    return;

                if (GLib.path_is_absolute(iconStr)) {
                    let iconfile = Gio.File.new_for_commandline_arg(iconStr);
                    this._icon.gicon = new Gio.FileIcon(iconFile);
                } else {
                    this._icon.gicon = Gio.ThemedIcon.new_with_default_fallbacks(iconStr);
                }
            }
        )
    }

    doOpen() {
        if (this._attributeCanExecute && !this._isDirectory) {
            if (!this._execLine)
                return;

            Util.spawnCommandLine(this._execLine);
            return;
        }

        Gio.AppInfo.launch_default_for_uri_async(this.file.get_uri(),
            null, null,
            (source, res) => {
                try {
                    Gio.AppInfo.launch_default_for_uri_finish(res);
                } catch (e) {
                    log('Error opening file ' + this.file.get_uri() + ': ' + e.message);
                }
            }
        );
    }

    _onCopyClicked() {
        Extension.desktopManager.doCopy();
    }

    _onCutClicked() {
        Extension.desktopManager.doCut();
    }

    _onShowInFilesClicked() {

        DBusUtils.FreeDesktopFileManagerProxy.ShowItemsRemote([this.file.get_uri()], '',
            (result, error) => {
                if (error)
                    log('Error showing file on desktop: ' + error.message);
            }
        );
    }

    _onPropertiesClicked() {

        DBusUtils.FreeDesktopFileManagerProxy.ShowItemPropertiesRemote([this.file.get_uri()], '',
            (result, error) => {
                if (error)
                    log('Error showing properties: ' + error.message);
            }
        );
    }

    _onMoveToTrashClicked() {
        Extension.desktopManager.doTrash();
    }

    _createMenu() {
        this._menuManager = new PopupMenu.PopupMenuManager({ actor: this.actor });
        let side = St.Side.LEFT;
        if (Clutter.get_default_text_direction() == Clutter.TextDirection.RTL)
            side = St.Side.RIGHT;
        this._menu = new PopupMenu.PopupMenu(this.actor, 0.5, side);
        this._menu.addAction(_('Open'), () => this.doOpen());
        this._menu.addAction(_('Cut'), () => this._onCutClicked());
        this._menu.addAction(_('Copy'), () => this._onCopyClicked());
        this._menu.addAction(_('Move to Trash'), () => this._onMoveToTrashClicked());
        this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._menu.addAction(_('Properties'), () => this._onPropertiesClicked());
        this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._menu.addAction(_('Show in Files'), () => this._onShowInFilesClicked());
        this._menuManager.addMenu(this._menu);

        Main.layoutManager.uiGroup.add_actor(this._menu.actor);
        this._menu.actor.hide();
    }

    _onPressButton(actor, event) {
        let button = event.get_button();
        if (button == 3) {
            if (!this.selected)
                this.emit('selected', false);
            this._menu.toggle();
            return Clutter.EVENT_STOP;
        } else if (button == 1) {
            if (event.get_click_count() == 1) {
                let [x, y] = event.get_coords();
                this._primaryButtonPressed = true;
                this._buttonPressInitialX = x;
                this._buttonPressInitialY = y;
                let shiftPressed = !!(event.get_state() & Clutter.ModifierType.SHIFT_MASK);
                if (!this.selected) {
                    if (shiftPressed)
                        this.emit('selected', true);
                    else
                        this.emit('selected', false);
                }
            } else {
                this._primaryButtonPressed = false;
                this.doOpen();
            }
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _onMotion(actor, event) {
        let [x, y] = event.get_coords();
        if (this._primaryButtonPressed) {
            let xDiff = x - this._buttonPressInitialX;
            let yDiff = y - this._buttonPressInitialY;
            let distance = Math.sqrt(Math.pow(xDiff, 2) + Math.pow(yDiff, 2));
            if (distance > DRAG_TRESHOLD) {
                // Don't need to track anymore this if we start drag, and also
                // avoids reentrance here
                this._primaryButtonPressed = false
                let event = Clutter.get_current_event();
                let [x, y] = event.get_coords();
                Extension.desktopManager.dragStart();
            }
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _onReleaseButton(actor, event) {
        let button = event.get_button();
        if (button == 1) {
            this._primaryButtonPressed = false
            let addToSelection = !!(event.get_state() & Clutter.ModifierType.SHIFT_MASK);
            this.emit('selected', addToSelection);
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    get savedPositions() {
        return this._savedPositions;
    }

    _onSetMetadataFileFinished(source, result) {
        try {
            let [success, info] = source.set_attributes_finish(result);
        } catch (error) {
            if (!error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                log('Error setting metadata to desktop files ', error);
        }
    }

    set savedPositions(pos) {
        if (this._setMetadataCancellable)
            this._setMetadataCancellable.cancel();
        
        this._setMetadataCancellable = new Gio.Cancellable();
        this._savedPositions = [pos[0], pos[1]];
        let info = new Gio.FileInfo();
        info.set_attribute_string('metadata::nautilus-icon-position',
                                  `${pos[0]},${pos[1]}`);
        this.file.set_attributes_async(info,
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT,
            this._setMetadataCancellable,
            (source, result) => this._onSetMetadataFileFinished(source, result)
        );
    }

    intersectsWith(argX, argY, argWidth, argHeight)
    {
        let rect = new Meta.Rectangle({ x: argX, y: argY, width: argWidth, height: argHeight });
        let [containerX, containerY] = this._container.get_transformed_position();
        let boundingBox = new Meta.Rectangle({ x: containerX,
                                               y: containerY,
                                               width: this._container.width,
                                               height: this._container.height });
        let [intersects, _] = rect.intersect(boundingBox);

        return intersects;
    }

    set selected(selected) {
        selected = !!selected;
        if (selected == this._selected)
            return;

        if (selected)
            this._container.add_style_pseudo_class('selected');
        else
            this._container.remove_style_pseudo_class('selected');

        this._selected = selected;
    }

    get selected() {
        return this._selected;
    }
};
Signals.addSignalMethods(FileItem.prototype);
