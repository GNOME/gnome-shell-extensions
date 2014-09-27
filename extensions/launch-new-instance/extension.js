const AppDisplay = imports.ui.appDisplay;

var _onActivateOriginal = null;

function init() {
}

function enable() {
  _activateOriginal = AppDisplay.AppIcon.prototype.activate;
  AppDisplay.AppIcon.prototype.activate = function() {
      _activateOriginal.call(this, 2);
  };
}

function disable() {
  AppDisplay.AppIcon.prototype.activate = _activateOriginal;
}
