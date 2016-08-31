function createAllexDataQueryDataSource(execlib, DataSourceTaskBase) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    taskRegistry = execlib.execSuite.taskRegistry;

  function AllexDataQuery (sink, options) {
    DataSourceTaskBase.call(this, sink, options);
    this.data = [];
  }
  lib.inherit(AllexDataQuery, DataSourceTaskBase);
  AllexDataQuery.prototype.destroy = function () {
    this.data = null;
    DataSourceTaskBase.prototype.destroy.call(this);
  };

  AllexDataQuery.prototype._doStartTask = function (sink) {
    var fire_er = this.fire.bind(this);
    this.task = taskRegistry.run('materializeQuery', {
      sink: sink,
      data: this.data,
      onInitiated: fire_er,
      onNewRecord: fire_er,
      onDelete: fire_er,
      onUpdate: fire_er,
      continuous: true,
      filter : this.filter
    });
    return q.resolve(true);
  };

  AllexDataQuery.prototype.fire = function () {
    console.log('allex data changed', this.data);
    this.target.set('data', this.data.slice()); //horror, if there were a more elegant way...
  };

  return AllexDataQuery;
}

module.exports = createAllexDataQueryDataSource;
