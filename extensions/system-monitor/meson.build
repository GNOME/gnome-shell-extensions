# SPDX-FileCopyrightText: 2017 Florian Müllner <fmuellner@gnome.org>
#
# SPDX-License-Identifier: GPL-2.0-or-later

extension_data += configure_file(
  input: metadata_name + '.in',
  output: metadata_name,
  configuration: metadata_conf
)

extension_data += files('stylesheet.css')
extension_schemas += files('schemas/' + metadata_conf.get('gschemaname') + '.gschema.xml')

install_subdir('icons', install_dir: join_paths(extensiondir, uuid))
