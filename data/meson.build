session_desktop = 'gnome-classic.desktop'
i18n.merge_file('',
  input:  session_desktop + '.in',
  output: session_desktop,
  po_dir: '../po',
  install: true,
  install_dir: xsessiondir,
  type: 'desktop'
)

classic_uuids = []
foreach e : classic_extensions
    classic_uuids += e + uuid_suffix
endforeach

mode_conf = configuration_data()
mode_conf.set('CLASSIC_EXTENSIONS', '"' + '", "'.join(classic_uuids) + '"')

mode_file = 'classic.json'
configure_file(
  input: mode_file + '.in',
  output: mode_file,
  configuration: mode_conf,
  install_dir: modedir
)

theme_sources = files(
  'gnome-shell-sass/_colors.scss',
  'gnome-shell-sass/_common.scss',
  'gnome-shell-sass/_drawing.scss',
  'gnome-shell-sass/_high-contrast-colors.scss'
)

theme_data = [
  'calendar-today.svg',
  'classic-process-working.svg',
  'classic-toggle-off-intl.svg',
  'classic-toggle-off-us.svg',
  'classic-toggle-on-intl.svg',
  'classic-toggle-on-us.svg',
  'gnome-classic-high-contrast.css'
]

style = 'gnome-classic'
custom_target(style + '.css',
  input: style + '.scss',
  output: style + '.css',
  depend_files: theme_sources,
  command: [sassc, '-a', '@INPUT@', '@OUTPUT@'],
  install: true,
  install_dir: themedir
)

install_data(theme_data, install_dir: themedir)

classic_override = '00_org.gnome.shell.extensions.classic.gschema.override'
install_data(classic_override, install_dir: schemadir)
