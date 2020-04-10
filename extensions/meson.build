extension_schemas = []
js_sources = []

metadata_name = 'metadata.json'

foreach e : enabled_extensions
  uuid = e + uuid_suffix

  metadata_conf = configuration_data()
  metadata_conf.set('extension_id', e)
  metadata_conf.set('uuid', uuid)
  metadata_conf.set('gschemaname', 'org.gnome.shell.extensions.' + e)
  metadata_conf.set('gettext_domain', gettext_domain)
  metadata_conf.set('shell_current', shell_version)
  metadata_conf.set('url', 'https://gitlab.gnome.org/GNOME/gnome-shell-extensions')

  extension_sources = files(e + '/extension.js')
  extension_data = files(e + '/stylesheet.css')

  subdir(e)

  install_data (extension_sources + extension_data,
    install_dir: join_paths(extensiondir, uuid)
  )
endforeach

install_data (extension_schemas,
  install_dir: schemadir
)
