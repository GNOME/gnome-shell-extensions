const AppDisplay = imports.ui.appDisplay;

export default class Extension {
    constructor() {
        this._appIconProto = AppDisplay.AppIcon.prototype;
        this._activateOriginal = this._appIconProto.activate;
    }

    enable() {
        const {_activateOriginal} = this;
        this._appIconProto.activate = function () {
            _activateOriginal.call(this, 2);
        };
    }

    disable() {
        this._appIconProto.activate = this._activateOriginal;
    }
}
