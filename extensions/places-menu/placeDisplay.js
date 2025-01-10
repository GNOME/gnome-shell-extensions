// SPDX-FileCopyrightText: 2012 Giovanni Campagna <gcampagna@src.gnome.org>
// SPDX-FileCopyrightText: 2013 Debarshi Ray <debarshir@gnome.org>
// SPDX-FileCopyrightText: 2015 Florian Müllner <fmuellner@gnome.org>
// SPDX-FileCopyrightText: 2016 Rémy Lefevre <lefevreremy@gmail.com>
// SPDX-FileCopyrightText: 2017 Christian Kellner <christian@kellner.me>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ShellMountOperation from 'resource:///org/gnome/shell/ui/shellMountOperation.js';

const N_ = x => x;

Gio._promisify(Gio.AppInfo, 'launch_default_for_uri_async');
Gio._promisify(Gio.File.prototype, 'mount_enclosing_volume');

const BACKGROUND_SCHEMA = 'org.gnome.desktop.background';

class PlaceInfo extends EventEmitter {
    constructor(...params) {
        super();

        this._init(...params);
    }

    _init(kind, file, name, icon) {
        this.kind = kind;
        this.file = file;
        this.name = name || this._getFileName();
        this.icon = icon ? new Gio.ThemedIcon({name: icon}) : this.getIcon();
    }

    destroy() {
    }

    isRemovable() {
        return false;
    }

    async _ensureMountAndLaunch(context, tryMount) {
        try {
            await Gio.AppInfo.launch_default_for_uri_async(this.file.get_uri(), context, null);
        } catch (err) {
            if (!err.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_MOUNTED)) {
                Main.notifyError(_('Failed to launch “%s”').format(this.name), err.message);
                return;
            }

            const source = {
                get_drive: () => null,
            };
            let op = new ShellMountOperation.ShellMountOperation(source);
            try {
                await this.file.mount_enclosing_volume(0, op.mountOp, null);

                if (tryMount)
                    this._ensureMountAndLaunch(context, false).catch(logError);
            } catch (e) {
                if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.FAILED_HANDLED))
                    Main.notifyError(_('Failed to mount volume for “%s”').format(this.name), e.message);
            } finally {
                op.close();
            }
        }
    }

    launch(timestamp) {
        let launchContext = global.create_app_launch_context(timestamp, -1);
        this._ensureMountAndLaunch(launchContext, true).catch(logError);
    }

    getIcon() {
        this.file.query_info_async('standard::symbolic-icon',
            Gio.FileQueryInfoFlags.NONE,
            0,
            null,
            (file, result) => {
                try {
                    let info = file.query_info_finish(result);
                    this.icon = info.get_symbolic_icon();
                    this.emit('changed');
                } catch (e) {
                    if (e instanceof Gio.IOErrorEnum)
                        return;
                    throw e;
                }
            });

        // return a generic icon for this kind for now, until we have the
        // icon from the query info above
        switch (this.kind) {
        case 'network':
            return new Gio.ThemedIcon({name: 'folder-remote-symbolic'});
        case 'devices':
            return new Gio.ThemedIcon({name: 'drive-harddisk-symbolic'});
        case 'special':
        case 'bookmarks':
        default:
            if (!this.file.is_native())
                return new Gio.ThemedIcon({name: 'folder-remote-symbolic'});
            else
                return new Gio.ThemedIcon({name: 'folder-symbolic'});
        }
    }

    _getFileName() {
        try {
            let info = this.file.query_info('standard::display-name', 0, null);
            return info.get_display_name();
        } catch (e) {
            if (e instanceof Gio.IOErrorEnum)
                return this.file.get_basename();
            throw e;
        }
    }
}

class NautilusSpecialInfo extends PlaceInfo {
    constructor(file, name, icon) {
        super('special', file, name, icon);

        const appSystem = Shell.AppSystem.get_default();
        this._app = appSystem.lookup_app('org.gnome.Nautilus.desktop');
    }

    launch(timestamp) {
        const launchContext = global.create_app_launch_context(timestamp, -1);
        this._app.appInfo.launch([this.file], launchContext);
    }
}

class PlaceDeviceInfo extends PlaceInfo {
    _init(kind, mount) {
        this._mount = mount;
        super._init(kind, mount.get_root(), mount.get_name());
    }

    getIcon() {
        return this._mount.get_symbolic_icon();
    }

    isRemovable() {
        return this._mount.can_eject() || this._mount.can_unmount();
    }

    eject() {
        let unmountArgs = [
            Gio.MountUnmountFlags.NONE,
            new ShellMountOperation.ShellMountOperation(this._mount).mountOp,
            null, // Gio.Cancellable
        ];

        if (this._mount.can_eject()) {
            this._mount.eject_with_operation(...unmountArgs,
                this._ejectFinish.bind(this));
        } else {
            this._mount.unmount_with_operation(...unmountArgs,
                this._unmountFinish.bind(this));
        }
    }

    _ejectFinish(mount, result) {
        try {
            mount.eject_with_operation_finish(result);
        } catch (e) {
            this._reportFailure(e);
        }
    }

    _unmountFinish(mount, result) {
        try {
            mount.unmount_with_operation_finish(result);
        } catch (e) {
            this._reportFailure(e);
        }
    }

    _reportFailure(exception) {
        let msg = _('Ejecting drive “%s” failed:').format(this._mount.get_name());
        Main.notifyError(msg, exception.message);
    }
}

class PlaceVolumeInfo extends PlaceInfo {
    _init(kind, volume) {
        this._volume = volume;
        super._init(kind, volume.get_activation_root(), volume.get_name());
    }

    launch(timestamp) {
        if (this.file) {
            super.launch(timestamp);
            return;
        }

        this._volume.mount(0, null, null, (volume, result) => {
            volume.mount_finish(result);

            let mount = volume.get_mount();
            this.file = mount.get_root();
            super.launch(timestamp);
        });
    }

    getIcon() {
        return this._volume.get_symbolic_icon();
    }
}

export class PlacesManager extends EventEmitter {
    constructor() {
        super();

        this._places = {
            special: [],
            devices: [],
            bookmarks: [],
            network: [],
        };

        this._settings = new Gio.Settings({schema_id: BACKGROUND_SCHEMA});
        this._settings.connectObject('changed::show-desktop-icons',
            () => this._updateSpecials(), this);

        this._privacySettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.privacy',
        });
        this._privacySettings.connectObject('changed::remember-recent-files',
            () => this._updateSpecials(), this);
        this._updateSpecials();

        /*
        * Show devices, code more or less ported from nautilus-places-sidebar.c
        */
        this._volumeMonitor = Gio.VolumeMonitor.get();
        this._volumeMonitor.connectObject(
            'volume-added', () => this._updateMounts(),
            'volume-removed', () => this._updateMounts(),
            'volume-changed', () => this._updateMounts(),
            'mount-added', () => this._updateMounts(),
            'mount-removed', () => this._updateMounts(),
            'mount-changed', () => this._updateMounts(),
            'drive-connected', () => this._updateMounts(),
            'drive-disconnected', () => this._updateMounts(),
            'drive-changed', () => this._updateMounts(),
            this);
        this._updateMounts();

        this._bookmarksFile = this._findBookmarksFile();
        this._bookmarkTimeoutId = 0;
        this._monitor = null;

        if (this._bookmarksFile) {
            this._monitor = this._bookmarksFile.monitor_file(Gio.FileMonitorFlags.NONE, null);
            this._monitor.connect('changed', () => {
                if (this._bookmarkTimeoutId > 0)
                    return;
                /* Defensive event compression */
                this._bookmarkTimeoutId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT, 100, () => {
                        this._bookmarkTimeoutId = 0;
                        this._reloadBookmarks();
                        return false;
                    });
            });

            this._reloadBookmarks();
        }
    }

    destroy() {
        this._settings?.disconnectObject(this);
        this._settings = null;

        this._privacySettings.disconnectObject(this);
        this._privacySettings = null;

        this._volumeMonitor.disconnectObject(this);

        if (this._monitor)
            this._monitor.cancel();
        if (this._bookmarkTimeoutId)
            GLib.source_remove(this._bookmarkTimeoutId);
    }

    _shouldShowRecent() {
        const vfs = Gio.Vfs.get_default();
        const schemes = vfs.get_supported_uri_schemes();
        return this._privacySettings.get_boolean('remember-recent-files') &&
            schemes.includes('recent');
    }

    _updateSpecials() {
        this._places.special.forEach(p => p.destroy());
        this._places.special = [];

        const appSystem = Shell.AppSystem.get_default();
        const nautilusApp = appSystem.lookup_app('org.gnome.Nautilus.desktop');
        const defaultFm = Gio.AppInfo.get_default_for_type('inode/directory', true);
        const showNautilusSpecials =
            nautilusApp && defaultFm && nautilusApp.appInfo.equal(defaultFm);

        const homeFile = Gio.File.new_for_path(GLib.get_home_dir());

        this._places.special.push(new PlaceInfo(
            'special',
            homeFile,
            _('Home')));

        if (this._shouldShowRecent()) {
            this._places.special.push(new PlaceInfo(
                'special',
                Gio.File.new_for_uri('recent:///'),
                _('Recent')));
        }

        if (showNautilusSpecials) {
            this._places.special.push(new NautilusSpecialInfo(
                Gio.File.new_for_uri('starred:///'),
                _('Starred'),
                'starred-symbolic'));
        }

        if (this._settings.get_boolean('show-desktop-icons')) {
            const desktopPath = GLib.get_user_special_dir(
                GLib.UserDirectory.DIRECTORY_DESKTOP);
            const desktopFile = desktopPath
                ? Gio.File.new_for_path(desktopPath)
                : null;

            if (desktopFile && !desktopFile.equal(homeFile)) {
                this._places.special.push(
                    new PlaceInfo('special', desktopFile));
            }
        }

        if (showNautilusSpecials) {
            this._places.special.push(new NautilusSpecialInfo(
                Gio.File.new_for_uri('x-network-view:///'),
                _('Network'),
                'network-workgroup-symbolic'));
        }

        this._places.special.push(new PlaceInfo(
            'special',
            Gio.File.new_for_uri('trash:///'),
            _('Trash')));

        this.emit('special-updated');
    }

    _updateMounts() {
        let networkMounts = [];
        let networkVolumes = [];

        this._places.devices.forEach(p => p.destroy());
        this._places.devices = [];
        this._places.network.forEach(p => p.destroy());
        this._places.network = [];

        /* first go through all connected drives */
        let drives = this._volumeMonitor.get_connected_drives();
        for (let i = 0; i < drives.length; i++) {
            let volumes = drives[i].get_volumes();

            for (let j = 0; j < volumes.length; j++) {
                let identifier = volumes[j].get_identifier('class');
                if (identifier && identifier.includes('network')) {
                    networkVolumes.push(volumes[j]);
                } else {
                    let mount = volumes[j].get_mount();
                    if (mount)
                        this._addMount('devices', mount);
                }
            }
        }

        /* add all volumes that is not associated with a drive */
        let volumes = this._volumeMonitor.get_volumes();
        for (let i = 0; i < volumes.length; i++) {
            if (volumes[i].get_drive())
                continue;

            let identifier = volumes[i].get_identifier('class');
            if (identifier && identifier.includes('network')) {
                networkVolumes.push(volumes[i]);
            } else {
                let mount = volumes[i].get_mount();
                if (mount)
                    this._addMount('devices', mount);
            }
        }

        /* add mounts that have no volume (/etc/mtab mounts, ftp, sftp,...) */
        let mounts = this._volumeMonitor.get_mounts();
        for (let i = 0; i < mounts.length; i++) {
            if (mounts[i].is_shadowed())
                continue;

            if (mounts[i].get_volume())
                continue;

            let root = mounts[i].get_default_location();
            if (!root.is_native()) {
                networkMounts.push(mounts[i]);
                continue;
            }
            this._addMount('devices', mounts[i]);
        }

        for (let i = 0; i < networkVolumes.length; i++) {
            let mount = networkVolumes[i].get_mount();
            if (mount) {
                networkMounts.push(mount);
                continue;
            }
            this._addVolume('network', networkVolumes[i]);
        }

        for (let i = 0; i < networkMounts.length; i++)
            this._addMount('network', networkMounts[i]);


        this.emit('devices-updated');
        this.emit('network-updated');
    }

    _findBookmarksFile() {
        let paths = [
            GLib.build_filenamev([GLib.get_user_config_dir(), 'gtk-3.0', 'bookmarks']),
            GLib.build_filenamev([GLib.get_home_dir(), '.gtk-bookmarks']),
        ];

        for (let i = 0; i < paths.length; i++) {
            if (GLib.file_test(paths[i], GLib.FileTest.EXISTS))
                return Gio.File.new_for_path(paths[i]);
        }

        return null;
    }

    _reloadBookmarks() {
        this._bookmarks = [];

        let content = Shell.get_file_contents_utf8_sync(this._bookmarksFile.get_path());
        let lines = content.split('\n');

        let bookmarks = [];
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            let components = line.split(' ');
            let [bookmark] = components;

            if (!bookmark)
                continue;

            let file = Gio.File.new_for_uri(bookmark);
            if (file.is_native() && !file.query_exists(null))
                continue;

            let duplicate = false;
            for (let j = 0; j < this._places.special.length; j++) {
                if (file.equal(this._places.special[j].file)) {
                    duplicate = true;
                    break;
                }
            }
            if (duplicate)
                continue;
            for (let j = 0; j < bookmarks.length; j++) {
                if (file.equal(bookmarks[j].file)) {
                    duplicate = true;
                    break;
                }
            }
            if (duplicate)
                continue;

            let label = null;
            if (components.length > 1)
                label = components.slice(1).join(' ');

            bookmarks.push(new PlaceInfo('bookmarks', file, label));
        }

        this._places.bookmarks = bookmarks;

        this.emit('bookmarks-updated');
    }

    _addMount(kind, mount) {
        const devItem = new PlaceDeviceInfo(kind, mount);
        this._places[kind].push(devItem);
    }

    _addVolume(kind, volume) {
        const volItem = new PlaceVolumeInfo(kind, volume);
        this._places[kind].push(volItem);
    }

    get(kind) {
        return this._places[kind];
    }
}
