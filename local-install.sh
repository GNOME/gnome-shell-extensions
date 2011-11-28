#!/bin/bash

extensionbase=~/.local/share/gnome-shell/extensions

for i in zip-files/*; do
    zip_file=`pwd`/$i;
    uuid=`basename $i | sed -e "s/.shell-extension.zip//"`;
    if [ -d $extensionbase/$uuid ]; then
	rm -fR $extensionbase/$uuid;
    fi
    mkdir $extensionbase/$uuid;
    (cd $extensionbase/$uuid;
	unzip -q $zip_file;
    );
done
