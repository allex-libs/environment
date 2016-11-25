function createDataSourceTaskBase (execlib, DataSourceSinkBase) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q;

  function DataSourceTaskBase (tasksink, options){
    DataSourceSinkBase.call(this, tasksink, options);
    this.task = null;
  }
  lib.inherit(DataSourceTaskBase, DataSourceSinkBase);

  DataSourceTaskBase.prototype.destroy = function () {
    DataSourceSinkBase.prototype.destroy.call(this);
  };

  DataSourceTaskBase.prototype.stop = function () {
    if (this.task) {
      this.task.destroy();
    }
    this.task = null;
  };

  DataSourceTaskBase.prototype._doGoWithSink = function (sink) {
    this._doStartTask(sink);
  };

  return DataSourceTaskBase;
}

module.exports = createDataSourceTaskBase;

