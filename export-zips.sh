#!/bin/bash

# SPDX-FileCopyrightText: 2017 Florian Müllner <fmuellner@gnome.org>
#
# SPDX-License-Identifier: GPL-2.0-or-later

srcdir=`dirname $0`
srcdir=`(cd $srcdir && pwd)`

builddir=`mktemp -p $srcdir -d _build.XXXXXX` || exit 1
destdir=`mktemp -p $srcdir -d _dest.XXXXXX` || exit 1

meson setup --prefix=/usr -Dextension_set=all $srcdir $builddir
meson install --destdir $destdir -C $builddir

rm -rf $srcdir/zip-files
mkdir $srcdir/zip-files

extensiondir=$destdir/usr/share/gnome-shell/extensions
schemadir=$destdir/usr/share/glib-2.0/schemas

for f in $extensiondir/*; do
  name=`basename ${f%%@*}`
  uuid=$name@gnome-shell-extensions.gcampax.github.com
  schema=$schemadir/org.gnome.shell.extensions.$name.gschema.xml

  olddomain=gnome-shell-extensions
  newdomain=gnome-shell-extension-$name
  sed -i "/gettext-domain/ s:$olddomain:$newdomain:" $f/metadata.json

  xgettext --from-code=UTF-8 --output-dir=$builddir --output=$name.pot $f/*.js

  if [ -f $builddir/$name.pot ]; then
    mkdir $f/po
    for l in $(<$srcdir/po/LINGUAS); do
      msgmerge --quiet --output-file=$f/po/$l.po \
        $srcdir/po/$l.po $builddir/$name.pot
    done
  fi

  cp $srcdir/NEWS $srcdir/COPYING $f
  sources=(NEWS COPYING $(cd $f; ls *.js *.css 2>/dev/null))

  [ -d $f/icons ] && sources+=(icons)

  [ -f $schema ] || unset schema

  gnome-extensions pack ${sources[@]/#/--extra-source=} \
    ${schema:+--schema=$schema} --out-dir=$srcdir/zip-files $f
done

rm -rf $builddir
rm -rf $destdir
