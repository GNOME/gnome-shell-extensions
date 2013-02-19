ACLOCAL_AMFLAGS = -I m4 ${ACLOCAL_FLAGS}

DIST_SUBDIRS = data extensions po

SUBDIRS = extensions po

if CLASSIC_MODE
SUBDIRS += data
endif

EXTRA_DIST = lib/convenience.js

DISTCHECK_CONFIGURE_FLAGS = --enable-extensions=all

include include.mk

zip-file: all
	-rm -fR $(builddir)/_build
	-rm -fR $(builddir)/zip-files
	$(MKDIR_P) $(builddir)/_build; \
	$(MKDIR_P) $(builddir)/zip-files; \
	$(MAKE) install DESTDIR="$(abs_builddir)/_build"; \
	for i in $(ENABLED_EXTENSIONS); do \
		mv "$(builddir)/_build$(topextensiondir)/$${i}$(extensionbase)" "$(builddir)/_build/"; \
		cp -r "$(builddir)/_build$(datadir)/locale" "$(builddir)/_build/$${i}$(extensionbase)"; \
		cp "$(srcdir)/COPYING" -t "$(builddir)/_build/$${i}$(extensionbase)"; \
		cp "$(srcdir)/NEWS" -t "$(builddir)/_build/$${i}$(extensionbase)"; \
		if [ -f "$(builddir)/_build$(datadir)/glib-2.0/schemas/$(gschemabase).$${i}.gschema.xml" ]; then \
			$(MKDIR_P) "$(builddir)/_build/$${i}$(extensionbase)/schemas"; \
			mv "$(builddir)/_build$(datadir)/glib-2.0/schemas/$(gschemabase).$${i}.gschema.xml" "$(builddir)/_build/$${i}$(extensionbase)/schemas"; \
			glib-compile-schemas "$(builddir)/_build/$${i}$(extensionbase)/schemas"; \
		fi; \
		(cd "$(builddir)/_build/$${i}$(extensionbase)"; \
		 zip -qr "$(abs_builddir)/zip-files/$${i}$(extensionbase).shell-extension.zip" .; \
		); \
	done
	-rm -fR $(builddir)/_build

localprefix = $(HOME)/.local/share/gnome-shell/extensions

local-install: zip-file
	for i in $(ENABLED_EXTENSIONS); do \
	    uuid="$${i}$(extensionbase)"; \
	    zip_file="$(abs_builddir)/zip-files/$${uuid}.shell-extension.zip"; \
	    if [ -d "$(localprefix)/$${uuid}" ]; then \
		rm -fR "$(localprefix)/$${uuid}"; \
	    fi; \
	    $(MKDIR_P) $(localprefix)/$${uuid}; \
	    (cd $(localprefix)/$${uuid}; \
		unzip -q $${zip_file}; \
	    ); \
	done
