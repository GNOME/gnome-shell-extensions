sessions = [
  ['gnome-classic.session.desktop', sessiondir],
  ['gnome-classic.desktop', xsessiondir]
]
foreach s : sessions
  i18n.merge_file('',
    input:  s[0] + '.in',
    output: s[0],
    po_dir: '../po',
    install: true,
    install_dir: s[1],
    type: 'desktop'
  )
endforeach

mode_conf = configuration_data()
mode_conf.set('CLASSIC_EXTENSIONS', ','.join(classic_extensions))

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
  'gnome-classic.css',
  'gnome-classic-high-contrast.css'
]

update_theme = files('update-theme.sh')

if sassc.found()
  style = 'gnome-classic'
  custom_target(style + '.css',
    input: style + '.scss',
    output: style + '.css',
    depend_files: theme_sources + files(style + '.css'),
    command: [update_theme, '@INPUT@', '@OUTPUT@'],
    build_by_default: true
  )
endif

install_data(theme_data, install_dir: themedir)