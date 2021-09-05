#!/usr/bin/env python3

import os
from pathlib import PurePath
import subprocess

sourceroot = os.environ.get('MESON_SOURCE_ROOT')
distroot = os.environ.get('MESON_DIST_ROOT')

stylesheet_path = PurePath('data/gnome-classic.css')
src = PurePath(sourceroot, stylesheet_path.with_suffix('.scss'))
dst = PurePath(distroot, stylesheet_path)
subprocess.run(['sassc', '-a', src, dst], check=True)
