AC_PREREQ(2.63)
AC_INIT([gnome-shell-extensions],[2.91.90],[https://bugzilla.gnome.org/enter_bug.cgi?product=gnome-shell&component=extensions])

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
ALL_EXTENSIONS="example alternate-tab xrandr-indicator windowsNavigator auto-move-windows dock"
AC_ARG_ENABLE([extensions],
	[AS_HELP_STRING([--enable-extensions],[Space separated list of extensions to enable. Default is that all extensions are built.])],
	[],
	[enable_extensions=$ALL_EXTENSIONS]
)
ENABLED_EXTENSIONS=
for e in $enable_extensions; do
	case $e in
		xrandr-indicator)
			ENABLED_EXTENSIONS="$ENABLED_EXTENSIONS $e"
			ADDITIONAL_PACKAGES="gnome-desktop-3.0 >= 2.91.6"
			;;
		alternate-tab|example|windowsNavigator|auto-move-windows|dock)
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
  extensions/auto-move-windows/Makefile
  extensions/dock/Makefile
  extensions/example/Makefile
  extensions/windowsNavigator/Makefile
  extensions/xrandr-indicator/Makefile
  extensions/Makefile
  Makefile
  po/Makefile.in
])
AC_OUTPUT
