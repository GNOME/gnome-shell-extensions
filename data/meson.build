# SPDX-FileCopyrightText: 2017 Florian Müllner <fmuellner@gnome.org>
#
# SPDX-License-Identifier: GPL-2.0-or-later

session_desktop = 'gnome-classic.desktop'

i18n.merge_file(
  input: session_desktop + '.in',
  output: session_desktop,
  po_dir: '../po',
  install: true,
  install_dir: wlsessiondir,
  type: 'desktop',
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
  install_dir: modedir,
)

classic_override = '00_org.gnome.shell.extensions.classic.gschema.override'
install_data(classic_override, install_dir: schemadir)
