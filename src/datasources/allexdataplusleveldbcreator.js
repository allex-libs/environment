function createAllexDataPlusLevelDBDataSource(execlib, DataSourceTaskBase, BusyLogic) {
  'use strict';

  var lib = execlib.lib,
    taskRegistry = execlib.execSuite.taskRegistry,
    q = lib.q;

  function passthru (item) {
    return item;
  }
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
    this._bl = new BusyLogic (this);
    this.leveldbsink = sinks.leveldb;
    this.pk = options.primarykey;
    this.valuename = options.valuename || 'value';
    this.keyfilter = options.keyfilter || passthru;
    this.valuefilter = options.valuefilter || passthru;
    this.levelDBFilters = options.levelDBFilters || {};
    this.queryMethodName = options.queryMethodName || 'query';
    this.data = [];
    this.map = new lib.Map();
    this._reconsume = true;
    this._leveldb_sink_name = options.sinks.leveldb;
  }
  lib.inherit(AllexDataPlusLevelDB, DataSourceTaskBase);
  AllexDataPlusLevelDB.prototype.destroy = function () {
    this._leveldb_sink_name = null;
    this._bl.destroy();
    this._bl = null;
    this._reconsume = null;
    if (this.map) {
      this.map.destroy();
    }
    this.map = null;
    this.data = null;
    this.queryMethodName = null;
    this.levelDBFilters = null;
    this.valuename = null;
    this.pk = null;
    this.leveldbsink = null;
    this.valuefilter = null;
    this.keyfilter = null;
    DataSourceTaskBase.prototype.destroy.call(this);
  };

  AllexDataPlusLevelDB.prototype.setTarget = function (target) {
    DataSourceTaskBase.prototype.setTarget.call(this, target);
    this._bl.setTarget(target);
  };

  AllexDataPlusLevelDB.prototype._doStartTask = function (tasksink) {
    if (!this.leveldbsink) {
      console.warn('No leveldbsink');
      return;
    }
    var fire_er = this.fire.bind(this);
    var valuename = this.valuename;
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
    if (!this._reconsume) return q.resolve(true);
    this._reconsume = false;
    taskRegistry.run('queryLevelDB', {
      sink: leveldbsink,
      queryMethodName: this.queryMethodName,
      filter: this.levelDBFilters,
      scanInitially: true,
      onPut: this.onLevelDBData.bind(this),
      onDel: console.warn.bind(console, 'AllexDataPlusLevelDB deletion!'),
      onInit: lib.dummyFunc
    });
    return q.resolve(true);
  };
  AllexDataPlusLevelDB.prototype.fire = function () {
    this.map.traverse(this.valuer.bind(this));
    this._bl.emitData();
  };
  AllexDataPlusLevelDB.prototype.onLevelDBData = function (uservaluearry) {
    var k = this.keyfilter(uservaluearry[0]), v = this.valuefilter(uservaluearry[1]);
    this.map.replace(k, v);
    this.valuer(v, k);
    this._bl.emitData();
  };
  AllexDataPlusLevelDB.prototype.valuer = function (value, pk) {
    var data = this.data, dl = data.length, i, d, j, vn;
    for (i=0; i<dl; i++) {
      d = data[i];
      if (d[this.pk] === pk) {
        if (lib.isArray(this.valuename)) {
          for (j=0; j<this.valuename.length; j++) {
            vn = this.valuename[j];
            d[vn] = value[vn];
          }
        } else if ('object' === typeof this.valuename) {
          for (j in this.valuename) {
            if (this.valuename.hasOwnProperty(j)) {
              d[this.valuename[j]] = value[j];
            }
          }
        } else {
          d[this.valuename] = value;
        }
        return;
      }
    }
  };

  AllexDataPlusLevelDB.prototype.copyData = function () {
    return this.data.slice();
  };

  return AllexDataPlusLevelDB;
}

module.exports = createAllexDataPlusLevelDBDataSource;
