// Sample extension code, makes clicking on the panel show a message
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Mainloop = imports.mainloop;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const Main = imports.ui.main;

function _showHello() {
    let text = new St.Label({ style_class: 'helloworld-label', text: _("Hello, world!") });
    let monitor = Main.layoutManager.primaryMonitor;
    global.stage.add_actor(text);
    text.set_position(Math.floor (monitor.width / 2 - text.width / 2), Math.floor(monitor.height / 2 - text.height / 2));
    Mainloop.timeout_add(3000, function () { text.destroy(); });
}

// Put your extension initialization code here
function init(metadata) {
    log ('Example extension initalized');

    imports.gettext.bindtextdomain('gnome-shell-extensions', GLib.build_filenamev([metadata.path, 'locale']));
}

let signalId;

function enable() {
    log ('Example extension enabled');

    Main.panel.actor.reactive = true;
    signalId = Main.panel.actor.connect('button-release-event', _showHello);
}

function disable() {
    log ('Example extension disabled');

    if (signalId) {
	Main.panel.actor.disconnect(signalId);
	signalId = 0;
    }
}
