# SPDX-FileCopyrightText: 2017 Florian Müllner <fmuellner@gnome.org>
#
# SPDX-License-Identifier: GPL-2.0-or-later

have_x11 = get_option('x11')

session_desktop_base = 'gnome-classic'

session_desktops = [
  session_desktop_base,
  session_desktop_base + '-wayland',
]

if have_x11
  session_desktops += [session_desktop_base + '-xorg']
endif

foreach name : session_desktops
  session_desktop = name + '.desktop'
  if name.endswith('-xorg')
    session_instdir = xsessiondir
  elif name.endswith('-wayland')
    session_instdir = wlsessiondir
  else
# FIXME: The same target can not be copied into two directories.
    #        There is a workaround in build-aux/session-post-install.py until proper
    #        solution arises:
    #        https://github.com/mesonbuild/meson/issues/2416
    session_instdir = wlsessiondir
  #session_instdir = [ xesssiondir, wlsessiondir ]
  endif
  i18n.merge_file(
    input: session_desktop + '.in',
    output: session_desktop,
    po_dir: '../po',
    install: true,
    install_dir: session_instdir,
    type: 'desktop',
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
  install_dir: modedir,
)

classic_override = '00_org.gnome.shell.extensions.classic.gschema.override'
install_data(classic_override, install_dir: schemadir)
