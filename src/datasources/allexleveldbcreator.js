function createAllexLevelDBDataSource(execlib, DataSourceSinkBase, BusyLogic) {
  'use strict';

  var lib = execlib.lib,
    taskRegistry = execlib.execSuite.taskRegistry,
    q = lib.q;

  function passthru (item) {
    return item;
  }
  function AllexLevelDB (sink, options) {
    DataSourceSinkBase.call(this,sink, options); //nisam bas najsigurniji ...
    this._bl = new BusyLogic(this);
    this.data = {};
    this.hook_params = options.hook_params ? options.hook_params : {scan : true, accounts : ['***']};
  }
  lib.inherit(AllexLevelDB, DataSourceSinkBase);
  AllexLevelDB.prototype.destroy = function () {
    this.hook_params = null;
    this._bl.destroy();
    this._bl = null;
    this.data = null;
    DataSourceSinkBase.prototype.destroy.call(this);
  };

  AllexLevelDB.prototype._doGoWithSink = function (sink) {
    sink.consumeChannel('l', this.onLevelDBData.bind(this));
    sink.sessionCall('hook', this.hook_params);
    return q.resolve(true);
  };

  function fromarrayToData (key, data, val) {
    if (key.length === 1) {
      data[key[0]] = val;
      return;
    }

    var k = key.shift();
    if (!data.hasOwnProperty(k)) {
      data[k] = {};
    }
    fromarrayToData (key, data[k], val);
  }

  //TODO: fali filter, faili optimizacija na set data, radi se na slepo
  AllexLevelDB.prototype.onLevelDBData = function (leveldata) {
    if (!leveldata) return;
    var key = leveldata[0];
    if (lib.isArray(key)){
      fromarrayToData (key.slice(), this.data, leveldata[1]);
    }else{
      this.data[leveldata[0]] = leveldata[1];
    }
    this._bl.emitData();
  };

  AllexLevelDB.prototype.setTarget = function (target) {
    DataSourceSinkBase.prototype.setTarget.call(this, target);
    this._bl.setTarget(target);
  };

  AllexLevelDB.prototype.copyData = function () {
    return lib.extend({}, this.data);
  };

  return AllexLevelDB;
}

module.exports = createAllexLevelDBDataSource;

