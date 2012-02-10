/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

/* most of the code is borrowed from
 * > js/ui/altTab.js <
 * of the gnome-shell source code
 */

const Clutter = imports.gi.Clutter;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const AltTab = imports.ui.altTab;
const Main = imports.ui.main;
const ModalDialog = imports.ui.modalDialog;
const Tweener = imports.ui.tweener;
const WindowManager = imports.ui.windowManager;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;
const N_ = function(e) { return e };

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

let settings;

const POPUP_DELAY_TIMEOUT = 150; // milliseconds

const SETTINGS_BEHAVIOUR_KEY = 'behaviour';
const SETTINGS_HIGHLIGHT_SELECTED_KEY = 'highlight-selected';

const AltTabPopupWorkspaceIcons = new Lang.Class({
    Name: 'AlternateTab.AltTabPopupWorkspaceIcons',
    Extends: AltTab.AltTabPopup,

    _windowActivated : function(thumbnailList, n) { },

    show : function(backward, binding, mask) {
        let appSys = Shell.AppSystem.get_default();
        let apps = appSys.get_running ();

        if (!apps.length)
            return false;

        if (!Main.pushModal(this.actor)) {
            // Probably someone else has a pointer grab, try again with keyboard only
            if (!Main.pushModal(this.actor, global.get_current_time(), Meta.ModalOptions.POINTER_ALREADY_GRABBED)) {
                return false;
            }
        }
        this._haveModal = true;
        this._modifierMask = AltTab.primaryModifier(mask);

        this.actor.connect('key-press-event', Lang.bind(this, this._keyPressEvent));
        this.actor.connect('key-release-event', Lang.bind(this, this._keyReleaseEvent));

        this.actor.connect('button-press-event', Lang.bind(this, this._clickedOutside));
        this.actor.connect('scroll-event', Lang.bind(this, this._onScroll));

        this._appSwitcher = new WindowSwitcher(apps, this);
        this.actor.add_actor(this._appSwitcher.actor);
        this._appSwitcher.connect('item-activated', Lang.bind(this, this._appActivated));
        this._appSwitcher.connect('item-entered', Lang.bind(this, this._appEntered));

        this._appIcons = this._appSwitcher.icons;

        // Need to force an allocation so we can figure out whether we
        // need to scroll when selecting
        this.actor.opacity = 0;
        this.actor.show();
        this.actor.get_allocation_box();

        this._highlight_selected = settings.get_boolean(SETTINGS_HIGHLIGHT_SELECTED_KEY);

        // Make the initial selection
        if (binding == 'switch_group') {
            //see AltTab.AltTabPopup.show function
            //cached windows are always of length one, so select first app and the window
            //the direction doesn't matter, so ignore backward
            this._select(0, 0);
        } else if (binding == 'switch_group_backward') {
            this._select(0, 0);
        } else if (binding == 'switch_windows_backward') {
            this._select(this._appIcons.length - 1);
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
        if (!(mods & this._modifierMask)) {
            this._finish();
            return false;
        }

        // We delay showing the popup so that fast Alt+Tab users aren't
        // disturbed by the popup briefly flashing.
        this._initialDelayTimeoutId = Mainloop.timeout_add(POPUP_DELAY_TIMEOUT,
                                                           Lang.bind(this, function () {
                                                               this.actor.opacity = 255;
                                                               this._initialDelayTimeoutId = 0;
                                                           }));

        return true;
    },

    _select : function(app, window, forceAppFocus) {
        if (app != this._currentApp || window == null) {
            if (this._thumbnails)
                this._destroyThumbnails();
        }

        if (this._thumbnailTimeoutId != 0) {
            Mainloop.source_remove(this._thumbnailTimeoutId);
            this._thumbnailTimeoutId = 0;
        }

        this._thumbnailsFocused = (window != null) && !forceAppFocus;

        this._currentApp = app;
        this._currentWindow = window ? window : -1;
        this._appSwitcher.highlight(app, this._thumbnailsFocused);

        if (window != null) {
            if (!this._thumbnails)
                this._createThumbnails();
            this._currentWindow = window;
            this._thumbnails.highlight(window, forceAppFocus);
        } else if (this._appIcons[this._currentApp].cachedWindows.length > 1 &&
                   !forceAppFocus) {
            this._thumbnailTimeoutId = Mainloop.timeout_add (
                THUMBNAIL_POPUP_TIME,
                Lang.bind(this, this._timeoutPopupThumbnails));
        }
        if (this._highlight_selected) {
            let current_app = this._appIcons[this._currentApp];
            Main.activateWindow(current_app.cachedWindows[0]);
        }
    },

    _finish : function() {
        let app = this._appIcons[this._currentApp];
        if (!app)
            return;

        /*
         * We've to restore the original Z-depth and order of all windows.
         *
         * Gnome-shell doesn't give an option to change Z-depth without
         * messing the window's user_time.
         *
         * Pointless if the popup wasn't showed.
         */
        if (this._highlight_selected && this.actor.opacity == 255) {
            for (let i = this._appIcons.length - 2; i >= 0; i--) {
                let app_walker = this._appIcons[i];
                Main.activateWindow(app_walker.cachedWindows[0], global.get_current_time() - i - 1);
            }
        }

        Main.activateWindow(app.cachedWindows[0]);
        this.destroy();
    }

});

const AppIcon = new Lang.Class({
    Name: 'AlternateTab.AppIcon',
    Extends: AltTab.AppIcon,

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
});

const WindowSwitcher = new Lang.Class({
    Name: 'AlternateTab.WindowSwitcher',
    Extends: AltTab.AppSwitcher,

    _init : function(apps, altTabPopup) {
        // Horrible HACK!
        // We inherit from AltTab.AppSwitcher, but only chain up to
        // AltTab.SwitcherList._init, to bypass AltTab.AppSwitcher._init
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
});

const AltTabPopupAllThumbnails = new Lang.Class({
    Name: 'AlternateTab.AltTabPopup.AllThumbnails',
    Extends: AltTab.AltTabPopup,

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

	//this.show();
        Main.uiGroup.add_actor(this.actor);
        //this._select(0);
    },

    show : function(backward, binding, mask) {
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

        if (!windows.length) {
            this.destroy();
            return false;
        }

        if (!Main.pushModal(this.actor)) {
            // Probably someone else has a pointer grab, try again with keyboard only
            if (!Main.pushModal(this.actor, global.get_current_time(), Meta.ModalOptions.POINTER_ALREADY_GRABBED)) {
                return false;
            }
        }
        this._haveModal = true;
        this._modifierMask = AltTab.primaryModifier(mask);

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

        // make the initial selection
        if (backward)
            this._select(windows.length - 2);
        else
            this._select(0);

        this.actor.opacity = 0;
        this.actor.show();

        // There's a race condition; if the user released Alt before
        // we got the grab, then we won't be notified. (See
        // https://bugzilla.gnome.org/show_bug.cgi?id=596695 for
        // details.) So we check now. (Have to do this after updating
        // selection.)
        let [x, y, mods] = global.get_pointer();
        if (!(mods & this._modifierMask)) {
            this._finish();
            return false;
        }

        // We delay showing the popup so that fast Alt+Tab users aren't
        // disturbed by the popup briefly flashing.
        this._initialDelayTimeoutId = Mainloop.timeout_add(AltTab.POPUP_DELAY_TIMEOUT,
                                                           Lang.bind(this, function () {
                                                               this.actor.opacity = 255;
                                                               this._initialDelayTimeoutId = 0;
                                                           }));

	return true
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
});

const WindowList = new Lang.Class({
    Name: 'AlternateTab.WindowList',
    Extends: AltTab.SwitcherList,

    _init : function(windows) {
        this.parent(true);

        let activeWorkspace = global.screen.get_active_workspace();
        this._labels = new Array();
        this._thumbnailBins = new Array();
        this._clones = new Array();
        this._windows = windows;
        this._arrows = new Array();
        this.icons = new Array();
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
	                ap1._iconBin.child = clone;

                        ap1.label.text = win.get_title();
	            }
	        }
  	    }
            if (ap1 != null) {
	        ap1.cachedWindows = [win];
                this.addItem(ap1.actor, ap1.label);
                this.icons.push(ap1);
            }
	}
    },

    addSeparator: function () {
        this._separator=null;
    }
});

const MODES = {
    all_thumbnails: AltTabPopupAllThumbnails,
    workspace_icons: AltTabPopupWorkspaceIcons,
};

function doAltTab(display, screen, window, binding) {
    let behaviour = settings.get_string(SETTINGS_BEHAVIOUR_KEY);

    // alt-tab having no effect is unexpected, even with wrong settings
    if (!(behaviour in MODES))
        behaviour = 'all_thumbnails';

    if (Main.wm._workspaceSwitcherPopup)
        Main.wm._workspaceSwitcherPopup.actor.hide();

    let modifiers = binding.get_modifiers()
    let backwards = modifiers & Meta.VirtualModifier.SHIFT_MASK;

    let constructor = MODES[behaviour];
    let popup = new constructor();
    if (!popup.show(backwards, binding.get_name(), binding.get_mask()))
        popup.destroy();
}

function init(metadata) {
    Convenience.initTranslations();
    settings = Convenience.getSettings();
}

function enable() {
    Meta.keybindings_set_custom_handler('switch-windows', doAltTab);
    Meta.keybindings_set_custom_handler('switch-group', doAltTab);
    Meta.keybindings_set_custom_handler('switch-windows-backward', doAltTab);
    Meta.keybindings_set_custom_handler('switch-group-backward', doAltTab);
}

function disable() {
    Meta.keybindings_set_custom_handler('switch-windows', Lang.bind(Main.wm, Main.wm._startAppSwitcher));
    Meta.keybindings_set_custom_handler('switch-group', Lang.bind(Main.wm, Main.wm._startAppSwitcher));
    Meta.keybindings_set_custom_handler('switch-windows-backward', Lang.bind(Main.wm, Main.wm._startAppSwitcher));
    Meta.keybindings_set_custom_handler('switch-group-backward', Lang.bind(Main.wm, Main.wm._startAppSwitcher));
}
