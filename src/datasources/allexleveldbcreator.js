function createAllexLevelDBDataSource(execlib, DataSourceSinkBase, BusyLogic, LevelDBProxy) {
  'use strict';

  var lib = execlib.lib,
    taskRegistry = execlib.execSuite.taskRegistry,
    q = lib.q,
    VALID_HOOK_TYPES = {
      'data' : {
        channel : 'l', 
        init : {},
        command : 'hook'
      },
      'log' : {
        channel : 'g',
        init : [],
        command : 'hookToLog'
      }
    };

  function passthru (item) {
    return item;
  }
  function AllexLevelDB (sink, options) {
    DataSourceSinkBase.call(this,sink, options); //nisam bas najsigurniji ...
    this._sink_name = options.sink;
    this._bl = new BusyLogic(this);
    this.hook_params = options.hook_params ? options.hook_params : {scan : true, accounts : ['***']};
    this.hook_type = options.hook_type ? options.hook_type : 'data';
    if (!(this.hook_type in VALID_HOOK_TYPES)) throw new Error ('Invalid hook type : '+options.hook_type);
    this.data = lib.extend (VALID_HOOK_TYPES[this.hook_type].init);
  }
  lib.inherit(AllexLevelDB, DataSourceSinkBase);
  AllexLevelDB.prototype.destroy = function () {
    this._sink_name = null;
    this.hook_params = null;
    this._bl.destroy();
    this._bl = null;
    this.data = null;
    DataSourceSinkBase.prototype.destroy.call(this);
  };

  AllexLevelDB.prototype._doGoWithSink = function (sink) {
    LevelDBProxy.consumeChannel(this._sink_name, sink, VALID_HOOK_TYPES[this.hook_type].channel, this.onLevelDBData.bind(this));
    sink.sessionCall(VALID_HOOK_TYPES[this.hook_type].command, this.hook_params);
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


  AllexLevelDB.prototype._processHook = function (leveldata) {
    var key = leveldata[0];
    if (lib.isArray(key)){
      fromarrayToData (key.slice(), this.data, leveldata[1]);
    }else{
      this.data[leveldata[0]] = leveldata[1];
    }
    this._bl.emitData();
  };

  AllexLevelDB.prototype._processHookToLog = function (leveldata) {
    this.data.push (leveldata);
    this._bl.emitData();
  };

  //TODO: fali filter, faili optimizacija na set data, radi se na slepo
  AllexLevelDB.prototype.onLevelDBData = function (leveldata) {
    if (!leveldata) return;

    if (this.hook_type === 'data') {
      this._processHook(leveldata);
      return;
    }

    if (this.hook_type === 'log') {
      this._processHookToLog (leveldata);
      return;
    }
  };

  AllexLevelDB.prototype.setTarget = function (target) {
    DataSourceSinkBase.prototype.setTarget.call(this, target);
    this._bl.setTarget(target);
  };

  AllexLevelDB.prototype.copyData = function () {
    switch (this.hook_type) {
      case 'log' : return this.data.slice();
      case 'data': return lib.extend({}, this.data);
    }
    throw new Error('Unknow hook type', this.hook_type);
  };

  return AllexLevelDB;
}

module.exports = createAllexLevelDBDataSource;

