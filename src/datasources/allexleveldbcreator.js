function createAllexLevelDBDataSource(execlib, DataSourceSinkBase) {
  'use strict';

  var lib = execlib.lib,
    taskRegistry = execlib.execSuite.taskRegistry,
    q = lib.q;

  function passthru (item) {
    return item;
  }
  function AllexLevelDB (sink, options) {
    DataSourceSinkBase.call(this,sink, options); //nisam bas najsigurniji ...
    this.data = {};
  }
  lib.inherit(AllexLevelDB, DataSourceSinkBase);
  AllexLevelDB.prototype.destroy = function () {
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
    this.target.set('data', lib.extend({}, this.data));
  };

  return AllexLevelDB;
}

module.exports = createAllexLevelDBDataSource;

