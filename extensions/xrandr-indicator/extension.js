/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GnomeDesktop = imports.gi.GnomeDesktop;
const Lang = imports.lang;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Panel = imports.ui.panel;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;
const N_ = function(e) { return e };

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const possibleRotations = [ GnomeDesktop.RRRotation.ROTATION_0,
			    GnomeDesktop.RRRotation.ROTATION_90,
			    GnomeDesktop.RRRotation.ROTATION_180,
			    GnomeDesktop.RRRotation.ROTATION_270
			  ];

let rotations = [ [ GnomeDesktop.RRRotation.ROTATION_0, N_("Normal") ],
		  [ GnomeDesktop.RRRotation.ROTATION_90, N_("Left") ],
		  [ GnomeDesktop.RRRotation.ROTATION_270, N_("Right") ],
		  [ GnomeDesktop.RRRotation.ROTATION_180, N_("Upside-down") ]
		];

const XRandr2Iface = <interface name='org.gnome.SettingsDaemon.XRANDR_2'>
<method name='ApplyConfiguration'>
    <arg type='x' direction='in'/>
    <arg type='x' direction='in'/>
</method>
</interface>;

const XRandr2 = Gio.DBusProxy.makeProxyWrapper(XRandr2Iface);

const Indicator = new Lang.Class({
    Name: 'XRandRIndicator',
    Extends: PanelMenu.SystemStatusButton,

    _init: function() {
	this.parent('preferences-desktop-display-symbolic', _("Display"));

        this._proxy = new XRandr2(Gio.DBus.session, 'org.gnome.SettingsDaemon', '/org/gnome/SettingsDaemon/XRANDR');

        try {
            this._screen = new GnomeDesktop.RRScreen({ gdk_screen: Gdk.Screen.get_default() });
            this._screen.init(null);
        } catch(e) {
            // an error means there is no XRandR extension
            this.actor.hide();
            return;
        }

        this._createMenu();
        this._screen.connect('changed', Lang.bind(this, this._randrEvent));
    },

    _randrEvent: function() {
        this.menu.removeAll();
        this._createMenu();
    },

    _createMenu: function() {
        let config = GnomeDesktop.RRConfig.new_current(this._screen);
        let outputs = config.get_outputs();
        for (let i = 0; i < outputs.length; i++) {
            if (outputs[i].is_connected())
                this._addOutputItem(config, outputs[i]);
        }
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
	this.menu.addSettingsAction(_("Display Settings"), 'gnome-display-panel.desktop');
    },

    _addOutputItem: function(config, output) {
        let item = new PopupMenu.PopupMenuItem(output.get_display_name());
        item.label.add_style_class_name('display-subtitle');
        item.actor.reactive = false;
        item.actor.can_focus = false;
        this.menu.addMenuItem(item);

        let allowedRotations = this._getAllowedRotations(config, output);
        let currentRotation = output.get_rotation();
        for (let i = 0; i < rotations.length; i++) {
            let [bitmask, name] = rotations[i];
            if (bitmask & allowedRotations) {
                let item = new PopupMenu.PopupMenuItem(Gettext.gettext(name));
                if (bitmask & currentRotation)
                    item.setOrnament(PopupMenu.Ornament.DOT);
                item.connect('activate', Lang.bind(this, function(item, event) {
                    /* ensure config is saved so we get a backup if anything goes wrong */
                    config.save();

                    output.set_rotation(bitmask);
                    try {
                        config.save();
                        this._proxy.ApplyConfigurationRemote(0, event.get_time());
                    } catch (e) {
                        log ('Could not save monitor configuration: ' + e);
                    }
                }));
                this.menu.addMenuItem(item);
            }
        }
    },

    _getAllowedRotations: function(config, output) {
        let retval = 0;

        let current = output.get_rotation();

        for (let i = 0; i < possibleRotations.length; i++) {
            output.set_rotation(possibleRotations[i]);
            if (config.applicable(this._screen)) {
                retval |= possibleRotations[i];
            }
        }

        output.set_rotation(current);

        if (retval.lenght == 0) {
            // what, no rotation?
            // what's current then?
            retval = current;
        }
        return retval;
    }
});

function init(metadata) {
    Convenience.initTranslations();
}

let _indicator;

function enable() {
    _indicator = new Indicator();
    Main.panel.addToStatusArea('display', _indicator);
}

function disable() {
    _indicator.destroy();
}
