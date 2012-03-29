include $(top_srcdir)/include.mk

dist_extension_DATA = extension.js stylesheet.css $(EXTRA_MODULES)
nodist_extension_DATA = metadata.json $(top_srcdir)/lib/convenience.js $(EXTRA_EXTENSION)

EXTRA_DIST = metadata.json.in

metadata.json: metadata.json.in $(top_builddir)/config.status
	$(AM_V_GEN) sed \
            -e "s|[@]extension_id@|$(EXTENSION_ID)|" \
	    -e "s|[@]uuid@|$(uuid)|" \
	    -e "s|[@]gschemaname@|$(gschemaname)|" \
	    -e "s|[@]gettext_domain@|$(GETTEXT_PACKAGE)|" \
	    -e "s|[@]shell_current@|$(SHELL_VERSION)|" \
	    -e "s|[@]url@|$(extensionurl)|" \
	    $< > $@

CLEANFILES = metadata.json
