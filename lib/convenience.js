/* -*- mode: js; js-basic-offset: 4; indent-tabs-mode: nil -*- */

const Gettext = imports.gettext;
const Gio = imports.gi.Gio;

const ExtensionUtils = imports.misc.extensionUtils;

/**
 * initTranslations:
 * @domain: (optional): the gettext domain to use
 *
 * Initialize Gettext to load translations from extensionsdir/locale.
 * If @domain is not provided, it will be taken from metadata['gettext-domain']
 */
function initTranslations(domain) {
    let extension = ExtensionUtils.getCurrentExtension();

    domain = domain || extension.metadata['gettext-domain'];

    let localeDir = extension.dir.get_child('locale').get_path();
    Gettext.bindtextdomain(domain, localeDir);
}

/**
 * getSettings:
 * @schema: (optional): the GSettings schema id
 *
 * Builds and return a GSettings schema for @schema, using schema files
 * in extensionsdir/schemas. If @schema is not provided, it is taken from
 * metadata['settings-schema'].
 */
function getSettings(schema) {
    let extension = ExtensionUtils.getCurrentExtension();

    schema = schema || extension.metadata['settings-schema'];

    let schemaDir = extension.dir.get_child('schemas').get_path();
    let schemaSource = Gio.SettingsSchemaSource.new_from_directory(schemaDir,
                                                                   Gio.SettingsSchemaSource.get_default(),
                                                                   false);
    let schemaObj = schemaSource.lookup(schema, false);

    return new Gio.Settings({ settings_schema: schemaObj });
}
								  
