/* -*- mode: js; js-basic-offset: 4; indent-tabs-mode: nil -*- */

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

const AppIconMode = {
    THUMBNAIL_ONLY: 1,
    APP_ICON_ONLY: 2,
    BOTH: 3,
};

const SETTINGS_APP_ICON_MODE = 'app-icon-mode';
const SETTINGS_CURRENT_WORKSPACE_ONLY = 'current-workspace-only';

function mod(a, b) {
    return ((a+b) % b);
}

const AltTabPopup = new Lang.Class({
    Name: 'AlternateTab.AltTabPopup',

    _init : function(settings) {
	this._settings = settings;

        this.actor = new Shell.GenericContainer({ name: 'altTabPopup',
                                                  reactive: true });

        this.actor.connect('get-preferred-width', Lang.bind(this, this._getPreferredWidth));
        this.actor.connect('get-preferred-height', Lang.bind(this, this._getPreferredHeight));
        this.actor.connect('allocate', Lang.bind(this, this._allocate));

        this._haveModal = false;

        this._currentWindow = 0;
        this._motionTimeoutId = 0;
        this._initialDelayTimeoutId = 0;

        // Initially disable hover so we ignore the enter-event if
        // the switcher appears underneath the current pointer location
        this._disableHover();

        Main.uiGroup.add_actor(this.actor);
    },

    _getPreferredWidth: function (actor, forHeight, alloc) {
        alloc.min_size = global.screen_width;
        alloc.natural_size = global.screen_width;
    },

    _getPreferredHeight: function (actor, forWidth, alloc) {
        alloc.min_size = global.screen_height;
        alloc.natural_size = global.screen_height;
    },

    _allocate: function (actor, box, flags) {
        let childBox = new Clutter.ActorBox();
        let primary = Main.layoutManager.primaryMonitor;

        let leftPadding = this.actor.get_theme_node().get_padding(St.Side.LEFT);
        let rightPadding = this.actor.get_theme_node().get_padding(St.Side.RIGHT);
        let bottomPadding = this.actor.get_theme_node().get_padding(St.Side.BOTTOM);
        let vPadding = this.actor.get_theme_node().get_vertical_padding();
        let hPadding = leftPadding + rightPadding;

        // Allocate the appSwitcher
        // We select a size based on an icon size that does not overflow the screen
        let [childMinHeight, childNaturalHeight] = this._appSwitcher.actor.get_preferred_height(primary.width - hPadding);
        let [childMinWidth, childNaturalWidth] = this._appSwitcher.actor.get_preferred_width(childNaturalHeight);
        childBox.x1 = Math.max(primary.x + leftPadding, primary.x + Math.floor((primary.width - childNaturalWidth) / 2));
        childBox.x2 = Math.min(primary.x + primary.width - rightPadding, childBox.x1 + childNaturalWidth);
        childBox.y1 = primary.y + Math.floor((primary.height - childNaturalHeight) / 2);
        childBox.y2 = childBox.y1 + childNaturalHeight;
        this._appSwitcher.actor.allocate(childBox, flags);
    },

    show : function(backward, binding, mask) {
	let windows;

	if (!settings.get_boolean(SETTINGS_CURRENT_WORKSPACE_ONLY)) {
	    // This is roughly what meta_display_get_tab_list does, except
	    // that it doesn't filter on workspace
	    // See in particular src/core/window-private.h for the filters
	    windows = global.get_window_actors().map(function(actor) {
		return actor.meta_window;
	    }).filter(function(win) {
		return !win.is_override_redirect() &&
		    win.get_window_type() != Meta.WindowType.DESKTOP &&
		    win.get_window_type() != Meta.WindowType.DOCK;
	    }).sort(function(one, two) {
		return two.get_user_time() - one.get_user_time();
	    });
	} else {
	    windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, global.screen,
						  global.screen.get_active_workspace());
	}

        // Filter away attached modal dialogs (switch to their parents instead)
        windows = windows.filter(function(win) { return !win.is_attached_dialog(); });

        if (windows.length == 0)
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

        this._appSwitcher = new WindowList(windows, this._settings);
        this.actor.add_actor(this._appSwitcher.actor);
        this._appSwitcher.connect('item-activated', Lang.bind(this, this._windowActivated));
        this._appSwitcher.connect('item-entered', Lang.bind(this, this._windowEntered));

        // make the initial selection
	this._currentWindow = 0;
        if (backward)
            this._select(this._previousWindow());
        else
            this._select(this._nextWindow());

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

    _windowActivated : function(thumbnailList, n) {
	let win = this._appSwitcher.windows[n];
        Main.activateWindow(win);
        this.destroy();
    },

    _finish : function() {
        let win = this._appSwitcher.windows[this._currentWindow];
        Main.activateWindow(win);
        this.destroy();
    },

    _keyPressEvent : function(actor, event) {
        let keysym = event.get_key_symbol();
        let event_state = event.get_state();
        let backwards = event_state & Clutter.ModifierType.SHIFT_MASK;
        let action = global.display.get_keybinding_action(event.get_key_code(), event_state);

        this._disableHover();

        if (keysym == Clutter.Escape) {
            this.destroy();
        } else if (action == Meta.KeyBindingAction.SWITCH_WINDOWS ||
		   action == Meta.KeyBindingAction.SWITCH_GROUP) {
            this._select(backwards ? this._previousWindow() : this._nextWindow());
        } else if (action == Meta.KeyBindingAction.SWITCH_WINDOWS_BACKWARD ||
		  action == Meta.KeyBindingAction.SWITCH_GROUP_BACKWARD) {
            this._select(this._previousWindow());
        } else {
	    if (keysym == Clutter.Left)
                this._select(this._previousWindow());
            else if (keysym == Clutter.Right)
                this._select(this._nextWindow());
        }

        return true;
    },

    _keyReleaseEvent : function(actor, event) {
        let [x, y, mods] = global.get_pointer();
        let state = mods & this._modifierMask;

        if (state == 0)
            this._finish();

        return true;
    },

    _onScroll : function(actor, event) {
        let direction = event.get_scroll_direction();
        if (direction == Clutter.ScrollDirection.UP)
            this._select(this._previousWindow());
	else if (direction == Clutter.ScrollDirection.DOWN)
            this._select(this._nextWindow());

	return true;
    },

    _clickedOutside : function(actor, event) {
        this.destroy();
    },

    _windowEntered : function(windowSwitcher, n) {
        if (!this._mouseActive)
            return;

        this._select(n);
    },

    _disableHover : function() {
        this._mouseActive = false;

        if (this._motionTimeoutId != 0)
            Mainloop.source_remove(this._motionTimeoutId);

        this._motionTimeoutId = Mainloop.timeout_add(AltTab.DISABLE_HOVER_TIMEOUT, Lang.bind(this, this._mouseTimedOut));
    },

    _mouseTimedOut : function() {
        this._motionTimeoutId = 0;
        this._mouseActive = true;
    },

    _popModal: function() {
        if (this._haveModal) {
            Main.popModal(this.actor);
            this._haveModal = false;
        }
    },

    destroy : function() {
        this._popModal();
        if (this.actor.visible) {
            Tweener.addTween(this.actor,
                             { opacity: 0,
                               time: AltTab.POPUP_FADE_OUT_TIME,
                               transition: 'easeOutQuad',
                               onComplete: Lang.bind(this, this._finishDestroy),
                             });
        } else
            this._finishDestroy();
    },

    _finishDestroy : function() {
        if (this._motionTimeoutId != 0) {
            Mainloop.source_remove(this._motionTimeoutId);
            this._motionTimeoutId = 0;
        }

        if (this._initialDelayTimeoutId != 0) {
            Mainloop.source_remove(this._initialDelayTimeoutId);
            this._initialDelayTimeoutId = 0;
        }

        this.actor.destroy();
    },

    _select : function(window) {
        this._currentWindow = window;
        this._appSwitcher.highlight(window);
    },

    _nextWindow: function() {
	return mod(this._currentWindow + 1, this._appSwitcher.windows.length);
    },

    _previousWindow: function() {
	return mod(this._currentWindow - 1, this._appSwitcher.windows.length);
    },
});

const WindowIcon = new Lang.Class({
    Name: 'AlternateTab.WindowIcon',

    _init: function(window, settings) {
	this.window = window;
	this._settings = settings;

        this.actor = new St.BoxLayout({ style_class: 'alt-tab-app',
                                        vertical: true });
        this.icon = null;
        this._iconBin = new St.Widget({ layout_manager: new Clutter.BinLayout() });

        this.actor.add(this._iconBin, { x_fill: false, y_fill: false } );
        this.label = new St.Label({ text: window.get_title() });
        this.actor.add(this.label, { x_fill: false });

	let tracker = Shell.WindowTracker.get_default();
	this.app = tracker.get_window_app(window);

        let mutterWindow = this.window.get_compositor_private();
        let windowTexture = mutterWindow.get_texture();
        let [width, height] = windowTexture.get_size();
        let scale, size;

	this._iconBin.destroy_all_children();

	switch (this._settings.get_enum(SETTINGS_APP_ICON_MODE)) {
	case AppIconMode.THUMBNAIL_ONLY:
	    scale = Math.min(1.0, 128 / width, 128 / height);
	    size = 128;
            this.clone = new Clutter.Clone({ source: windowTexture,
					     width: width * scale,
					     height: height * scale,
					     x_align: Clutter.ActorAlign.CENTER,
					     y_align: Clutter.ActorAlign.CENTER,
					     // usual hack for the usual bug in ClutterBinLayout...
				             x_expand: true,
					     y_expand: true });
	    this._iconBin.add_actor(this.clone);
	    break;

	case AppIconMode.BOTH:
	    scale = Math.min(1.0, 128 / width, 128 / height);
	    size = 128;
            this.clone = new Clutter.Clone({ source: windowTexture,
					     width: width * scale,
					     height: height * scale,
					     x_align: Clutter.ActorAlign.CENTER,
					     y_align: Clutter.ActorAlign.CENTER,
					     // usual hack for the usual bug in ClutterBinLayout...
				             x_expand: true,
					     y_expand: true });
	    this._iconBin.add_actor(this.clone);

	    if (this.app) {
		this.appIcon = this.app.create_icon_texture(size / 2);
		this.appIcon.x_expand = this.appIcon.y_expand = true;
		this.appIcon.x_align = Clutter.ActorAlign.END;
		this.appIcon.y_align = Clutter.ActorAlign.END;
		this._iconBin.add_actor(this.appIcon);
	    }
	    break;

	case AppIconMode.APP_ICON_ONLY:
	    size = 96;
	    if (this.app) {
		this.appIcon = this.app.create_icon_texture(size);
		this.appIcon.x_expand = this.appIcon.y_expand = true;
	    } else {
		this.appIcon = new St.Icon({ icon_name: 'icon-missing',
					     icon_size: size,
					     x_expand: true,
					     y_expand: true });
	    }
	    this._iconBin.add_actor(this.appIcon);
	}

        this._iconBin.set_size(size, size);
    }
});

const WindowList = new Lang.Class({
    Name: 'AlternateTab.WindowList',
    Extends: AltTab.SwitcherList,

    _init : function(windows, settings) {
        this.parent(true);

        this.windows = windows;
        this.icons = [];

	for (let i = 0; i < windows.length; i++) {
	    let win = windows[i];
	    let icon = new WindowIcon(win, settings);

            this.addItem(icon.actor, icon.label);
            this.icons.push(icon);
	}
    }
});

function doAltTab(display, screen, window, binding) {
    if (Main.wm._workspaceSwitcherPopup)
        Main.wm._workspaceSwitcherPopup.actor.hide();

    let modifiers = binding.get_modifiers()
    let backwards = modifiers & Meta.VirtualModifier.SHIFT_MASK;

    let popup = new AltTabPopup(settings);
    if (!popup.show(backwards, binding.get_name(), binding.get_mask()))
        popup.destroy();
}

function init(metadata) {
    Convenience.initTranslations();
    settings = Convenience.getSettings();
}

function setKeybinding(name, func) {
    Main.wm.setCustomKeybindingHandler(name, Main.KeybindingMode.NORMAL, func);
}

function enable() {
    setKeybinding('switch-windows', doAltTab);
    setKeybinding('switch-group', doAltTab);
    setKeybinding('switch-windows-backward', doAltTab);
    setKeybinding('switch-group-backward', doAltTab);
}

function disable() {
    setKeybinding('switch-windows', Lang.bind(Main.wm, Main.wm._startAppSwitcher));
    setKeybinding('switch-group', Lang.bind(Main.wm, Main.wm._startAppSwitcher));
    setKeybinding('switch-windows-backward', Lang.bind(Main.wm, Main.wm._startAppSwitcher));
    setKeybinding('switch-group-backward', Lang.bind(Main.wm, Main.wm._startAppSwitcher));
}
