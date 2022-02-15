project('gnome-shell-extensions',
  version: '41.2',
  meson_version: '>= 0.53.0',
  license: 'GPL2+'
)

gettext_domain = meson.project_name()

fs = import('fs')
gnome = import('gnome')
i18n = import('i18n')

datadir = get_option('datadir')

shelldir = join_paths(datadir, 'gnome-shell')
extensiondir = join_paths(shelldir, 'extensions')
modedir = join_paths(shelldir, 'modes')
themedir = join_paths(shelldir, 'theme')

schemadir = join_paths(datadir, 'glib-2.0', 'schemas')
sessiondir = join_paths(datadir, 'gnome-session', 'sessions')
xsessiondir = join_paths(datadir, 'xsessions')

ver_arr = meson.project_version().split('.')
shell_version = ver_arr[0]

uuid_suffix = '@gnome-shell-extensions.gcampax.github.com'

classic_extensions = [
  'apps-menu',
  'places-menu',
  'launch-new-instance',
  'window-list'
]

default_extensions = classic_extensions
default_extensions += [
  'drive-menu',
  'screenshot-window-sizer',
  'windowsNavigator',
  'workspace-indicator'
]

all_extensions = default_extensions
all_extensions += [
  'auto-move-windows',
  'native-window-placement',
  'user-theme'
]

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
      error('Classic mode is enabled, ' +
            'but the required extension @0@ is not.'.format(e))
    endif
  endforeach
endif

# Sanity check: Make sure enabled extensions are valid
foreach e : enabled_extensions
  if not all_extensions.contains(e)
    error('Invalid extension @0@.'.format(e))
  endif
endforeach

if classic_mode_enabled
  subdir('data')
endif

subdir('extensions')
subdir('po')

meson.add_dist_script('meson/generate-stylesheets.py')
meson.add_dist_script('meson/check-version.py',
  meson.project_version(),
  'NEWS')
