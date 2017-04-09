extension_schemas = []

foreach e : enabled_extensions
  uuid = e + '@gnome-shell-extensions.gcampax.github.com'

  metadata_conf = configuration_data()
  metadata_conf.set('extension_id', e)
  metadata_conf.set('uuid', uuid)
  metadata_conf.set('gschemaname', 'org.gnome.shell.extensions.' + e)
  metadata_conf.set('gettext_domain', meson.project_name())
  metadata_conf.set('shell_current', shell_version)
  metadata_conf.set('url', 'https://gitlab.gnome.org/GNOME/gnome-shell-extensions')

  extension_sources = files(e + '/extension.js')
  extension_data = files(e + '/stylesheet.css')

  subdir(e)

  install_data (extension_sources + extension_data + extensionlib,
    install_dir: join_paths(extensiondir, uuid)
  )
endforeach

install_data (extension_schemas,
  install_dir: schemadir
)
