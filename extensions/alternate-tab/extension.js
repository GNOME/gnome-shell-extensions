/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

/* most of the code is borrowed from
 * > js/ui/altTab.js <
 * of the gnome-shell source code
 */

const AltTab = imports.ui.altTab;
const Clutter = imports.gi.Clutter;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const ModalDialog = imports.ui.modalDialog;
const Shell = imports.gi.Shell;
const St = imports.gi.St;
const Tweener = imports.ui.tweener;
const WindowManager = imports.ui.windowManager;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;
const N_ = function(e) { return e };

const POPUP_FADE_TIME = 0.1; // seconds

const SETTINGS_SCHEMA = 'org.gnome.shell.extensions.alternate-tab';
const SETTINGS_BEHAVIOUR_KEY = 'behaviour';
const SETTINGS_FIRST_TIME_KEY = 'first-time';

const MODES = {
    native: function() {
            Main.wm._startAppSwitcher();
    },
    all_thumbnails: function() {
            new AltTabPopup2();
    },
    workspace_icons: function() {
            new AltTabPopupW().show();
    }
};

const MESSAGE = N_("This is the first time you use the Alternate Tab extension. \n\
Please choose your preferred behaviour:\n\
\n\
All & Thumbnails:\n\
    This mode presents all applications from all workspaces in one selection \n\
    list. Instead of using the application icon of every window, it uses small \n\
    thumbnails resembling the window itself. \n\
\n\
Workspace & Icons:\n\
    This mode let's you switch between the applications of your current \n\
    workspace and gives you additionally the option to switch to the last used \n\
    application of your previous workspace. This is always the last symbol in \n\
    the list and is segregated by a separator/vertical line if available. \n\
    Every window is represented by its application icon.  \n\
\n\
Native:\n\
    This mode is the native GNOME 3 behaviour or in other words: Clicking \n\
    native switches the Alternate Tab extension off. \n\
");

function AltTabPopupW() {
    this._init();
}

AltTabPopupW.prototype = {
    __proto__ : AltTab.AltTabPopup.prototype,

    show : function(backward, switch_group) {
        let appSys = Shell.AppSystem.get_default();
        let apps = appSys.get_running ();

        if (!apps.length)
            return false;

        if (!Main.pushModal(this.actor))
            return false;
        this._haveModal = true;

        this.actor.connect('key-press-event', Lang.bind(this, this._keyPressEvent));
        this.actor.connect('key-release-event', Lang.bind(this, this._keyReleaseEvent));

        this.actor.connect('button-press-event', Lang.bind(this, this._clickedOutside));
        this.actor.connect('scroll-event', Lang.bind(this, this._onScroll));

        this._appSwitcher = new WindowSwitcher(apps, this);
        this.actor.add_actor(this._appSwitcher.actor);
        this._appSwitcher.connect('item-activated', Lang.bind(this, this._appActivated));
        this._appSwitcher.connect('item-entered', Lang.bind(this, this._appEntered));

        this._appIcons = this._appSwitcher.icons;

        // Make the initial selection
        if (switch_group) {
            if (backward) {
                this._select(0, this._appIcons[0].cachedWindows.length - 1);
            } else {
                if (this._appIcons[0].cachedWindows.length > 1)
                    this._select(0, 1);
                else
                    this._select(0, 0);
            }
        } else if (this._appIcons.length == 1) {
            this._select(0);
        } else if (backward) {
            this._select(this._appIcons.length - 1);
        } else {
            this._select(1);
        }

        // There's a race condition; if the user released Alt before
        // we got the grab, then we won't be notified. (See
        // https://bugzilla.gnome.org/show_bug.cgi?id=596695 for
        // details.) So we check now. (Have to do this after updating
        // selection.)
        let [x, y, mods] = global.get_pointer();
        if (!(mods & Gdk.ModifierType.MOD1_MASK)) {
            this._finish();
            return false;
        }

        this.actor.opacity = 0;
        this.actor.show();
        Tweener.addTween(this.actor,
                         { opacity: 255,
                           time: POPUP_FADE_TIME,
                           transition: 'easeOutQuad'
                         });

        return true;
    },


    _finish : function() {
        let app = this._appIcons[this._currentApp];
        Main.activateWindow(app.cachedWindows[0]);
        this.destroy();
    }

};

function AppIcon(app, window) {
    this._init(app, window);
}

AppIcon.prototype = {
    __proto__ : AltTab.AppIcon.prototype,

    _init: function(app, window) {
        this.app = app;

        this.cachedWindows = [];
        this.cachedWindows.push(window);

        this.actor = new St.BoxLayout({ style_class: 'alt-tab-app',
                                         vertical: true });
        this.icon = null;
        this._iconBin = new St.Bin({ x_fill: true, y_fill: true });

        this.actor.add(this._iconBin, { x_fill: false, y_fill: false } );

        let title = window.get_title();
        if (title) {
            this.label = new St.Label({ text: title });
            let bin = new St.Bin({ x_align: St.Align.MIDDLE });
            bin.add_actor(this.label);
            this.actor.add(bin);
        }
        else {
            this.label = new St.Label({ text: this.app.get_name() });
            this.actor.add(this.label, { x_fill: false });
        }
    }
};

function WindowSwitcher(apps, altTabPopup) {
    this._init(apps, altTabPopup);
}

WindowSwitcher.prototype = {
    __proto__ : AltTab.AppSwitcher.prototype,

    _init : function(apps, altTabPopup) {
        AltTab.SwitcherList.prototype._init.call(this, true);

        // Construct the AppIcons, sort by time, add to the popup
        let activeWorkspace = global.screen.get_active_workspace();
        let workspaceIcons = [];
        let otherIcons = [];
        for (let i = 0; i < apps.length; i++) {
            // Cache the window list now; we don't handle dynamic changes here,
            // and we don't want to be continually retrieving it
            let windows = apps[i].get_windows();

            for(let j = 0; j < windows.length; j++) {
                let appIcon = new AppIcon(apps[i], windows[j]);
                if (this._isWindowOnWorkspace(windows[j], activeWorkspace)) {
                  workspaceIcons.push(appIcon);
                }
                else {
                  otherIcons.push(appIcon);
                }
            }
        }

        workspaceIcons.sort(Lang.bind(this, this._sortAppIcon));
        otherIcons.sort(Lang.bind(this, this._sortAppIcon));

        if(otherIcons.length > 0) {
            let mostRecentOtherIcon = otherIcons[0];
            otherIcons = [];
            otherIcons.push(mostRecentOtherIcon);
        }

        this.icons = [];
        this._arrows = [];
        for (let i = 0; i < workspaceIcons.length; i++)
            this._addIcon(workspaceIcons[i]);
        if (workspaceIcons.length > 0 && otherIcons.length > 0)
            this.addSeparator();
        for (let i = 0; i < otherIcons.length; i++)
            this._addIcon(otherIcons[i]);

        this._curApp = -1;
        this._iconSize = 0;
        this._altTabPopup = altTabPopup;
        this._mouseTimeOutId = 0;
    },


    _isWindowOnWorkspace: function(w, workspace) {
            if (w.get_workspace() == workspace)
                return true;
        return false;
    },

    _sortAppIcon : function(appIcon1, appIcon2) {
        let t1 = appIcon1.cachedWindows[0].get_user_time();
        let t2 = appIcon2.cachedWindows[0].get_user_time();
        if (t2 > t1) return 1;
        else return -1;
    }
};

function AltTabSettingsDialog() {
    this._init();
}

AltTabSettingsDialog.prototype = {
    __proto__: ModalDialog.ModalDialog.prototype,

    _init : function() {
        ModalDialog.ModalDialog.prototype._init.call(this, { styleClass: null });

        let mainContentBox = new St.BoxLayout({ style_class: 'polkit-dialog-main-layout',
                                                vertical: false });
        this.contentLayout.add(mainContentBox,
                               { x_fill: true,
                                 y_fill: true });

        let messageBox = new St.BoxLayout({ style_class: 'polkit-dialog-message-layout',
                                            vertical: true });
        mainContentBox.add(messageBox,
                           { y_align: St.Align.START });

        this._subjectLabel = new St.Label({ style_class: 'polkit-dialog-headline',
                                            text: _("Alt Tab Behaviour") });

        messageBox.add(this._subjectLabel,
                       { y_fill:  false,
                         y_align: St.Align.START });

        this._descriptionLabel = new St.Label({ style_class: 'polkit-dialog-description',
                                                text: Gettext.gettext(MESSAGE) });

        messageBox.add(this._descriptionLabel,
                       { y_fill:  true,
                         y_align: St.Align.START });


        this.setButtons([
            {
                label: _("All & Thumbnails"),
                action: Lang.bind(this, function() {
                    this.setBehaviour('all_thumbnails');
                    this.close();
                })
            },
            {
                label: _("Workspace & Icons"),
                action: Lang.bind(this, function() {
                    this.setBehaviour('workspace_icons');
                    this.close();
                })
            },
            {
                label: _("Native"),
                action: Lang.bind(this, function() {
                    this.setBehaviour('native');
                    this.close();
                })
            },
            {
                label: _("Cancel"),
                action: Lang.bind(this, function() {
                    this.close();
                }),
                key: Clutter.Escape
            }
        ]);
    },

    setBehaviour: function(behaviour) {
           this._settings = new Gio.Settings({ schema: SETTINGS_SCHEMA });
           this._settings.set_string(SETTINGS_BEHAVIOUR_KEY, behaviour);
           this._settings.set_boolean(SETTINGS_FIRST_TIME_KEY, false);
    }
};

function AltTabPopup2() {
    this._init();
}

AltTabPopup2.prototype = {
    __proto__ : AltTab.AltTabPopup.prototype,

    _init : function() {
        this.actor = new Shell.GenericContainer({ name: 'altTabPopup',
                                                  reactive: true });

        this.actor.connect('get-preferred-width', Lang.bind(this, this._getPreferredWidth));
        this.actor.connect('get-preferred-height', Lang.bind(this, this._getPreferredHeight));
        this.actor.connect('allocate', Lang.bind(this, this._allocate));

        this.actor.connect('destroy', Lang.bind(this, this._onDestroy));

        this._haveModal = false;

        this._currentApp = 0;
        this._currentWindow = -1;
        this._thumbnailTimeoutId = 0;
        this._motionTimeoutId = 0;

        // Initially disable hover so we ignore the enter-event if
        // the switcher appears underneath the current pointer location
        this._disableHover();

	this.show();
        Main.uiGroup.add_actor(this.actor);
        this._select(0);
    },

    show : function(backward) {
        let windows = global.get_window_actors();

	let list = '';
	let normal_windows= [];
	let appIcons = [];
	let appSys = Shell.AppSystem.get_default();
	let apps = appSys.get_running();

	for (let w = windows.length-1; w >= 0; w--) {
	    let win = windows[w].get_meta_window();
	        normal_windows.push(win);
	}
	normal_windows.sort(Lang.bind(this, this._sortWindows));

        let win_on_top = normal_windows.shift();
        normal_windows.push(win_on_top);
	windows = normal_windows;
	for (let w = 0; w < windows.length; w++) {
	    let win = windows[w];

	    let ap1 = null;
	    for (let i = 0;i < apps.length; i++) {
	        let app_wins = apps[i].get_windows();
	        for (let j = 0;j < app_wins.length; j++) {
	            if (app_wins[j] == win)
		        ap1 = new AltTab.AppIcon(apps[i]);
	        }
	    }
	    if (ap1 != null) {
              ap1.cachedWindows = [win];
	      appIcons.push(ap1);
            }
	}

        if (!windows.length)
            return false;

        if (!Main.pushModal(this.actor))
            return false;
        this._haveModal = true;

        this.actor.connect('key-press-event', Lang.bind(this, this._keyPressEvent));
        this.actor.connect('key-release-event', Lang.bind(this, this._keyReleaseEvent));

        this.actor.connect('button-press-event', Lang.bind(this, this._clickedOutside));
        this.actor.connect('scroll-event', Lang.bind(this, this._onScroll));

        this._appSwitcher = new WindowList(windows);
	this._appSwitcher._altTabPopup=this;
        this.actor.add_actor(this._appSwitcher.actor);
        this._appSwitcher.connect('item-activated', Lang.bind(this, this._appActivated));
        this._appSwitcher.connect('item-entered', Lang.bind(this, this._appEntered));

        this._appIcons = appIcons;


	return true
    },

    _keyPressEvent : function(actor, event) {
        let keysym = event.get_key_symbol();
        let shift = (Shell.get_event_state(event) & Clutter.ModifierType.SHIFT_MASK);
        // X allows servers to represent Shift+Tab in two different ways
        if (shift && keysym == Clutter.Tab)
            keysym = Clutter.ISO_Left_Tab;

        this._disableHover();

        if (keysym == Clutter.grave)
            this._select(this._currentApp, this._nextWindow());
        else if (keysym == Clutter.asciitilde)
            this._select(this._currentApp, this._previousWindow());
        else if (keysym == Clutter.Escape)
            this.destroy();
        else if (this._thumbnailsFocused) {
            if (keysym == Clutter.Tab) {
                if (this._currentWindow == this._appIcons[this._currentApp].cachedWindows.length - 1)
                    this._select(this._nextApp());
                else
                    this._select(this._currentApp, this._nextWindow());
            } else if (keysym == Clutter.ISO_Left_Tab) {
                if (this._currentWindow == 0 || this._currentWindow == -1)
                    this._select(this._previousApp());
                else
                    this._select(this._currentApp, this._previousWindow());
            } else if (keysym == Clutter.Left)
                this._select(this._currentApp, this._previousWindow());
            else if (keysym == Clutter.Right)
                this._select(this._currentApp, this._nextWindow());
            else if (keysym == Clutter.Up)
                this._select(this._currentApp, null, true);
        } else {
            if (keysym == Clutter.Tab)
                this._select(this._nextApp());
            else if (keysym == Clutter.ISO_Left_Tab)
                this._select(this._previousApp());
            else if (keysym == Clutter.Left)
                this._select(this._previousApp());
            else if (keysym == Clutter.Right)
                this._select(this._nextApp());
        }

        return true;
    },

    _sortWindows : function(win1,win2) {
        let t1 = win1.get_user_time();
        let t2 = win2.get_user_time();
        if (t2 > t1) return 1;
        else return -1;
    },

    _appActivated : function(thumbnailList, n) {
        let appIcon = this._appIcons[this._currentApp];
        Main.activateWindow(appIcon.cachedWindows[0]);
        this.destroy();
    },

    _finish : function() {
        let app = this._appIcons[this._currentApp];
        Main.activateWindow(app.cachedWindows[0]);
        this.destroy();
    },
};

function WindowList(windows) {
    this._init(windows);
}

WindowList.prototype = {
    __proto__ : AltTab.AppSwitcher.prototype,

    _init : function(windows) {
        AltTab.AppSwitcher.prototype._init.call(this, []);

        let activeWorkspace = global.screen.get_active_workspace();
        this._labels = new Array();
        this._thumbnailBins = new Array();
        this._clones = new Array();
        this._windows = windows;
        this._arrows= new Array();
        this.icons= new Array();
	for (let w = 0; w < windows.length; w++) {
            let arrow = new St.DrawingArea({ style_class: 'switcher-arrow' });
            arrow.connect('repaint', Lang.bind(this, function (area) {
                Shell.draw_box_pointer(area, Shell.PointerDirection.DOWN);
            }));
            this._list.add_actor(arrow);
            this._arrows.push(arrow);

            arrow.hide();

	    let win=windows[w];

	    let appSys = Shell.AppSystem.get_default();
	    let apps = appSys.get_running();
	    let ap1 = null;
	    for (let i = 0; i < apps.length; i++) {
	        let app_wins = apps[i].get_windows();
	        for (let j = 0; j < app_wins.length; j++) {
	            if (app_wins[j] == win) {
                        ap1 = new AltTab.AppIcon(apps[i]);
                        let mutterWindow = win.get_compositor_private();
                        let windowTexture = mutterWindow.get_texture ();
                        let [width, height] = windowTexture.get_size();
                        let scale = Math.min(1.0, 128 / width, 128 / height);

                        let clone = new Clutter.Clone ({ source: windowTexture, reactive: true,  width: width * scale, height: height * scale });
                        ap1.icon = ap1.app.create_icon_texture(128);
                        ap1._iconBin.set_size(128,128);
	                ap1._iconBin.child=clone;

                        ap1.label.text=win.get_title();
	            }
	        }
  	    }
            if (ap1 != null) {
	    ap1.cachedWindows = [win];
            this._addIcon(ap1);
            }
	}
    },

    addSeparator: function () {
        this._separator=null;
    }
};

function init(metadata) {
    imports.gettext.bindtextdomain('gnome-shell-extensions', metadata.localedir);
}

function doAltTab(shellwm, binding, window, backwards) {
    let settings = new Gio.Settings({ schema: SETTINGS_SCHEMA });

    if(settings.get_boolean(SETTINGS_FIRST_TIME_KEY)) {
        new AltTabSettingsDialog().open();
    } else {
        let behaviour = settings.get_string(SETTINGS_BEHAVIOUR_KEY);
        if(behaviour in MODES) {
            MODES[behaviour](binding, backwards);
        }
    }
}

function enable() {
    Main.wm.setKeybindingHandler('switch_windows', doAltTab);
    Main.wm.setKeybindingHandler('switch_group', doAltTab);
    Main.wm.setKeybindingHandler('switch_windows_backward', doAltTab);
    Main.wm.setKeybindingHandler('switch_group_backward', doAltTab);
}

function disable() {
    Main.wm.setKeybindingHandler('switch_windows', Lang.bind(Main.wm, Main.wm._startAppSwitcher));
    Main.wm.setKeybindingHandler('switch_group', Lang.bind(Main.wm, Main.wm._startAppSwitcher));
    Main.wm.setKeybindingHandler('switch_windows_backward', Lang.bind(Main.wm, Main.wm._startAppSwitcher));
    Main.wm.setKeybindingHandler('switch_group_backward', Lang.bind(Main.wm, Main.wm._startAppSwitcher));
}