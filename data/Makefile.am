include $(top_srcdir)/include.mk

sessiondir = $(datadir)/gnome-session/sessions
session_in_files = gnome-classic.session.desktop.in
session_DATA = $(session_in_files:.session.desktop.in=.session)

xsessiondir = $(datadir)/xsessions
xsession_in_files = gnome-classic.desktop.in
xsession_DATA = $(xsession_in_files:.desktop.in=.desktop)

modedir = $(datadir)/gnome-shell/modes
mode_in_files = classic.json.in
mode_DATA = $(mode_in_files:.json.in=.json)

themedir = $(datadir)/gnome-shell/theme
theme_DATA = 				\
	$(srcdir)/calendar-today.svg		\
	$(srcdir)/classic-process-working.svg		\
	$(srcdir)/classic-toggle-off-intl.svg		\
	$(srcdir)/classic-toggle-off-us.svg		\
	$(srcdir)/classic-toggle-on-intl.svg		\
	$(srcdir)/classic-toggle-on-us.svg		\
	$(srcdir)/gnome-classic.css			\
	$(srcdir)/gnome-classic-high-contrast.css	\
	$(NULL)

theme_sources =							\
	$(srcdir)/gnome-classic.scss				\
	$(srcdir)/gnome-shell-sass/_colors.scss			\
	$(srcdir)/gnome-shell-sass/_common.scss			\
	$(srcdir)/gnome-shell-sass/_drawing.scss		\
	$(srcdir)/gnome-shell-sass/_high-contrast-colors.scss	\
	$(NULL)

%.css: %.scss $(theme_sources)
	@if test -n "$(SASS)"; then \
		if $(AM_V_P); then PS4= set -x; else echo "  GEN      $@"; fi; \
		$(SASS) --sourcemap=none --update -f -q $<; \
	fi

gsettings_SCHEMAS = org.gnome.shell.extensions.classic-overrides.gschema.xml

@GSETTINGS_RULES@

%.desktop:%.desktop.in
	$(AM_V_GEN) $(MSGFMT) --desktop --template $< -d $(top_srcdir)/po -o $@

%.session: %.session.desktop.in
	$(AM_V_GEN) $(MSGFMT) --desktop --template $< -d $(top_srcdir)/po -o $@

comma:=,
empty:=
space:= $(empty) $(empty)
extensions:=$(patsubst %,\"%$(extensionbase)\",$(CLASSIC_EXTENSIONS))
extension_list:=$(subst $(space),$(comma),$(extensions))
%.json:%.json.in
	$(AM_V_GEN) sed \
		-e "s|\@CLASSIC_EXTENSIONS\@|$(extension_list)|g" \
		$< > $@

EXTRA_DIST = \
	$(session_in_files) \
	$(xsession_in_files) \
	$(mode_in_files) \
	$(gsettings_SCHEMAS) \
	$(theme_DATA) \
	$(NULL)

CLEANFILES = \
	$(session_DATA) \
	$(xsession_DATA) \
	$(mode_DATA) \
	$(NULL)
