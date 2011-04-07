AC_PREREQ(2.63)
AC_INIT([gnome-shell-extensions],[3.0.1],[https://bugzilla.gnome.org/enter_bug.cgi?product=gnome-shell&component=extensions])

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

ADDITIONAL_PACKAGES=

dnl keep this in sync with extensions/Makefile.am
ALL_EXTENSIONS="example alternate-tab xrandr-indicator windowsNavigator auto-move-windows dock user-theme alternative-status-menu gajim drive-menu"
AC_SUBST(ALL_EXTENSIONS, [$ALL_EXTENSIONS])
DEFAULT_EXTENSIONS="alternate-tab windowsNavigator dock alternative-status-menu drive-menu"
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

ADDITIONAL_PACKAGES=
ENABLED_EXTENSIONS=
for e in $enable_extensions; do
	case $e in
		xrandr-indicator)
			ENABLED_EXTENSIONS="$ENABLED_EXTENSIONS $e"
			ADDITIONAL_PACKAGES="$ADDITIONAL_PAGKAGES gnome-desktop-3.0 >= 2.91.6"
			;;
		alternate-tab|example|windowsNavigator|auto-move-windows|dock|user-theme|alternative-status-menu|gajim|drive-menu)
			ENABLED_EXTENSIONS="$ENABLED_EXTENSIONS $e"
			;;
		*)
			AC_MSG_ERROR([invalid extension $e])
	esac
done

AC_SUBST(ENABLED_EXTENSIONS, [$ENABLED_EXTENSIONS])

dnl We don't really need cflags or libdirs, we just check
dnl to ensure we don't fail at runtime.

if test "x$ADDITIONAL_PACKAGES" != x; then
	PKG_CHECK_MODULES(ADDITIONAL, [$ADDITIONAL_PACKAGES])
fi

dnl Please keep this sorted alphabetically
AC_CONFIG_FILES([
  extensions/alternate-tab/Makefile
  extensions/alternative-status-menu/Makefile
  extensions/auto-move-windows/Makefile
  extensions/dock/Makefile
  extensions/drive-menu/Makefile
  extensions/example/Makefile
  extensions/windowsNavigator/Makefile
  extensions/gajim/Makefile
  extensions/xrandr-indicator/Makefile
  extensions/user-theme/Makefile
  extensions/Makefile
  Makefile
  po/Makefile.in
])
AC_OUTPUT
