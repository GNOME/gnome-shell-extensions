const AppDisplay = imports.ui.appDisplay;

var _onActivateOriginal = null;

function _activate(button) {
  this.animateLaunch();
  this.app.open_new_window(-1);
  Main.overview.hide();
}

function init() {
}

function enable() {
  _activateOriginal = AppDisplay.AppIcon.prototype.activate;
  AppDisplay.AppIcon.prototype.activate = _activate;
}

function disable() {
  AppDisplay.AppIcon.prototype.activate = _activateOriginal;
}
