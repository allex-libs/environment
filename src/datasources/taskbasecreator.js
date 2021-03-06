function createDataSourceTaskBase (execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    DataSourceSinkBase = dataSourceRegistry.get('sinkbase');

  function DataSourceTaskBase (tasksink, options){
    DataSourceSinkBase.call(this, tasksink, options);
    this.task = null;
    this._destroyed_listener = null;
  }
  lib.inherit(DataSourceTaskBase, DataSourceSinkBase);

  DataSourceTaskBase.prototype.destroy = function () {
    if (this._destroyed_listener) this._destroyed_listener.destroy();
    this._destroyed_listener = null;
    DataSourceSinkBase.prototype.destroy.call(this);
  };

  DataSourceTaskBase.prototype.stop = function () {
    var _ss = this._should_stop;
    if (this.task) {
      this._should_stop = true;
      this.task.destroy();
      this._should_stop = _ss;
    }
    this.task = null;
    DataSourceSinkBase.prototype.stop.call(this);
  };

  DataSourceTaskBase.prototype._doGoWithSink = function (sink) {
    if (!sink) {
      console.warn ('No sink in _doGoWithSink');
      return;
    }
    if (this.task) {
      //console.log('we have already set the filter in task ...');
      return q.reject (new Error('Already have a task'));
    }
    this._doStartTask(sink);
    if (this.task) {
      this._destroyed_listener = this.task.destroyed.attach (this._restart.bind(this));
    }
    return q.resolve('ok');
  };

  DataSourceTaskBase.prototype._restart = function () {
    ///to monitor sink up/down situations ...
    if (this._destroyed_listener) this._destroyed_listener.destroy();
    this._destroyed_listener = null;

    this.task = null;
    if (this._should_stop) return;
    this.start();
  };

  DataSourceTaskBase.prototype.setFilter = function (filter) {
    if (!filter) {
      this.stop();
      if (this.target) {
        this.target.set('data', null);
      }
      return;
    }
    return this.task ? this._doSetFilterWithTask(filter) : this._doSetFilterWithoutTask(filter);
  };


  DataSourceTaskBase.prototype._doSetFilterWithTask = function (filter){
    //console.log('will do set filter with task', filter);
    var sink = this.task.sink;
    if (this._destroyed_listener) this._destroyed_listener.destroy();
    this.task.destroy();
    this.task = null;

    this.filter = filter;
    this._doGoWithSink(sink);
    sink = null;
  };

  DataSourceTaskBase.prototype._doSetFilterWithoutTask = function (filter) {
    return DataSourceSinkBase.prototype.setFilter.call(this, filter);
  };

  dataSourceRegistry.register('taskbase', DataSourceTaskBase);
}

module.exports = createDataSourceTaskBase;

