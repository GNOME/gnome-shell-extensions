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

const SETTINGS_BEHAVIOUR_KEY = 'behaviour';
const SETTINGS_FIRST_TIME_KEY = 'first-time';

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
If you whish to revert to the default behavior for the Alt-Tab switcher, just\n\
disable the extension from extensions.gnome.org or the Advanced Settings application.\
");

const AltTabSettingsDialog = new Lang.Class({
    Name: 'AlternateTab.Settings.AltTabSettingsDialog',
    Extends: ModalDialog.ModalDialog,

    _init : function(settings) {
	this.settings = settings;
        this.parent({ styleClass: null });

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
                label: _("Cancel"),
                action: Lang.bind(this, function() {
                    this.close();
                }),
                key: Clutter.Escape
            }
        ]);
    },

    setBehaviour: function(behaviour) {
           this.settings.set_string(SETTINGS_BEHAVIOUR_KEY, behaviour);
           this.settings.set_boolean(SETTINGS_FIRST_TIME_KEY, false);
    }
});
