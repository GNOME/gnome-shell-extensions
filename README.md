# GNOME Shell Extensions

GNOME Shell Extensions is a collection of extensions providing additional
and optional functionality to GNOME Shell.

Since GNOME Shell is not API stable, extensions work only against a very
specific version of the shell, usually the same as this package (see
"configure --version"). The extensions in this package are supported by GNOME
and will be updated to reflect future API changes in GNOME Shell.

The GNOME wiki has more information about [GNOME Shell Extensions][project-page],
as well as some general information about [GNOME Shell][shell-page].

Bugs should be reported to the GNOME [bug tracking system][bug-tracker].

## Extensions

 * alternate-tab
 
     Lets you use classic Alt+Tab (window-based instead of app-based) in GNOME Shell.

 * apps-menu

     Lets you reach an application using gnome 2.x style menu on the panel.

 * auto-move-windows

     Lets you manage your workspaces more easily, assigning a specific workspace to
each application as soon as it creates a window, in a manner configurable with a
GSettings key.

 * drive-menu
 
     Shows a status menu for rapid unmount and power off of external storage devices
  (i.e. pendrives)

 * example

     A minimal example illustrating how to write extensions.

 * launch-new-instance

     Changes application icons to always launch a new instance when activated.

 * native-window-placement

     An alternative algorithm for layouting the thumbnails in the windows overview, that
  more closely reflects the actual positions and sizes.

 * places-menu

     Shows a status Indicator for navigating to Places.

 * screenshot-window-sizer

     Adds a shortcut for resizing the focus window to a size that is suitable for GNOME Software screenshots

 * user-theme

     Loads a shell theme from ~/.themes/<name>/gnome-shell.

 * window-list

     Adds a bottom panel with a traditional window list.

 * windowsNavigator

     Allow keyboard selection of windows and workspaces in overlay mode.

 * workspace-indicator

     Adds a simple workspace switcher to the top bar.

## License

GNOME Shell Extensions are distributed under the terms of the GNU General
Public License, version 2 or later. See the [COPYING file][license] for details.
Individual extensions may be licensed under different terms, see each source
file for details.

[project-page]: https://wiki.gnome.org/Projects/GnomeShell/Extensions
[shell-page]: https://wiki.gnome.org/Projects/GnomeShell
[bug-tracker]: https://gitlab.gnome.org/GNOME/gnome-shell-extensions/issues
[license]: COPYING
