AC_PREREQ(2.63)
AC_INIT([gnome-shell-extensions],[3.2.3],[https://bugzilla.gnome.org/enter_bug.cgi?product=gnome-shell&component=extensions])

AC_CONFIG_MACRO_DIR([m4])
AC_CONFIG_AUX_DIR([config])

AM_INIT_AUTOMAKE([1.10 dist-bzip2 no-dist-gzip foreign tar-ustar])

m4_ifdef([AM_SILENT_RULES],[AM_SILENT_RULES([yes])])

GETTEXT_PACKAGE=gnome-shell-extensions
AC_SUBST(GETTEXT_PACKAGE)
AC_DEFINE_UNQUOTED(GETTEXT_PACKAGE, "$GETTEXT_PACKAGE",
                   [The prefix for our gettext translation domains.])
IT_PROG_INTLTOOL(0.26)

PKG_PROG_PKG_CONFIG([0.22])

GLIB_GSETTINGS

dnl keep this in alphabetic order
dnl by default, install only extensions that do not change completely the shell experience,
dnl that don't require GSettings and that don't require external packages for typelibs
dnl (so basically only menus, status icons, search providers, overview tabs, message tray sources, etc.)
DEFAULT_EXTENSIONS="alternative-status-menu apps-menu dock drive-menu gajim places-menu windowsNavigator workspace-indicator"
ALL_EXTENSIONS="$DEFAULT_EXTENSIONS alternate-tab auto-move-windows example native-window-placement systemMonitor user-theme xrandr-indicator"
AC_SUBST(ALL_EXTENSIONS, [$ALL_EXTENSIONS])
AC_ARG_ENABLE([extensions],
	[AS_HELP_STRING([--enable-extensions],[Space separated list of extensions to enable.
	The default is to build all extensions that can be installed in the home directory and have no external depedencies.
	Use "all" to enable all available extensions.])],
	[],
	[enable_extensions=$DEFAULT_EXTENSIONS]
)
if test x$enable_extensions = xall; then
   enable_extensions="$ALL_EXTENSIONS"
fi

ENABLED_EXTENSIONS=
for e in $enable_extensions; do
	case $e in
		systemMonitor)
			PKG_CHECK_MODULES(GTOP, libgtop-2.0 >= 2.28.3,
					[ENABLED_EXTENSIONS="$ENABLED_EXTENSIONS $e"],
					[AC_MSG_WARN([libgtop-2.0 not found, disabling systemMonitor])])
			;;
		xrandr-indicator)
			PKG_CHECK_MODULES(GNOME_DESKTOP, gnome-desktop-3.0 >= 2.91.6,
					[ENABLED_EXTENSIONS="$ENABLED_EXTENSIONS $e"],
					[AC_MSG_WARN([gnome-desktop-3.0 not found, disabling xrandr-indicator])])
			;;
dnl		keep this in alphabetic order
		alternate-tab|alternative-status-menu|apps-menu|auto-move-windows|dock|drive-menu|example|gajim|native-window-placement|places-menu|user-theme|windowsNavigator|workspace-indicator)
			ENABLED_EXTENSIONS="$ENABLED_EXTENSIONS $e"
			;;
		*)
			AC_MSG_ERROR([invalid extension $e])
	esac
done

AC_SUBST(ENABLED_EXTENSIONS, [$ENABLED_EXTENSIONS])

dnl Please keep this sorted alphabetically
AC_CONFIG_FILES([
  extensions/alternate-tab/Makefile
  extensions/alternative-status-menu/Makefile
  extensions/apps-menu/Makefile
  extensions/auto-move-windows/Makefile
  extensions/dock/Makefile
  extensions/drive-menu/Makefile
  extensions/example/Makefile
  extensions/gajim/Makefile
  extensions/native-window-placement/Makefile
  extensions/places-menu/Makefile
  extensions/systemMonitor/Makefile
  extensions/user-theme/Makefile
  extensions/windowsNavigator/Makefile
  extensions/workspace-indicator/Makefile
  extensions/xrandr-indicator/Makefile
  extensions/Makefile
  Makefile
  po/Makefile.in
])
AC_OUTPUT
