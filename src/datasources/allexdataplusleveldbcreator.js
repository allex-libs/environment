function createAllexDataPlusLevelDBDataSource(execlib, DataSourceTaskBase) {
  'use strict';

  var lib = execlib.lib,
    taskRegistry = execlib.execSuite.taskRegistry,
    q = lib.q;

  function AllexDataPlusLevelDB (sinks, options) {
    if (!sinks.hasOwnProperty('data')) {
      throw new lib.Error('NO_DATA_SINK_IN_SINKS');
    }
    if (!sinks.hasOwnProperty('leveldb')) {
      throw new lib.Error('NO_leveldb_SINK_IN_SINKS');
    }
    if (!options.hasOwnProperty('primarykey')) {
      throw new lib.Error('NO_PRIMARYKEY_IN_OPTIONS');
    }
    DataSourceTaskBase.call(this,sinks.data, options);
    this.leveldbsink = sinks.leveldb;
    this.pk = options.primarykey;
    this.valuename = options.valuename || 'value';
    this.valuefilter = options.valuefilter || lib.dummyFunc;
    this.data = [];
    this.map = new lib.Map();
  }
  lib.inherit(AllexDataPlusLevelDB, DataSourceTaskBase);
  AllexDataPlusLevelDB.prototype.destroy = function () {
    if (this.map) {
      this.map.destroy();
    }
    this.map = null;
    this.data = null;
    //this.valuename = null;
    this.pk = null;
    this.leveldbsink = null;
    this.valuefilter = null;
    DataSourceTaskBase.prototype.destroy.call(this);
  };
  AllexDataPlusLevelDB.prototype._doStartTask = function (tasksink) {
    var fire_er = this.fire.bind(this);
    this.task = taskRegistry.run('materializeQuery', {
      sink: tasksink,
      data: this.data,
      onInitiated: fire_er,
      onNewRecord: fire_er,
      onDelete: fire_er,
      onUpdate: fire_er,
      continuous: true,
      filter : this.filter
    });
    return this.leveldbsink.waitForSink().then(
      this.onLeveldbSink.bind(this)
    );
  };
  AllexDataPlusLevelDB.prototype.onLeveldbSink = function (leveldbsink) {
    leveldbsink.consumeChannel('l', this.onBalance.bind(this));
    //accounts? zaista?
    leveldbsink.sessionCall('hook', {scan: true, accounts: ['***']});
    return q.resolve(true);
  };
  AllexDataPlusLevelDB.prototype.fire = function () {
    this.map.traverse(this.valuer.bind(this));
    this.target.set('data', this.data.slice());
  };
  AllexDataPlusLevelDB.prototype.onBalance = function (uservaluearry) {
    this.map.replace(uservaluearry[0], this.valuefilter(uservaluearry[1]));
    this.valuer(this.valuefilter(uservaluearry[1]), uservaluearry[0]);
    this.target.set('data', this.data.slice());
  };
  AllexDataPlusLevelDB.prototype.valuer = function (value, pk) {
    var data = this.data, dl = data.length, i, d;
    for (i=0; i<dl; i++) {
      d = data[i];
      if (d[this.pk] === pk) {
        d[this.valuename] = value;
        return;
      }
    }
  };

  return AllexDataPlusLevelDB;
}

module.exports = createAllexDataPlusLevelDBDataSource;
