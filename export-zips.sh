#!/bin/sh

srcdir=`dirname $0`
srcdir=`(cd $srcdir && pwd)`

builddir=`mktemp -p $srcdir -d _build.XXXXXX` || exit 1
installdir=`mktemp -p $srcdir -d _install.XXXXXX` || exit 1

meson setup --prefix=$installdir -Dextension_set=all $srcdir $builddir
ninja -C$builddir install

rm -rf $srcdir/zip-files
mkdir $srcdir/zip-files

extensiondir=$installdir/share/gnome-shell/extensions
schemadir=$installdir/share/glib-2.0/schemas
localedir=$installdir/share/locale

for f in $extensiondir/*; do
  name=`basename ${f%%@*}`
  uuid=$name@gnome-shell-extensions.gcampax.github.com
  schema=$schemadir/org.gnome.shell.extensions.$name.gschema.xml

  cp $srcdir/NEWS $srcdir/COPYING $f

  if [ -f $schema ]; then
    mkdir $f/schemas
    cp $schema $f/schemas;
    glib-compile-schemas $f/schemas
  fi

  (cd $f && zip -rmq $srcdir/zip-files/$uuid.shell-extension.zip .)
done

rm -rf $builddir
rm -rf $installdir
