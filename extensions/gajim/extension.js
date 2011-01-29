/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const DBus = imports.dbus;
const Gettext = imports.gettext.domain('gnome-shell');
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Signals = imports.signals;
const St = imports.gi.St;
const Tp = imports.gi.TelepathyGLib;

const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const MessageTray = imports.ui.messageTray;
const Shell = imports.gi.Shell;
const TelepathyClient = imports.ui.telepathyClient;

const _ = Gettext.gettext;

// http://ntt.cc/ext/base64-Encoding-Decoding.html
const keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

function decode64(input) {
     let output = "";
     let chr1, chr2, chr3;
     let enc1, enc2, enc3, enc4;
     let i = 0;

     input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");

     do {
        enc1 = keyStr.indexOf(input.charAt(i++));
        enc2 = keyStr.indexOf(input.charAt(i++));
        enc3 = keyStr.indexOf(input.charAt(i++));
        enc4 = keyStr.indexOf(input.charAt(i++));

        chr1 = (enc1 << 2) | (enc2 >> 4);
        chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
        chr3 = ((enc3 & 3) << 6) | enc4;

        output = output + String.fromCharCode(chr1);

        if (enc3 != 64) {
           output = output + String.fromCharCode(chr2);
        }
        if (enc4 != 64) {
           output = output + String.fromCharCode(chr3);
        }

        chr1 = chr2 = chr3 = "";
        enc1 = enc2 = enc3 = enc4 = "";

     } while (i < input.length);

     return unescape(output);
}

function wrappedText(text, sender, timestamp, direction) {
    return {
        messageType: Tp.ChannelTextMessageType.NORMAL,
        text: text,
        sender: sender,
        timestamp: timestamp,
        direction: direction
    };
}

function Source(gajimClient, accountName, author, initialMessage) {
    this._init(gajimClient, accountName, author, initialMessage);
}

Source.prototype = {
    __proto__:  MessageTray.Source.prototype,

    _init: function(gajimClient, accountName, author, initialMessage) {
        MessageTray.Source.prototype._init.call(this, author);
        this.isChat = true;
        this._author = author;
        this._gajimClient = gajimClient;
        this._accountName = accountName;
        this._initialMessage = initialMessage;
        this._iconUri = null;
        this._presence = "online";

        this._notification = new TelepathyClient.Notification(this);
        this._notification.setUrgency(MessageTray.Urgency.HIGH);

        let jid = author.split('/')[0];
        let proxy = this._gajimClient.proxy();
        proxy.contact_infoRemote(jid, Lang.bind(this, this._gotContactInfos));
        this._statusChangeId = proxy.connect('ContactStatus',
                                             Lang.bind(this, this._onStatusChange));
        this._contactAbsenceId = proxy.connect('ContactAbsence',
                                               Lang.bind(this, this._onStatusChange));
        this._chatStateId = proxy.connect('ChatState',
                                          Lang.bind(this, this._onChatState));
        this._messageSentId = proxy.connect('MessageSent',
                                            Lang.bind(this, this._messageSent));
        this._newMessageId = proxy.connect('NewMessage',
                                             Lang.bind(this, this._messageReceived));
    },

    destroy: function() {
        let proxy = this._gajimClient.proxy();
        proxy.disconnect(this._statusChangeId);
        proxy.disconnect(this._contactAbsenceId);
        proxy.disconnect(this._chatStateId);
        proxy.disconnect(this._messageSentId);
        proxy.disconnect(this._newMessageId);
        MessageTray.Source.prototype.destroy.call(this);
    },

    _gotContactInfos: function(result, excp) {
        this.title = result['FN'];

        let avatarUri = null;
        if (result['PHOTO']) {
            let mimeType = result['PHOTO']['TYPE'];
            let avatarData = decode64(result['PHOTO']['BINVAL']);
            let sha = result['PHOTO']['SHA'];
            avatarUri = this._gajimClient.cacheAvatar(mimeType, sha, avatarData);
        }

        this._iconUri = avatarUri;
        this._setSummaryIcon(this.createNotificationIcon());

        let message = wrappedText(this._initialMessage, this._author, null, TelepathyClient.NotificationDirection.RECEIVED);
        this._notification.appendMessage(message, false);

        if (!Main.messageTray.contains(this))
            Main.messageTray.add(this);

        this.notify(this._notification);
    },

    createNotificationIcon: function() {
        let iconBox = new St.Bin({ style_class: 'avatar-box' });
        iconBox._size = this.ICON_SIZE;

        if (!this._iconUri) {
            iconBox.child = new St.Icon({ icon_name: 'avatar-default',
                                          icon_type: St.IconType.FULLCOLOR,
                                          icon_size: iconBox._size });
        } else {
            let textureCache = St.TextureCache.get_default();
            iconBox.child = textureCache.load_uri_async(this._iconUri, iconBox._size, iconBox._size);
        }
        return iconBox;
    },

    open: function(notification) {
        // Lookup for the messages window and display it. In the case where it's not o
        // opened yet fallback to the roster window.
        let windows = global.get_window_actors();
        for (let i = 0; i < windows.length; i++) {
            let metaWindow = windows[i].metaWindow;
            if (metaWindow.get_wm_class_instance() == "gajim" &&
                metaWindow.get_role() == "messages") {
                Main.activateWindow(metaWindow);
                return;
            }
        }

        let app = Shell.AppSystem.get_default().get_app('gajim.desktop');
        app.activate_window(null, global.get_current_time());
    },

    _onChatState: function(emitter, data) {
        let chatstate = data[1][5];
        if (chatstate == 'gone')
            this.destroy();
    },

    _messageReceived: function(emitter, data) {
        let author = data[1][0];
        let text = data[1][1];
        if (text && (author == this._author)) {
            let message = wrappedText(text, this._author, null, TelepathyClient.NotificationDirection.RECEIVED);
            this._notification.appendMessage(message, false);
            this.notify(this._notification);
        }
    },

    _messageSent: function(emitter, data) {
        let text = data[1][1];
        let chatstate = data[1][3];

        if (text) {
            let message = wrappedText(text, this._author, null, TelepathyClient.NotificationDirection.SENT);
            this._notification.appendMessage(message, false);
        } else if (chatstate == 'gone')
            this.destroy();
    },

    notify: function() {

        MessageTray.Source.prototype.notify.call(this, this._notification);
    },

    respond: function(text) {
        let jid = this._author;
        let keyID = ""; // unencrypted.
        this._gajimClient.proxy().send_chat_messageRemote(jid, text, keyID, this._accountName);
    },

    _onStatusChange: function(emitter, data) {
        if (!this.title)
            return;

        let jid = data[1][0];
        let presence = data[1][1];
        let message = data[1][2];

        if (jid != this._author.split('/')[0])
            return;

        let presenceMessage, shouldNotify, title;
        title = GLib.markup_escape_text(this.title, -1);
        if (presence == "away") {
            presenceMessage = _("%s is away.").format(title);
            shouldNotify = false;
        } else if (presence == "offline") {
            presenceMessage = _("%s is offline.").format(title);
            shouldNotify = (this._presence != "offline");
        } else if (presence == "online") {
            presenceMessage = _("%s is online.").format(title);
            shouldNotify = (this._presence == "offline");
        } else if (presence == "dnd") {
            presenceMessage = _("%s is busy.").format(title);
            shouldNotify = false;
        } else
            return;

        this._presence = presence;

        if (message)
            presenceMessage += ' <i>(' + GLib.markup_escape_text(message, -1) + ')</i>';

        this._notification.appendPresence(presenceMessage, shouldNotify);
        if (shouldNotify)
            this.notify(this._notification);
    }
};


const GajimIface = {
    name: 'org.gajim.dbus.RemoteInterface',
    properties: [],
    methods: [{ name: 'send_chat_message', inSignature: 'ssss', outSignature: 'b'},
              { name: 'contact_info', inSignature: 's', outSignature: 'a{sv}'}],
    signals: [{ name: 'NewMessage', inSignature: 'av' },
              { name: 'ChatState', inSignature: 'av' },
              { name: 'ContactStatus', inSignature: 'av' },
              { name: 'ContactAbsence', inSignature: 'av' },
              { name: 'MessageSent', inSignature: 'av' }]
};

let Gajim = DBus.makeProxyClass(GajimIface);

function GajimClient() {
    this._init();
}

GajimClient.prototype = {
    _init: function() {
        this._sources = {};
        this._cacheDir = GLib.get_user_cache_dir() + '/gnome-shell/gajim-avatars';
        GLib.mkdir_with_parents(this._cacheDir, 0x1c0); // 0x1c0 = octal 0700

        this._proxy = new Gajim(DBus.session, 'org.gajim.dbus', '/org/gajim/dbus/RemoteObject');
        this._proxy.connect('NewMessage', Lang.bind(this, this._messageReceived));
    },

    proxy : function() {
        return this._proxy;
    },

    _messageReceived : function(emitter, data) {
        let author = data[1][0];
        let message = data[1][1];
        let account = data[0];
        let source = this._sources[author];
        if (!source) {
            source = new Source(this, account, author, message);
            source.connect('destroy', Lang.bind(this,
                function() {
                    delete this._sources[author];
                }));
            this._sources[author] = source;
        }
    },

    cacheAvatar : function(mimeType, sha, avatarData) {
        let ext = mimeType.split('/')[1];
        let file = this._cacheDir + '/' + sha + '.' + ext;
        let uri = GLib.filename_to_uri(file, null);

        if (GLib.file_test(file, GLib.FileTest.EXISTS))
            return uri;

        let success = false;
        try {
            success = GLib.file_set_contents(file, avatarData, avatarData.length);
        } catch (e) {
            logError(e, 'Error caching avatar data');
        }
        return uri;
    }

};

function main() {
    let client = new GajimClient();
}
