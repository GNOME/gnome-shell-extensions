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
  'stylesheet-light.css'
)

transform_stylesheet = [
   'sed', '-E',
   '-e', 's:^\.(workspace-indicator):.window-list-\\1:',
   '-e', '/^@import/d',
   '@INPUT@',
 ]

workspaceIndicatorSources = [
  configure_file(
    input: '../workspace-indicator/workspaceIndicator.js',
    output: '@PLAINNAME@',
    copy: true,
  ),
 configure_file(
   input: '../workspace-indicator/stylesheet-dark.css',
   output: 'stylesheet-workspace-switcher-dark.css',
   command: transform_stylesheet,
   capture: true,
 ),
 configure_file(
   input: '../workspace-indicator/stylesheet-light.css',
   output: 'stylesheet-workspace-switcher-light.css',
   command: transform_stylesheet,
   capture: true,
 ),
 files('../workspace-indicator/workspacePrefs.js'),
]

extension_sources += files('prefs.js') + workspaceIndicatorSources
extension_schemas += files(metadata_conf.get('gschemaname') + '.gschema.xml')
