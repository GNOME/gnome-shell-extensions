ACLOCAL_AMFLAGS = -I m4 ${ACLOCAL_FLAGS}

SUBDIRS = extensions po

EXTRA_DIST = lib/convenience.js

DISTCHECK_CONFIGURE_FLAGS = --enable-extensions=all

include include.mk

zip-file: all
	-rm -fR $(builddir)/_build
	-rm -fR $(builddir)/zip-files
	mkdir $(builddir)/_build; \
	mkdir $(builddir)/zip-files; \
	$(MAKE) install DESTDIR="$(abs_builddir)/_build"; \
	for i in $(ENABLED_EXTENSIONS); do \
		mv "$(builddir)/_build$(topextensiondir)/$${i}$(extensionbase)" "$(builddir)/_build/"; \
		cp -r "$(builddir)/_build$(datadir)/locale" "$(builddir)/_build/$${i}$(extensionbase)"; \
		cp "$(srcdir)/COPYING" -t "$(builddir)/_build/$${i}$(extensionbase)"; \
		if [ -f "$(builddir)/_build$(datadir)/glib-2.0/schemas/$(gschemabase).$${i}.gschema.xml" ]; then \
			mkdir "$(builddir)/_build/$${i}$(extensionbase)/schemas"; \
			mv "$(builddir)/_build$(datadir)/glib-2.0/schemas/$(gschemabase).$${i}.gschema.xml" "$(builddir)/_build/$${i}$(extensionbase)/schemas"; \
			glib-compile-schemas "$(builddir)/_build/$${i}$(extensionbase)/schemas"; \
		fi; \
		(cd "$(builddir)/_build/$${i}$(extensionbase)"; \
		 zip -qr "$(abs_builddir)/zip-files/$${i}$(extensionbase).shell-extension.zip" .; \
		); \
	done
