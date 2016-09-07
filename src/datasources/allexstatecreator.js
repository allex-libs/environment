function createAllexStateDataSource (execlib, DataSourceBase) {
  'use strict';

  var lib = execlib.lib;

  function AllexState (sink, options) {
    DataSourceBase.call(this, options);
    if (!sink) {
      throw new lib.Error('NO_SINK');
    }
    if (!(options && options.path)) {
      throw new lib.Error('NO_STATE_NAME');
    }
    this.sink = sink;
    this.name = options.path;
    this.monitor = null;
  }
  lib.inherit(AllexState, DataSourceBase);
  AllexState.prototype.destroy = function () {
    if (this.monitor) {
      this.monitor.destroy();
    }
    this.monitor = null;
    this.name = null;
    this.sink = null;
    DataSourceBase.prototype.destroy.call(this);
  };
  AllexState.prototype.setTarget = function (target) {
    DataSourceBase.prototype.setTarget.call(this, target);
    var h = {};
    h[this.name] = this.onStateData.bind(this);
    this.monitor = this.sink.monitorStateForGui(h);
  };
  AllexState.prototype.onStateData = function (data) {
    //console.log('got state data', data);
    if (!this.target) {
      return;
    }
    this.target.set('data', data);
  };

  return AllexState;
}

module.exports = createAllexStateDataSource;
