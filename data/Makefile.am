include $(top_srcdir)/include.mk

desktopdir = $(datadir)/applications
desktop_in_in_files = gnome-shell-classic.desktop.in.in
desktop_in_files = $(desktop_in_in_files:.desktop.in.in=.desktop.in)
desktop_DATA = $(desktop_in_files:.desktop.in=.desktop)

sessiondir = $(datadir)/gnome-session/sessions
session_in_in_files = gnome-classic.session.desktop.in.in
session_in_files = $(session_in_in_files:.session.desktop.in.in=.session.desktop.in)
session_DATA = $(session_in_files:.session.desktop.in=.session)

xsessiondir = $(datadir)/xsessions
xsession_in_files = gnome-classic.desktop.in
xsession_DATA = $(xsession_in_files:.desktop.in=.desktop)

modedir = $(datadir)/gnome-shell/modes
mode_in_files = classic.json.in
mode_DATA = $(mode_in_files:.json.in=.json)

themedir = $(datadir)/gnome-shell/theme
theme_DATA = 				\
	$(srcdir)/classic-toggle-off-intl.svg	\
	$(srcdir)/classic-toggle-off-us.svg	\
	$(srcdir)/classic-toggle-on-intl.svg	\
	$(srcdir)/classic-toggle-on-us.svg	\
	$(srcdir)/gnome-classic.css		\
	$(NULL)

%.desktop.in:%.desktop.in.in
	$(AM_V_GEN) sed \
		-e "s|\@libexecdir\@|$(libexecdir)|" \
		-e "s|\@bindir\@|$(bindir)|" \
		-e "s|\@VERSION\@|$(VERSION)|" \
		$< > $@

comma:=,
empty:=
space:= $(empty) $(empty)
extensions:=$(patsubst %,\"%$(extensionbase)\",$(CLASSIC_EXTENSIONS))
extension_list:=$(subst $(space),$(comma),$(extensions))
%.json:%.json.in
	$(AM_V_GEN) sed \
		-e "s|\@CLASSIC_EXTENSIONS\@|$(extension_list)|g" \
		$< > $@

%.session: %.session.desktop.in   $(INTLTOOL_MERGE) $(wildcard $(top_srcdir)/po/*.po) ; LC_ALL=C $(INTLTOOL_MERGE) -d -u -c $(top_builddir)/po/.intltool-merge-cache $(top_srcdir)/po $< $@

@INTLTOOL_DESKTOP_RULE@

EXTRA_DIST = \
	$(desktop_in_in_files) \
	$(session_in_in_files) \
	$(xsession_in_files) \
	$(mode_in_files) \
	$(NULL)

CLEANFILES = \
	$(desktop_DATA) \
	$(session_DATA) \
	$(xsession_DATA) \
	$(mode_DATA) \
	$(NULL)
