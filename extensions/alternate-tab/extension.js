/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Shell= imports.gi.Shell;
const St = imports.gi.St;

const AltTab=imports.ui.altTab;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const WindowManager = imports.ui.windowManager;

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
    },

    show : function(backward) {
        let windows = global.get_window_actors();

	let list = '';
	let normal_windows= [];
	let appIcons = [];
	let tracker = Shell.WindowTracker.get_default();
	let apps = tracker.get_running_apps ('');

	for (let w = windows.length-1; w >= 0; w--) {
	    let win = windows[w].get_meta_window();
	    if (win.window_type == 0) {
	        normal_windows.push(win);
	    }
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
	    ap1.cachedWindows = [win];
	    appIcons.push(ap1); 
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
	this._appSwitcher.highlight(0,false);
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

	    let tracker = Shell.WindowTracker.get_default();
	    let apps = tracker.get_running_apps ('');
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
	    ap1.cachedWindows = [win];
            this._addIcon(ap1);
	}
    },

    addSeparator: function () {
        this._separator=null;
    }
};

function main() {
    Main.wm.setKeybindingHandler('switch_windows', function() {
        let alpopup = new AltTabPopup2();
    });
}
