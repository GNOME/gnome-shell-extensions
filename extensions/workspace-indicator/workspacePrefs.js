// SPDX-FileCopyrightText: 2012 Giovanni Campagna <gcampagna@src.gnome.org>
// SPDX-FileCopyrightText: 2014 Florian Müllner <fmuellner@gnome.org>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

class GeneralGroup extends Adw.PreferencesGroup {
    static {
        GObject.registerClass(this);
    }

    constructor(settings) {
        super({
            title: _('Indicator'),
        });

        const previewCheck = new Gtk.CheckButton();
        const previewRow = new Adw.ActionRow({
            title: _('Previews'),
            activatable_widget: previewCheck,
        });
        previewRow.add_prefix(previewCheck);
        this.add(previewRow);

        const nameCheck = new Gtk.CheckButton({
            group: previewCheck,
        });
        const nameRow = new Adw.ActionRow({
            title: _('Workspace Name'),
            activatable_widget: nameCheck,
        });
        nameRow.add_prefix(nameCheck);
        this.add(nameRow);

        if (settings.get_boolean('embed-previews'))
            previewCheck.active = true;
        else
            nameCheck.active = true;

        settings.bind('embed-previews',
            previewCheck, 'active',
            Gio.SettingsBindFlags.DEFAULT);
    }
}

class BehaviorGroup extends Adw.PreferencesGroup {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({
            title: _('Behavior'),
        });

        const dynamicCheck = new Gtk.CheckButton();
        const dynamicRow = new Adw.ActionRow({
            title: _('Dynamic'),
            subtitle: _('Automatically removes empty workspaces.'),
            activatable_widget: dynamicCheck,
        });
        dynamicRow.add_prefix(dynamicCheck);
        this.add(dynamicRow);

        const fixedCheck = new Gtk.CheckButton({
            group: dynamicCheck,
        });
        const fixedRow = new Adw.ActionRow({
            title: _('Fixed Number'),
            subtitle: _('Specify a number of permanent workspaces.'),
            activatable_widget: fixedCheck,
        });
        fixedRow.add_prefix(fixedCheck);
        this.add(fixedRow);

        const adjustment = new Gtk.Adjustment({
            lower: 1,
            step_increment: 1,
            value: 4,
            upper: 36, // hard limit in mutter
        });
        const numRow = new Adw.SpinRow({
            title: _('Number of Workspaces'),
            adjustment,
        });
        this.add(numRow);

        const mutterSettings = new Gio.Settings({
            schema_id: 'org.gnome.mutter',
        });

        if (mutterSettings.get_boolean('dynamic-workspaces'))
            dynamicCheck.active = true;
        else
            fixedCheck.active = true;

        mutterSettings.bind('dynamic-workspaces',
            dynamicCheck, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        const desktopSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.wm.preferences',
        });

        desktopSettings.bind('num-workspaces',
            numRow, 'value',
            Gio.SettingsBindFlags.DEFAULT);

        fixedCheck.bind_property('active',
            numRow, 'sensitive',
            GObject.BindingFlags.SYNC_CREATE);
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
        this.add(new BehaviorGroup());
    }
}
