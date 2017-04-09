extension_data += configure_file(
  input: metadata_name + '.in',
  output: metadata_name,
  configuration: metadata_conf
)

extension_sources += files('prefs.js')
extension_schemas += files(metadata_conf.get('gschemaname') + '.gschema.xml')
