function createAllexDataQueryDataSource(execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    taskRegistry = execlib.execSuite.taskRegistry,
    DataSourceTaskBase = dataSourceRegistry.get('taskbase'),
    BusyLogic = dataSourceRegistry.get('busylogic'),
    cnt = 0;


  function AllexDataQuery (sink, options) {
    DataSourceTaskBase.call(this, sink, options);
    this._bl = new BusyLogic(this);
    this.data = [];
    this.cnt = cnt++;
    if (options.filter) {
      this.filter = options.filter;
    }
  }
  lib.inherit(AllexDataQuery, DataSourceTaskBase);
  AllexDataQuery.prototype.destroy = function () {
    this._bl.destroy();
    this._bl = null;
    this.cnt = null;
    this.data = null;
    DataSourceTaskBase.prototype.destroy.call(this);
  };
  AllexDataQuery.IsSingleSink = true;

  AllexDataQuery.prototype.setTarget = function (target) {
    this._bl.setTarget(target);
    DataSourceTaskBase.prototype.setTarget.call(this, target);
  };

  AllexDataQuery.prototype.start = function () {
    if (this.resetDataOnSinkLost) {
      this.data = [];
      this.fire();
    }
    return DataSourceTaskBase.prototype.start.call(this);
  };

  AllexDataQuery.prototype._doStartTask = function (sink) {
    var fire_er = this.fire.bind(this);
    //console.log('about to start task on ', this.cnt, Date.now(), this.target.get('busy'));
    this._bl.block();
    this.task = taskRegistry.run('materializeQuery', {
      sink: sink,
      data: this.data,
      onInitiated: this.onInitiated.bind(this),
      onNewRecord: fire_er,
      onDelete: fire_er,
      onUpdate: fire_er,
      continuous: true,
      filter : this.filter
    });
  };

  AllexDataQuery.prototype.fire = function () {
    this._bl.unblock();
    this._bl.emitData();
  };

  AllexDataQuery.prototype.onInitiated = function () {
    //console.log('about to report initiated task on ', this.cnt, Date.now(), this.target.get('busy'));
    this._bl.unblockAndFlush();
  };

  AllexDataQuery.prototype.copyData = function () {
    return this.data.slice();
  };

  dataSourceRegistry.register('allexdataquery', AllexDataQuery);
}

module.exports = createAllexDataQueryDataSource;
