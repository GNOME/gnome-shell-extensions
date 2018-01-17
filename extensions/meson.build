extension_schemas = []
js_sources = extensionlib

metadata_name = 'metadata.json'

foreach e : all_extensions
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

  js_sources += extension_sources

  if (enabled_extensions.contains(e))
    install_data (extension_sources + extension_data + extensionlib,
      install_dir: join_paths(extensiondir, uuid)
    )
  endif
endforeach

install_data (extension_schemas,
  install_dir: schemadir
)

foreach js_source : js_sources
  if (js52.found())
    path_array = '@0@'.format(js_source).split('/')
    name = join_paths(path_array[-2], path_array[-1])

    test('Checking syntax of ' + name, js52,
      args: ['-s', '-c', js_source],
      workdir: meson.current_source_dir()
    )
  endif
endforeach
