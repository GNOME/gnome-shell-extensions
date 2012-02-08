extensionurl = http://git.gnome.org/gnome-shell-extensions

# Change these to modify how installation is performed
topextensiondir = $(datadir)/gnome-shell/extensions
extensionbase = @gnome-shell-extensions.gcampax.github.com

gschemabase = org.gnome.shell.extensions

uuid = $(EXTENSION_ID)$(extensionbase)
gschemaname = $(gschemabase).$(EXTENSION_ID)

extensiondir = $(topextensiondir)/$(uuid)
