gsettings_SCHEMAS = $(gschemaname).gschema.xml

%.desktop:%.desktop.in
	$(AM_V_GEN) $(MSGFMT) --desktop --template $< -d $(top_srcdir)/po -o $@

@GSETTINGS_RULES@

CLEANFILES += $(gsettings_SCHEMAS:.xml=.valid)
EXTRA_DIST += $(gsettings_SCHEMAS)
