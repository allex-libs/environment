function createAllexDataQueryDataSource(execlib, DataSourceBase) {
  'use strict';

  var lib = execlib.lib,
    taskRegistry = execlib.execSuite.taskRegistry;

  function AllexDataQuery (sink, options) {
    DataSourceBase.call(this, options);
    this.sink = sink;
    this.task = null;
    this.data = [];
  }
  lib.inherit(AllexDataQuery, DataSourceBase);
  AllexDataQuery.prototype.destroy = function () {
    this.data = null;
    if (this.task) {
      this.task.destroy();
    }
    this.task = null;
    this.sink = null;
    DataSourceBase.prototype.destroy.call(this);
  };
  AllexDataQuery.prototype.setTarget = function (target) {
    this.sink.waitForSink().then(
      this.doSetTarget.bind(this, target)
    );
  };
  AllexDataQuery.prototype.doSetTarget = function (target, sink) {
    DataSourceBase.prototype.setTarget.call(this, target);
    var fire_er = this.fire.bind(this);
    this.task = taskRegistry.run('materializeQuery', {
      sink: sink,
      data: this.data,
      onInitiated: fire_er,
      onNewRecord: fire_er,
      onDelete: fire_er,
      onUpdate: fire_er,
      continuous: true
    });
    target = null;
  };
  AllexDataQuery.prototype.fire = function () {
    console.log('allex data changed', this.data);
    this.target.set('data', this.data.slice()); //horror, if there were a more elegant way...
  };

  return AllexDataQuery;
}

module.exports = createAllexDataQueryDataSource;
