AC_PREREQ(2.63)
AC_INIT([gnome-shell-extensions],[3.7.4],[https://bugzilla.gnome.org/enter_bug.cgi?product=gnome-shell&component=extensions])

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

SHELL_VERSION="$PACKAGE_VERSION"
shell_major=`echo "$PACKAGE_VERSION" | cut -d'.' -f1`
shell_minor=`echo "$PACKAGE_VERSION" | cut -d'.' -f2`
if test "$(($shell_minor % 2))" -eq 0; then
	SHELL_VERSION="$shell_major.$shell_minor"
fi
AC_SUBST([SHELL_VERSION])

dnl keep this in alphabetic order
CLASSIC_EXTENSIONS="apps-menu places-menu alternate-tab default-min-max launch-new-instance static-workspaces window-list"
DEFAULT_EXTENSIONS="$CLASSIC_EXTENSIONS alternative-status-menu drive-menu windowsNavigator workspace-indicator"
ALL_EXTENSIONS="$DEFAULT_EXTENSIONS auto-move-windows example native-window-placement systemMonitor user-theme xrandr-indicator"
AC_SUBST(CLASSIC_EXTENSIONS, [$CLASSIC_EXTENSIONS])
AC_SUBST(ALL_EXTENSIONS, [$ALL_EXTENSIONS])
AC_ARG_ENABLE([extensions],
	[AS_HELP_STRING([--enable-extensions],[Space separated list of extensions to enable.
	The default is to build and distribute all extensions that can be installed in the home directory and have no external depedencies.
	Use "all" to enable all available extensions, or "classic-mode" to enable extensions that restore GNOME 2 functionality.])],
	[],
	[enable_extensions=$DEFAULT_EXTENSIONS]
)

if test x"$enable_extensions" = xall; then
   enable_extensions="$ALL_EXTENSIONS"
   enable_classic_mode_default=yes
elif test x"$enable_extensions" = xclassic-mode; then
   enable_extensions="$CLASSIC_EXTENSIONS"
   enable_classic_mode_default=yes
else
   enable_classic_mode_default=no
fi

AC_ARG_ENABLE([classic-mode],
        [AS_HELP_STRING([--enable-classic-mode],[Enable installing data files for classic mode.
        Defaults to yes if enabling all or classic-mode extensions, and no otherwise.])],
        [],
        [enable_classic_mode=$enable_classic_mode_default])
AM_CONDITIONAL([CLASSIC_MODE], [test x"$enable_classic_mode" != xno])

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
		alternate-tab|alternative-status-menu|apps-menu|auto-move-windows|default-min-max|drive-menu|example|launch-new-instance|native-window-placement|places-menu|static-workspaces|user-theme|window-list|windowsNavigator|workspace-indicator)
			ENABLED_EXTENSIONS="$ENABLED_EXTENSIONS $e"
			;;
		*)
			AC_MSG_ERROR([invalid extension $e])
	esac
done

AC_SUBST(ENABLED_EXTENSIONS, [$ENABLED_EXTENSIONS])

dnl Please keep this sorted alphabetically
AC_CONFIG_FILES([
  data/Makefile
  extensions/alternate-tab/Makefile
  extensions/alternative-status-menu/Makefile
  extensions/apps-menu/Makefile
  extensions/auto-move-windows/Makefile
  extensions/default-min-max/Makefile
  extensions/drive-menu/Makefile
  extensions/example/Makefile
  extensions/launch-new-instance/Makefile
  extensions/native-window-placement/Makefile
  extensions/places-menu/Makefile
  extensions/static-workspaces/Makefile
  extensions/systemMonitor/Makefile
  extensions/user-theme/Makefile
  extensions/window-list/Makefile
  extensions/windowsNavigator/Makefile
  extensions/workspace-indicator/Makefile
  extensions/xrandr-indicator/Makefile
  extensions/Makefile
  Makefile
  po/Makefile.in
])
AC_OUTPUT
