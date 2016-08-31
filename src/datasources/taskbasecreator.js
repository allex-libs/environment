function createDataSourceTaskBase (execlib, DataSourceBase) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q;

  function DataSourceTaskBase (tasksink, options){
    DataSourceBase.call(this, options);
    this.task = null;
    this.tasksink = tasksink;
    this._task_starting = null;
    this._should_stop = null;
  }
  lib.inherit(DataSourceTaskBase, DataSourceBase);

  DataSourceTaskBase.prototype.destroy = function () {
    this.stopTask();
    this.task = null;
    this.tasksink = null;
    this._should_stop = null;
    this._task_starting = null;
    DataSourceBase.prototype.destroy.call(this);
  };

  DataSourceTaskBase.prototype.stopTask = function () {
    if (this.task) {
      this.task.destroy();
    }
    this.task = null;
  };

  DataSourceTaskBase.prototype.setTarget = function (target) {
    if (!this.tasksink) return;

    DataSourceBase.prototype.setTarget.call(this, target);
    if (target) {
      this.startTask();
    }else{
      this.stopTask();
    }
  };

  DataSourceTaskBase.prototype.startTask = function () {
    this._should_stop = false;
    if (this._task_starting) return this._task_starting;
    if (!this.tasksink) return;

    this._task_starting = this.tasksink.waitForSink().then(this.onGotSink.bind(this));
    this._task_starting.done (this._taskStarted.bind(this));
    return this._task_starting;
  };

  DataSourceTaskBase.prototype._taskStarted = function () {
    //console.log('go go go ... task started ...');
    this._task_starting = null;
  };

  DataSourceTaskBase.prototype.onGotSink = function (tasksink){
    //if datasource was stopped while tasksink was obtained, make sure that task is not started 
    if (this._should_stop) return q.resolve(true);
    if (!tasksink.destroyed) return q.reject(false);
    if (this.filter) {
      console.log('about to start data task with filter', this.filter);
    }
    return this._doStartTask(tasksink);
  };

  DataSourceTaskBase.prototype.setFilter = function (filter) {
    DataSourceBase.prototype.setFilter.call(this, filter);
    this.stopTask();
    if (!this._should_stop) this.startTask();
  };

  return DataSourceTaskBase;
}

module.exports = createDataSourceTaskBase;

