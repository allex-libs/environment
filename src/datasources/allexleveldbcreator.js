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
  }
  lib.inherit(AllexLevelDB, DataSourceSinkBase);
  AllexLevelDB.prototype.destroy = function () {
    this._bl.destroy();
    this._bl = null;
    this.data = null;
    DataSourceSinkBase.prototype.destroy.call(this);
  };

  AllexLevelDB.prototype._doGoWithSink = function (sink) {
    sink.consumeChannel('l', this.onLevelDBData.bind(this));
    sink.sessionCall('hook', {scan: true, accounts: ['***']});
    return q.resolve(true);
  };

  //TODO: fali filter, faili optimizacija na set data, radi se na slepo
  AllexLevelDB.prototype.onLevelDBData = function (leveldata) {
    if (!leveldata) return;
    this.data[leveldata[0]] = leveldata[1];
    this._bl.emitData();
  };

  AllexLevelDB.prototype.setTarget = function (target) {
    DataSourceSinkBase.prototype.prototype.setTarget.call(this, target);
    this._bl.setTarget(target);
  };

  AllexLevelDB.prototype.copyData = function () {
    return lib.extend({}, this.data);
  };

  return AllexLevelDB;
}

module.exports = createAllexLevelDBDataSource;

