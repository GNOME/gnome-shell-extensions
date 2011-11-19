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
	$(MAKE) install DESTDIR="`pwd`/_build"; \
	for i in $(ENABLED_EXTENSIONS); do \
		mv "`pwd`/_build/$(topextensiondir)/$${i}$(extensionbase)" "`pwd`/_build/"; \
		cp -r "`pwd`/_build/$(datadir)/locale" "`pwd`/_build/$${i}$(extensionbase)"; \
		if [ -f "`pwd`/_build/$(datadir)/glib-2.0/schemas/$(gschemabase).$${i}.gschema.xml" ]; then \
			mkdir "`pwd`/_build/$${i}$(extensionbase)/schemas"; \
			mv "`pwd`/_build/$(datadir)/glib-2.0/schemas/$(gschemabase).$${i}.gschema.xml" "`pwd`/_build/$${i}$(extensionbase)/schemas"; \
			glib-compile-schemas "`pwd`/_build/$${i}$(extensionbase)/schemas"; \
		fi; \
		(cd "`pwd`/_build/$${i}$(extensionbase)"; \
		 zip -qr "$(abs_builddir)/zip-files/$${i}$(extensionbase).shell-extension.zip" .; \
		); \
	done
