function createAllexStateDataSource (execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    DataSourceBase = dataSourceRegistry.get('.');

  function AllexState (sink, options) {
    DataSourceBase.call(this, options);
    if (!sink) {
      //throw new lib.Error('NO_SINK');
      console.error ('Sink for state was not found. Sink: ', options.sink, 'path:', options.path);
      return;
    }
    if (!(options && options.path)) {
      throw new lib.Error('NO_STATE_NAME');
    }
    this.sink = sink;
    this.name = options.path;
    this.removalValue = options.removalValue;
    this.monitor = null;
  }
  lib.inherit(AllexState, DataSourceBase);
  AllexState.prototype.destroy = function () {
    if (this.monitor) {
      this.monitor.destroy();
    }
    this.monitor = null;
    this.removalValue = null;
    this.name = null;
    this.sink = null;
    DataSourceBase.prototype.destroy.call(this);
  };
  AllexState.IsSingleSink = true;
  AllexState.prototype.setTarget = function (target) {
    if (!this.sink) return;
    DataSourceBase.prototype.setTarget.call(this, target);
    var h = {};
    h[this.name] = this.onStateData.bind(this);
    this.monitor = this.sink.monitorStateForGui(h);
  };
  AllexState.prototype.onStateData = function (data) {
    //console.log('got state data', data);
    var und;
    if (!this.target) {
      return;
    }
    if (und === data) {
      if (und !== this.removalValue) {
        this.target.set('data', this.removalValue);
      } else {
        this.target.set('data', null);
      }
    } else {
      if (lib.isEqual(this.target.get('data'), data)) {
        return;
      }
      this.target.set('data', data);
    }
  };

  dataSourceRegistry.register('allexstate', AllexState);
}

module.exports = createAllexStateDataSource;
