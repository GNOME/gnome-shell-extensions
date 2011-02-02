# Change these to modify how installation is performed
# If you modify extensionbase, you also need to modify
# metadata.json of each extension
topextensiondir = $(datadir)/gnome-shell/extensions
extensionbase = @gnome-shell-extensions.gnome.org

extensiondir = $(topextensiondir)/$(EXTENSION_ID)$(extensionbase)

dist_extension_DATA = metadata.json extension.js stylesheet.css
nodist_extension_DATA = $(EXTRA_EXTENSION)
