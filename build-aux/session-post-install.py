#!/usr/bin/env python3

# SPDX-FileCopyrightText: 2021 Neal Gompa <ngompa@fedoraproject.org>
#
# SPDX-License-Identifier: GPL-2.0-or-later

import os
import shutil
import sys

if os.environ.get('DESTDIR'):
  install_root = os.environ.get('DESTDIR') + os.path.abspath(sys.argv[1])
else:
  install_root = sys.argv[1]

# FIXME: Meson is unable to copy a generated target file:
#        https://groups.google.com/forum/#!topic/mesonbuild/3iIoYPrN4P0
dst_dir = os.path.join(install_root, 'xsessions')
if not os.path.exists(dst_dir):
  os.makedirs(dst_dir)

src = os.path.join(install_root, 'wayland-sessions', 'gnome-classic.desktop')
dst = os.path.join(dst_dir, 'gnome-classic.desktop')
shutil.copyfile(src, dst)
