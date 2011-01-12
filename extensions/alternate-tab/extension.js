// Sample extension code, makes clicking on the panel show a message
const St = imports.gi.St;
const Mainloop = imports.mainloop;
const AltTab=imports.ui.altTab;

const Main = imports.ui.main;
const WindowManager = imports.ui.windowManager;
const Clutter = imports.gi.Clutter;
const Tweener = imports.ui.tweener;
const Shell= imports.gi.Shell;
const Lang = imports.lang;



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
        let tracker = Shell.WindowTracker.get_default();
        let windows=global.get_window_actors();
//        let windows=global.get_window_actors();
	let liste='';
	let normal_windows=[];
	let appIcons=[];
	let tracker = Shell.WindowTracker.get_default();
	let apps = tracker.get_running_apps ('');

	for (let w=windows.length-1; w>=0;w--) {	
	  let win=windows[w].get_meta_window();
	  if (win.window_type==0) {
	    normal_windows.push(win);
	    	  	  }
	}
	normal_windows.sort(Lang.bind(this, this._sortWindows));



     let win_on_top=normal_windows.shift();
     normal_windows.push(win_on_top);
	windows=normal_windows;
	for (let w=0; w<windows.length;w++) {
	  let win=windows[w];
	  //log(/"Cherche : "+win.get_title());
	  let ap1=null;
	    for (let i=0;i<apps.length;i++) {
	      let app_wins=apps[i].get_windows();
	      for (let j=0;j<app_wins.length;j++) {
	        //log(/app_wins[j].get_title());
	        if (app_wins[j]==win) {
		  ap1=new AltTab.AppIcon(apps[i]);
		  //log(/ "ok");
		}

	      }
	    }
	    ap1.cachedWindows=[win];
	    appIcons.push(ap1); 
	    }


//      apps=apps[0].get_windows();

        if (!windows.length)
            return false;

        if (!Main.pushModal(this.actor))
            return false;
        this._haveModal = true;

        //this._keyPressEventId = global.stage.connect('key-press-event', Lang.bind(this, this._keyPressEvent));
	//this._keyReleaseEventId = global.stage.connect('key-release-event', Lang.bind(this, this._keyReleaseEvent));
        this.actor.connect('key-press-event', Lang.bind(this, this._keyPressEvent));
        this.actor.connect('key-release-event', Lang.bind(this, this._keyReleaseEvent));


        this.actor.connect('button-press-event', Lang.bind(this, this._clickedOutside));
        this.actor.connect('scroll-event', Lang.bind(this, this._onScroll));

        this._appSwitcher = new WindowList(windows);
	this._appSwitcher.highlight(0,false);
        this.actor.add_actor(this._appSwitcher.actor);
        this._appSwitcher.connect('item-activated', Lang.bind(this, this._appActivated));
        this._appSwitcher.connect('item-entered', Lang.bind(this, this._appEntered));

        this._appIcons = appIcons;
        //this._appSwitcher.icons=[];
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
    let t1=win1.get_user_time();
    let t2=win2.get_user_time();
    if (t2>t1) return 1;
    else return -1;
},
 _appActivated : function(thumbnailList, n) {
        //log(/"Activé !");
        let appIcon = this._appIcons[this._currentApp];
        Main.activateWindow(appIcon.cachedWindows[0]);
        this.destroy();
    },
    _finish : function() {
       let app = this._appIcons[this._currentApp];
Main.activateWindow(app.cachedWindows[0]);
  this.destroy();

},
/*_appEntered : function(thumbnailList, n) { 
       if (!this._mouseActive)
            return;

        this._select(this._currentApp, n);
    },*/




};





function WindowList(windows) {
  this._init(windows);
}
WindowList.prototype = {
     __proto__ : AltTab.AppSwitcher.prototype ,
    _init : function(windows) {
      
      AltTab.AppSwitcher.prototype._init.call(this,[]);
      let activeWorkspace = global.screen.get_active_workspace();
       this._labels = new Array();
        this._thumbnailBins = new Array();
        this._clones = new Array();
        this._windows = windows;
            this._arrows= new Array();
       this.icons= new Array();
	for (let w=0; w<windows.length;w++) {	
           let arrow = new St.DrawingArea({ style_class: 'switcher-arrow' });
        arrow.connect('repaint', Lang.bind(this,
            function (area) {
                Shell.draw_box_pointer(area, Shell.PointerDirection.DOWN);
            }));
        this._list.add_actor(arrow);
        this._arrows.push(arrow);

            arrow.hide();

	  let win=windows[w];
	  //log(/"xxxxxxxxxxxxxxxxxCherche : "+win.get_title());
	let tracker = Shell.WindowTracker.get_default();
	let apps = tracker.get_running_apps ('');
	  let ap1=null;
	  for (let i=0;i<apps.length;i++) {
	    let app_wins=apps[i].get_windows();
	    for (let j=0;j<app_wins.length;j++) {
	      //log(/app_wins[j].get_title());
	      if (app_wins[j]==win) {
           	  ap1=new AltTab.AppIcon(apps[i]);
let mutterWindow = win.get_compositor_private();
           let windowTexture = mutterWindow.get_texture ();
           let [width, height] = windowTexture.get_size();
           let scale = Math.min(1.0, 128 / width, 128 / height);
	   log(width+","+height+","+scale+":"+win.get_title());

           let clone = new Clutter.Clone ({ source: windowTexture, reactive: true,  width: width * scale, height: height * scale });
		  ap1.icon=ap1.app.create_icon_texture(128);
		  ap1._iconBin.set_size(128,128);
	          ap1._iconBin.child=clone;

                  ap1.label.text=win.get_title();
		  //log(/ "ok");
	      }

	    }
  	  }
	    ap1.cachedWindows=[win];
             this._addIcon(ap1);
        //log(/"~~~~~~~²²Icones :"+this.icons.length);
	    //this.icons.push(ap1); 
	}

        /*for (let i = 0; i < windows.length; i++) {         
            let arrow = new St.DrawingArea({ style_class: 'switcher-arrow' });
    let mutterWindow = windows[i].get_compositor_private();
           let windowTexture = mutterWindow.get_texture ();
           let [width, height] = windowTexture.get_size();
           let scale = Math.min(1.0, 128 / width, 128 / height);
           let clone = new Clutter.Clone ({ source: windowTexture, reactive: true,  width: width * scale, height: height * scale });
	   this._clones.push(clone);

	let box = new St.BoxLayout({ style_class: 'thumbnail-box',
                                         vertical: true });

            let bin = new St.Bin({ style_class: 'thumbnail' });

            box.add_actor(bin);
            this._thumbnailBins.push(bin);

            let title = windows[i].get_title();
            if (title) {
                let name = new St.Label({ text: title });
                // St.Label doesn't support text-align so use a Bin
                //let bin = new St.Bin({ x_align: St.Align.MIDDLE });
            //    this._labels.push(bin);
             //   bin.add_actor(name);
//bin.add_actor(clone);
 //               box.add_actor(bin);
            }

            this.addItem(box);
        }*/
    },
     _sortAppIcon : function(appIcon1, appIcon2) {
   log ("TRIIIIIIII");
return 1;
},
    addSeparator: function () {
      this._separator=null;
      }

};
function _myAltTab() {

    /*let monitor = global.get_primary_monitor();
    let windows=global.get_windows();
    let liste='';
    let normal_windows=[];
       //log(/"~~~~~~~~~~~~~ LISTE ~~~~~~~~~~~~~~");
     for (let w=0; w<windows.length;w++) {
       let win=windows[w].get_meta_window();
       //log(/win.get_title()+":"+win.get_layer() );
       let chaine=""
       if (win.get_layer()==2) {normal_windows.push(win);
         }
     }
       //log(/"~~~~~~~~~~~~~ LISTE2 ~~~~~~~~~~~~~~");

     for (let w=0; w<normal_windows.length;w++) {
     let win=normal_windows[w]
       //log(/win.get_title());
     //  let text = new St.Label({ style_class: 'helloworld-label', text: win.get_title() })
    
     //  global.stage.add_actor(text);
     //  text.set_position(Math.floor (monitor.width / 2 - text.width / 2), Math.floor(monitor.height / 2 - text.height / 2 -w*text.height));
     //  Mainloop.timeout_add(1000, function () { text.destroy(); });
     }
     log ("============== liste2======");
     let win_on_top=normal_windows.pop();
     normal_windows.unshift(win_on_top);*/
     let alpopup=new AltTabPopup2();
     //alpopup.winlist=new WindowList(normal_windows)
    //global.stage.add_actor(alpopup.actor)
      /*       Tweener.addTween(thumblist.actor,
	                              { opacity: 255,
				                                 time: 0.1,
								                            transition: 'easeOutQuad'
											                             });
*/
     /*for (let w=0; w<normal_windows.length;w++) {
     let win=normal_windows[w];
       //log(/win.get_title());
       let text = new St.Label({ style_class: 'helloworld-label', text: win.get_title() })
           let mutterWindow = win.get_compositor_private();
           let windowTexture = mutterWindow.get_texture ();
           let [width, height] = windowTexture.get_size();
           let scale = Math.min(1.0, 128 / width, 128 / height);
           let clone = new Clutter.Clone ({ source: windowTexture, reactive: true,  width: width * scale, height: height * scale });
     let bin = new St.Bin({ x_align: St.Align.MIDDLE });
	   bin.add_actor(clone);


    
       global.stage.add_actor(bin);
       bin.set_position(Math.floor (monitor.width / 2 - bin.width / 2)-w*bin.height, Math.floor(monitor.height / 2 - bin.height / 2 ));
       Mainloop.timeout_add(1000, function () { bin.destroy(); });
       */



   

}

// Put your extension initialization code here
function main() {
       Main.wm.setKeybindingHandler('switch_windows', _myAltTab);

}
