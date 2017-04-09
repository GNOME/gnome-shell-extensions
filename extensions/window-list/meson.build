extension_data += configure_file(
  input: 'metadata.json.in',
  output: 'metadata.json',
  configuration: metadata_conf
)

extension_sources += files('prefs.js')
extension_schemas += files(metadata_conf.get('gschemaname') + '.gschema.xml')

if classic_mode_enabled
  extension_data += files('classic.css')
endif
