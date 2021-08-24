// SPDX-FileCopyrightText: 2021 Ray Strode <rstrode@redhat.com>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

class GeneralGroup extends Adw.PreferencesGroup {
    static {
        GObject.registerClass(this);
    }

    constructor(settings) {
        super();

        const actionGroup = new Gio.SimpleActionGroup();
        this.insert_action_group('options', actionGroup);

        actionGroup.add_action(settings.create_action('show-when-locked'));
        actionGroup.add_action(settings.create_action('show-when-unlocking'));
        actionGroup.add_action(settings.create_action('show-when-unlocked'));

        this.add(new Adw.SwitchRow({
            title: _('Show message when screen is locked'),
            action_name: 'options.show-when-locked',
        }));
        this.add(new Adw.SwitchRow({
            title: _('Show message on unlock screen'),
            action_name: 'options.show-when-unlocking',
        }));
        this.add(new Adw.SwitchRow({
            title: _('Show message when screen is unlocked'),
            action_name: 'options.show-when-unlocked',
        }));

        const spinRow = new Adw.SpinRow({
            title: _('Seconds after user goes idle before reshowing message'),
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 2147483647,
                step_increment: 1,
                page_increment: 60,
                page_size: 60,
            }),
        });
        settings.bind('idle-timeout',
            spinRow, 'value',
            Gio.SettingsBindFlags.DEFAULT);
        this.add(spinRow);
    }
}

class MessageGroup extends Adw.PreferencesGroup {
    static {
        GObject.registerClass(this);
    }

    constructor(settings) {
        super({
            title: _('Message'),
        });

        const textView = new Gtk.TextView({
            accepts_tab: false,
            wrap_mode: Gtk.WrapMode.WORD,
            top_margin: 6,
            bottom_margin: 6,
            left_margin: 6,
            right_margin: 6,
            vexpand: true,
        });
        textView.add_css_class('card');

        settings.bind('message-body',
            textView.get_buffer(), 'text',
            Gio.SettingsBindFlags.DEFAULT);
        this.add(textView);
    }
}

export default class HeadsUpDisplayPrefs extends ExtensionPreferences {
    getPreferencesWidget() {
        const page = new Adw.PreferencesPage();
        page.add(new GeneralGroup(this.getSettings()));
        page.add(new MessageGroup(this.getSettings()));
        return page;
    }
}
