/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */
/* exported init enable disable */

const {Clutter, GObject, St} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Me = ExtensionUtils.getCurrentExtension();
const PlaceDisplay = Me.imports.placeDisplay;

const _ = ExtensionUtils.gettext;
const N_ = x => x;

const PLACE_ICON_SIZE = 16;

class PlaceMenuItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(info) {
        super({
            style_class: 'place-menu-item',
        });
        this._info = info;

        this._icon = new St.Icon({
            gicon: info.icon,
            icon_size: PLACE_ICON_SIZE,
        });
        this.add_child(this._icon);

        this._label = new St.Label({
            text: info.name,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._label);

        if (info.isRemovable()) {
            this._ejectIcon = new St.Icon({
                icon_name: 'media-eject-symbolic',
                style_class: 'popup-menu-icon',
            });
            this._ejectButton = new St.Button({
                child: this._ejectIcon,
                style_class: 'button',
            });
            this._ejectButton.connect('clicked', info.eject.bind(info));
            this.add_child(this._ejectButton);
        }

        this._changedId = info.connect('changed',
            this._propertiesChanged.bind(this));
    }

    destroy() {
        if (this._changedId) {
            this._info.disconnect(this._changedId);
            this._changedId = 0;
        }

        super.destroy();
    }

    activate(event) {
        this._info.launch(event.get_time());

        super.activate(event);
    }

    _propertiesChanged(info) {
        this._icon.gicon = info.icon;
        this._label.text = info.name;
    }
}

const SECTIONS = [
    'special',
    'devices',
    'bookmarks',
    'network',
];

class PlacesMenu extends PanelMenu.Button {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super(0.0, _('Places'));

        let label = new St.Label({
            text: _('Places'),
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_actor(label);

        this.placesManager = new PlaceDisplay.PlacesManager();

        this._sections = { };

        for (let i = 0; i < SECTIONS.length; i++) {
            let id = SECTIONS[i];
            this._sections[id] = new PopupMenu.PopupMenuSection();
            this.placesManager.connect(`${id}-updated`, () => {
                this._redisplay(id);
            });

            this._create(id);
            this.menu.addMenuItem(this._sections[id]);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
    }

    _onDestroy() {
        this.placesManager.destroy();

        super._onDestroy();
    }

    _redisplay(id) {
        this._sections[id].removeAll();
        this._create(id);
    }

    _create(id) {
        let places = this.placesManager.get(id);

        for (let i = 0; i < places.length; i++)
            this._sections[id].addMenuItem(new PlaceMenuItem(places[i]));

        this._sections[id].actor.visible = places.length > 0;
    }
}

/** */
function init() {
    ExtensionUtils.initTranslations();
}

let _indicator;

/** */
function enable() {
    _indicator = new PlacesMenu();

    let pos = Main.sessionMode.panel.left.indexOf('appMenu');
    if ('apps-menu' in Main.panel.statusArea)
        pos++;
    Main.panel.addToStatusArea('places-menu', _indicator, pos, 'left');
}

/** */
function disable() {
    _indicator.destroy();
}
