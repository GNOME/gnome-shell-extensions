import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

const {AppIcon} = imports.ui.appDisplay;

export default class Extension {
    constructor() {
        this._injectionManager = new InjectionManager();
    }

    enable() {
        this._injectionManager.overrideMethod(AppIcon.prototype, 'activate',
            originalMethod => {
                return function () {
                    // eslint-disable-next-line no-invalid-this
                    originalMethod.call(this, 2);
                };
            });
    }

    disable() {
        this._injectionManager.clear();
    }
}
