function createDataSourceSinkBase (execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    DataSourceBase = dataSourceRegistry.get('.'),
    cnt = 0;

  function DataSourceSinkBase (sink, options){
    DataSourceBase.call(this, options);
    this.cnt = cnt++;
    this.sink = sink;
    this.resetDataOnSinkLost = options.resetdataonsinklost;
    this._starting = null;
    this._should_stop = null;
    this._sink_instance = null;
    this._sink_destroyed_listener = null;
  }
  lib.inherit(DataSourceSinkBase, DataSourceBase);

  DataSourceSinkBase.prototype.destroy = function () {
    this.stop();
    this.resetDataOnSinkLost = null;
    this.sink = null;
    this._should_stop = null;
    this._starting = null;
    DataSourceBase.prototype.destroy.call(this);
  };

  DataSourceSinkBase.prototype.setTarget = function (target) {
    if (!this.sink) return;
    DataSourceBase.prototype.setTarget.call(this, target);

    if (target) {
      this.start();
    }else{
      this.stop();
    }
  };

  DataSourceSinkBase.prototype.stop = function () {
    this._starting = null;
    if (this._sink_destroyed_listener) this._sink_destroyed_listener.destroy();
    this._sink_destroyed_listener = null;
    this._sink_instance = null;
  };

  DataSourceSinkBase.prototype.start = function () {
    this._should_stop = false;
    if (this._starting) return this._starting;
    if (!this.sink) return;

    if (this._sink_instance) {
      this._starting = this.onGotSink(this._sink_instance);
      this._starting.done(this._started.bind(this));
      return this._starting;
    }

    this._starting = this.sink.waitForSink().then(this.onGotSink.bind(this));
    this._starting.done (this._started.bind(this));
    return this._starting;
  };

  DataSourceSinkBase.prototype._started = function () {
    this._starting = null;
  };

  DataSourceSinkBase.prototype._onSinkDestroyed = function () {
    if (this._sink_destroyed_listener) {
      this._sink_destroyed_listener.destroy();
    }
    this._sink_destroyed_listener = null;
    this._sink_instance = null;

    if (this._should_stop) return;
    //go and search for sink again ...
    this.start();
  };

  DataSourceSinkBase.prototype.onGotSink = function (sink){
    if (this._should_stop) return q.resolve(true);
    if (!sink.destroyed) return q.reject(false);

    this._sink_instance = sink;
    this._sink_destroyed_listener = sink.destroyed.attach(this._onSinkDestroyed.bind(this));

    return this._doGoWithSink(sink);
  };

  DataSourceSinkBase.prototype.setFilter = function (filter) {
    this.stop();
    DataSourceBase.prototype.setFilter.call(this, filter);
    if (!this._should_stop) this.start();
  };

  dataSourceRegistry.register('sinkbase', DataSourceSinkBase);
}

module.exports = createDataSourceSinkBase;

