function createDataSourceSinkBase (execlib, DataSourceBase) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q;

  function DataSourceSinkBase (sink, options){
    DataSourceBase.call(this, options);
    this.sink = sink;
    this._starting = null;
    this._should_stop = null;
  }
  lib.inherit(DataSourceSinkBase, DataSourceBase);

  DataSourceSinkBase.prototype.destroy = function () {
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
  };

  DataSourceSinkBase.prototype.start = function () {
    this._should_stop = false;
    if (this._starting) return this._starting;
    if (!this.sink) return;

    this._starting = this.sink.waitForSink().then(this.onGotSink.bind(this));
    this._starting.done (this._started.bind(this));
    return this._starting;
  };

  DataSourceSinkBase.prototype._started = function () {
    //console.log('go go go ... task started ...');
    this._starting = null;
  };

  DataSourceSinkBase.prototype.onGotSink = function (sink){
    //if datasource was stopped while tasksink was obtained, make sure that task is not started 
    if (this._should_stop) return q.resolve(true);
    if (!sink.destroyed) return q.reject(false);
    return this._doGoWithSink(sink);
  };

  DataSourceSinkBase.prototype.setFilter = function (filter) {
    DataSourceBase.prototype.setFilter.call(this, filter);
    this.stop();
    if (!this._should_stop) this.start();
  };

  return DataSourceSinkBase;
}

module.exports = createDataSourceSinkBase;

