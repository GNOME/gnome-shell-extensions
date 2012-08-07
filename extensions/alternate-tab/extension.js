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
const WorkspaceIcons = Me.imports.workspaceIcons;
const AllThumbnails = Me.imports.allThumbnails;

let settings;

const SETTINGS_BEHAVIOUR_KEY = 'behaviour';

const MODES = {
    all_thumbnails: AllThumbnails.AltTabPopupAllThumbnails,
    workspace_icons: WorkspaceIcons.AltTabPopupWorkspaceIcons,
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
    let popup = new constructor(settings);
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
