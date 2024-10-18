<!--
SPDX-FileCopyrightText: 2011 Giovanni Campagna <gcampagna@src.gnome.org>
SPDX-FileCopyrightText: 2011 Adam Dingle <adam@yorba.org>
SPDX-FileCopyrightText: 2011 Vamsi Krishna Brahmajosyula <vamsikrishna.brahmajosyula@gmail.com>
SPDX-FileCopyrightText: 2014 Michael Catanzaro <mcatanzaro@gnome.org>
SPDX-FileCopyrightText: 2015 Florian Müllner <fmuellner@gnome.org>
SPDX-FileCopyrightText: 2019 Fabian P. Schmidt <kerel-fs@gmx.de>
SPDX-FileCopyrightText: 2024 Aral Balkan <aral@aralbalkan.com>"""
SPDX-License-Identifier: CC-BY-SA-4.0
-->

# GNOME Shell Extensions

GNOME Shell Extensions is a collection of extensions providing additional
and optional functionality to GNOME Shell.

The extensions in this package are supported by GNOME and will be updated
to reflect future API changes in GNOME Shell.

Both the most recent stable release and the previous stable release of
GNOME Shell are actively supported, as well as the current development
branch.

Please refer to the [schedule] to see when a new version will be released.

[schedule]: https://release.gnome.org/calendar

## Extensions

The following is a complete list of extensions that are provided by this
project.

 * apps-menu

     Lets you reach an application using gnome 2.x style menu on the panel.

 * auto-move-windows

     Lets you manage your workspaces more easily, assigning a specific workspace to
     each application as soon as it creates a window.

 * drive-menu
 
     Shows a status menu for rapid unmount and power off of external storage devices
  (i.e. pendrives)

 * launch-new-instance

     Changes application icons to always launch a new instance when activated.

 * light-style

    Changes the default shell style to "light", while still following the
    system-wide "dark" preference.

 * native-window-placement

     An alternative algorithm for layouting the thumbnails in the windows overview, that
  more closely reflects the actual positions and sizes.

 * places-menu

     Shows a status Indicator for navigating to Places.

 * screenshot-window-sizer

     Adds a shortcut for resizing the focus window to a size that is suitable for GNOME Software screenshots. Ctrl + Alt + s cycles forwards through the available sizes and Ctrl + Alt + Shift + s cycles backwards.

 * status-icons

    Show (XEmbed) status icons in the top bar.

 * system-monitor

    Shows system usage information in the top bar.

 * user-theme

     Loads a shell theme from `$XDG_DATA_HOME/themes/<name>/gnome-shell`.

 * window-list

     Adds a bottom panel with a traditional window list.

 * windowsNavigator

     Allow keyboard selection of windows and workspaces in overlay mode.

 * workspace-indicator

     Adds a simple workspace switcher to the top bar.

### Ex-Extensions

  Occasionally over the years, some extensions were removed.

  The following list is not complete, but limited to cases that
  are notable for some reason; either the removal happened
  relatively recently, or the extension used to be particularly
  popular in the past.

 * alternate-tab

     Lets you use classic Alt+Tab (window-based instead of app-based) in GNOME Shell.
     This extension is obsolete since GNOME 3.30, see [this blogpost][alternatetab-post]
     for further details.

[alternatetab-post]: https://blogs.gnome.org/fmuellner/2018/10/11/the-future-of-alternatetab-and-why-you-need-not-worry/

## Reporting bugs

Bugs should be reported to the [issue tracking system][bug-tracker].

The [GNOME handbook][bug-handbook] has useful information for creating
effective issue reports.

Please note that the issue tracker is meant to be used for
actionable issues only.

For support questions, feedback on changes or general discussions,
you can use:

 - the [#gnome-shell matrix room][matrix-room]
 - the `Desktop` category or `extensions` and `shell` tags on [GNOME Discourse][discourse]

[bug-tracker]: https://gitlab.gnome.org/GNOME/gnome-shell-extensions/issues
[bug-handbook]: https://handbook.gnome.org/issues/reporting.html
[matrix-room]: https://matrix.to/#/#gnome-shell:gnome.org
[discourse]: https://discourse.gnome.org

## Code of Conduct

All interactions with the project should follow the [Code of Conduct][conduct].

[conduct]: https://conduct.gnome.org/

## License

GNOME Shell Extensions are distributed under the terms of the GNU General
Public License, version 2 or later. See the [COPYING file][license] for details.
Individual extensions may be licensed under different terms, see each source
file for details.

[license]: COPYING
