const Gio = imports.gi.Gio;
var NautilusFileOperationsProxy;
var FreeDesktopFileManagerProxy;

const NautilusFileOperationsInterface = `<node>
<interface name='org.gnome.Nautilus.FileOperations'> 
    <method name='CopyURIs'> 
        <arg name='URIs' type='as' direction='in'/> 
        <arg name='Destination' type='s' direction='in'/> 
    </method> 
    <method name='MoveURIs'> 
        <arg name='URIs' type='as' direction='in'/> 
        <arg name='Destination' type='s' direction='in'/> 
    </method> 
    <method name='TrashFiles'> 
        <arg name='URIs' type='as' direction='in'/> 
    </method> 
    <method name='CreateFolder'> 
        <arg name='URI' type='s' direction='in'/> 
    </method> 
    <method name='Undo'> 
    </method> 
    <method name='Redo'> 
    </method> 
    <property name='UndoStatus' type='i' access='read'/>
</interface> 
</node>`;

const NautilusFileOperationsProxyInterface = Gio.DBusProxy.makeProxyWrapper(NautilusFileOperationsInterface);

const FreeDesktopFileManagerInterface = `<node>
<interface name='org.freedesktop.FileManager1'> 
    <method name='ShowItems'> 
        <arg name='URIs' type='as' direction='in'/> 
        <arg name='StartupId' type='s' direction='in'/> 
    </method> 
    <method name='ShowItemProperties'> 
        <arg name='URIs' type='as' direction='in'/> 
        <arg name='StartupId' type='s' direction='in'/> 
    </method> 
</interface> 
</node>`;

const FreeDesktopFileManagerProxyInterface = Gio.DBusProxy.makeProxyWrapper(FreeDesktopFileManagerInterface);

function init() {
    NautilusFileOperationsProxy = new NautilusFileOperationsProxyInterface(
        Gio.DBus.session,
        'org.gnome.Nautilus',
        '/org/gnome/Nautilus',
        (proxy, error) => {
            if (error) {
                log('Error connecting to Nautilus');
            }
        }
    );

    FreeDesktopFileManagerProxy = new FreeDesktopFileManagerProxyInterface(
        Gio.DBus.session,
        'org.freedesktop.FileManager1',
        '/org/freedesktop/FileManager1',
        (proxy, error) => {
            if (error) {
                log('Error connecting to Nautilus');
            }
        }
    );
}