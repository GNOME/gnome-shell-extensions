session_desktop_base = 'gnome-classic'

session_desktops = [
  session_desktop_base,
  session_desktop_base + '-xorg',
  session_desktop_base + '-wayland',
]

foreach name: session_desktops
    session_desktop = name + '.desktop'
    if name.endswith('-xorg')
        session_instdir = xsessiondir
    elif name.endswith('-wayland')
        session_instdir = wlsessiondir
    else
        # FIXME: The same target can not be copied into two directories.
        #        There is a workaround in meson/session-post-install.py until proper
        #        solution arises:
        #        https://github.com/mesonbuild/meson/issues/2416
        session_instdir = xsessiondir
        #session_instdir = [ xesssiondir, wlsessiondir ]
    endif
    i18n.merge_file(
      input:  session_desktop + '.in',
      output: session_desktop,
      po_dir: '../po',
      install: true,
      install_dir: session_instdir,
      type: 'desktop'
    )
endforeach

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
  'gnome-shell-sass/_high-contrast-colors.scss',
  'gnome-shell-sass/_widgets.scss',
  'gnome-shell-sass/widgets/_a11y.scss',
  'gnome-shell-sass/widgets/_app-grid.scss',
  'gnome-shell-sass/widgets/_base.scss',
  'gnome-shell-sass/widgets/_buttons.scss',
  'gnome-shell-sass/widgets/_calendar.scss',
  'gnome-shell-sass/widgets/_check-box.scss',
  'gnome-shell-sass/widgets/_corner-ripple.scss',
  'gnome-shell-sass/widgets/_dash.scss',
  'gnome-shell-sass/widgets/_dialogs.scss',
  'gnome-shell-sass/widgets/_entries.scss',
  'gnome-shell-sass/widgets/_hotplug.scss',
  'gnome-shell-sass/widgets/_ibus-popup.scss',
  'gnome-shell-sass/widgets/_keyboard.scss',
  'gnome-shell-sass/widgets/_login-dialog.scss',
  'gnome-shell-sass/widgets/_looking-glass.scss',
  'gnome-shell-sass/widgets/_message-list.scss',
  'gnome-shell-sass/widgets/_misc.scss',
  'gnome-shell-sass/widgets/_network-dialog.scss',
  'gnome-shell-sass/widgets/_notifications.scss',
  'gnome-shell-sass/widgets/_osd.scss',
  'gnome-shell-sass/widgets/_overview.scss',
  'gnome-shell-sass/widgets/_panel.scss',
  'gnome-shell-sass/widgets/_popovers.scss',
  'gnome-shell-sass/widgets/_screen-shield.scss',
  'gnome-shell-sass/widgets/_scrollbars.scss',
  'gnome-shell-sass/widgets/_search-entry.scss',
  'gnome-shell-sass/widgets/_search-results.scss',
  'gnome-shell-sass/widgets/_slider.scss',
  'gnome-shell-sass/widgets/_switcher-popup.scss',
  'gnome-shell-sass/widgets/_switches.scss',
  'gnome-shell-sass/widgets/_window-picker.scss',
  'gnome-shell-sass/widgets/_workspace-switcher.scss',
  'gnome-shell-sass/widgets/_workspace-thumbnails.scss'
)

theme_data = [
  'classic-process-working.svg',
  'gnome-classic-high-contrast.css'
]

stylesheet = 'gnome-classic.css'
if fs.exists(stylesheet)
  install_data(stylesheet, install_dir: themedir)
else
  sassc = find_program('sassc', required: true)
  custom_target(stylesheet,
    input: fs.replace_suffix(stylesheet, '.scss'),
    output: stylesheet,
    depend_files: theme_sources,
    command: [sassc, '-a', '@INPUT@', '@OUTPUT@'],
    install: true,
    install_dir: themedir
  )
endif

install_data(theme_data, install_dir: themedir)

classic_override = '00_org.gnome.shell.extensions.classic.gschema.override'
install_data(classic_override, install_dir: schemadir)
