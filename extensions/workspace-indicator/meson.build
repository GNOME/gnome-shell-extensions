# SPDX-FileCopyrightText: 2017 Florian Müllner <fmuellner@gnome.org>
#
# SPDX-License-Identifier: GPL-2.0-or-later

extension_data += configure_file(
  input: metadata_name + '.in',
  output: metadata_name,
  configuration: metadata_conf
)
extension_data += files(
  'stylesheet-dark.css',
  'stylesheet-light.css',
)
extension_schemas += files('schemas/' + metadata_conf.get('gschemaname') + '.gschema.xml')

extension_sources += files('prefs.js', 'workspaceIndicator.js', 'workspacePrefs.js')
