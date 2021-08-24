// SPDX-FileCopyrightText: 2021 Ray Strode <rstrode@redhat.com>
//
// SPDX-License-Identifier: GPL-2.0-or-later

import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const HeadsUpMessageBodyLabel = GObject.registerClass({
}, class HeadsUpMessageBodyLabel extends St.Label {
    constructor(params) {
        super(params);

        this._widthCoverage = 0.75;
        this._heightCoverage = 0.25;

        global.display.connectObject('workareas-changed',
            () => this._getWorkAreaAndMeasureLineHeight());
    }

    _getWorkAreaAndMeasureLineHeight() {
        if (!this.get_parent())
            return;

        this._workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);

        this.clutter_text.single_line_mode = true;
        this.clutter_text.line_wrap = false;

        this._lineHeight = super.vfunc_get_preferred_height(-1)[0];

        this.clutter_text.single_line_mode = false;
        this.clutter_text.line_wrap = true;
    }

    vfunc_parent_set() {
        this._getWorkAreaAndMeasureLineHeight();
    }

    vfunc_get_preferred_width(forHeight) {
        const maxWidth = this._widthCoverage * this._workArea.width;

        let [labelMinimumWidth, labelNaturalWidth] = super.vfunc_get_preferred_width(forHeight);

        labelMinimumWidth = Math.min(labelMinimumWidth, maxWidth);
        labelNaturalWidth = Math.min(labelNaturalWidth, maxWidth);

        return [labelMinimumWidth, labelNaturalWidth];
    }

    vfunc_get_preferred_height(forWidth) {
        const labelHeightUpperBound = this._heightCoverage * this._workArea.height;
        const numberOfLines = Math.floor(labelHeightUpperBound / this._lineHeight);
        this._numberOfLines = Math.max(numberOfLines, 1);

        const maxHeight = this._lineHeight * this._numberOfLines;

        let [labelMinimumHeight, labelNaturalHeight] = super.vfunc_get_preferred_height(forWidth);

        labelMinimumHeight = Math.min(labelMinimumHeight, maxHeight);
        labelNaturalHeight = Math.min(labelNaturalHeight, maxHeight);

        return [labelMinimumHeight, labelNaturalHeight];
    }
});

export const HeadsUpMessage = GObject.registerClass({
}, class HeadsUpMessage extends St.Button {
    constructor(heading, body) {
        super({
            style_class: 'message',
            accessible_role: Atk.Role.NOTIFICATION,
            can_focus: false,
            opacity: 0,
        });

        Main.layoutManager.addChrome(this, {affectsInputRegion: true});

        this.add_style_class_name('heads-up-display-message');

        this.connect('destroy', () => this._onDestroy());

        Main.layoutManager.panelBox.connectObject('notify::allocation',
            () => this._alignWithPanel());
        this.connect('notify::allocation',
            () => this._alignWithPanel());

        const contentsBox = new St.BoxLayout({
            style_class: 'heads-up-message-content',
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(contentsBox);

        this._headingLabel = new St.Label({
            style_class: 'heads-up-message-heading',
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
        });

        this.setHeading(heading);
        contentsBox.add_child(this._headingLabel);

        this._bodyLabel = new HeadsUpMessageBodyLabel({
            style_class: 'heads-up-message-body',
            x_expand: true,
            y_expand: true,
        });
        contentsBox.add_child(this._bodyLabel);

        this.setBody(body);
    }

    vfunc_parent_set() {
        this._alignWithPanel();
    }

    _alignWithPanel() {
        if (this._beforeUpdateId)
            return;

        this._beforeUpdateId = global.stage.connect('before-update', () => {
            let x = Main.panel.x;
            let y = Main.panel.y + Main.panel.height;

            x += Main.panel.width / 2;
            x -= this.width / 2;
            x = Math.floor(x);
            this.set_position(x, y);
            this.opacity = 255;

            global.stage.disconnect(this._beforeUpdateId);
            this._beforeUpdateId = 0;
        });
    }

    setHeading(text) {
        if (text) {
            const heading = text ? text.replace(/\n/g, ' ') : '';
            this._headingLabel.text = heading;
            this._headingLabel.visible = true;
        } else {
            this._headingLabel.text = text;
            this._headingLabel.visible = false;
        }
    }

    setBody(text) {
        this._bodyLabel.text = text;

        if (text)
            this._bodyLabel.visible = true;
        else
            this._bodyLabel.visible = false;
    }

    _onDestroy() {
        if (this._beforeUpdateId) {
            global.stage.disconnect(this._beforeUpdateId);
            this._beforeUpdateId = 0;
        }
    }
});
