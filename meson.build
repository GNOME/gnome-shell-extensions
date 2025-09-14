# SPDX-FileCopyrightText: 2017 Florian Müllner <fmuellner@gnome.org>>
#
# SPDX-License-Identifier: GPL-2.0-or-later

project(
  'gnome-shell-extensions',
  version: '49.0',
  meson_version: '>= 1.1.0',
  license: 'GPL-2.0-or-later',
)

gettext_domain = meson.project_name()

fs = import('fs')
gnome = import('gnome')
i18n = import('i18n')

datadir = get_option('datadir')

shelldir = join_paths(datadir, 'gnome-shell')
extensiondir = join_paths(shelldir, 'extensions')
modedir = join_paths(shelldir, 'modes')

schemadir = join_paths(datadir, 'glib-2.0', 'schemas')
sessiondir = join_paths(datadir, 'gnome-session', 'sessions')
xsessiondir = join_paths(datadir, 'xsessions')
wlsessiondir = join_paths(datadir, 'wayland-sessions')

ver_arr = meson.project_version().split('.')
shell_version = ver_arr[0]

uuid_suffix = '@gnome-shell-extensions.gcampax.github.com'

have_x11 = get_option('x11')

classic_extensions = [
  'apps-menu',
  'places-menu',
  'launch-new-instance',
  'window-list',
]

default_extensions = classic_extensions
default_extensions += [
  'drive-menu',
  'light-style',
  'screenshot-window-sizer',
  'status-icons',
  'system-monitor',
  'windowsNavigator',
  'workspace-indicator',
]

all_extensions = default_extensions
all_extensions += ['auto-move-windows', 'native-window-placement', 'user-theme']

enabled_extensions = get_option('enable_extensions')

if enabled_extensions.length() == 0
  set = get_option('extension_set')

  if set == 'classic'
    enabled_extensions += classic_extensions
  elif set == 'default'
    enabled_extensions += default_extensions
  elif set == 'all'
    enabled_extensions += all_extensions
  endif
endif

classic_mode_enabled = get_option('classic_mode')

if classic_mode_enabled
# Sanity check: Make sure all classic extensions are enabled
  foreach e : classic_extensions
    if not enabled_extensions.contains(e)
      error(f'Classic mode is enabled, but the required extension @e@ is not')
    endif
  endforeach
endif

# Sanity check: Make sure enabled extensions are valid
foreach e : enabled_extensions
  if not all_extensions.contains(e)
    error(f'Invalid extension @e@.')
  endif
endforeach

if classic_mode_enabled
  subdir('data')
  if have_x11
    meson.add_install_script(
      'build-aux/session-post-install.py',
      join_paths(get_option('prefix'), datadir),
    )
  endif
endif

subdir('extensions')
subdir('po')

gnome.post_install(glib_compile_schemas: true)

meson.add_dist_script('build-aux/check-version.py', meson.project_version(), 'NEWS')

summary_options = {
  'extensions': enabled_extensions,
  'classic_mode': get_option('classic_mode'),
}

summary_dirs = {
  'prefix': get_option('prefix'),
  'datadir': get_option('datadir'),
}

summary(summary_dirs, section: 'Directories')
summary(summary_options, section: 'Build Options')
