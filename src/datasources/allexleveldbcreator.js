function createAllexLevelDBDataSource(execlib, DataSourceSinkBase, BusyLogic) {
  'use strict';

  var lib = execlib.lib,
    taskRegistry = execlib.execSuite.taskRegistry,
    q = lib.q,
    VALID_HOOK_TYPES = {
      'data' : {
        init : lib.Map,
        command : 'query'
      },
      'log' : {
        init : [],
        command : 'queryLog'
      }
    };

  function passthru (item) {
    return item;
  }
  function AllexLevelDB (sink, options) {
    DataSourceSinkBase.call(this,sink, options); //nisam bas najsigurniji ...
    var init;
    this._sink_name = options.sink;
    this._filter = options.filter || {};
    this._bl = new BusyLogic(this);
    this.hook_params = options.hook_params ? options.hook_params : {scan : true, accounts : ['***']};
    this.hook_type = options.hook_type ? options.hook_type : 'data';
    if (!(this.hook_type in VALID_HOOK_TYPES)) throw new Error ('Invalid hook type : '+options.hook_type);
    this.data = null;
    init = VALID_HOOK_TYPES[this.hook_type].init;
    if (lib.isFunction(init)) {
      this.data = new init;
    }
    if (lib.isArray(init)) {
      this.data = init.slice();
    }
  }
  lib.inherit(AllexLevelDB, DataSourceSinkBase);
  AllexLevelDB.prototype.destroy = function () {
    this._sink_name = null;
    this._filter = null;
    this.hook_params = null;
    this._bl.destroy();
    this._bl = null;
    this.data = null;
    DataSourceSinkBase.prototype.destroy.call(this);
  };

  AllexLevelDB.prototype._doGoWithSink = function (sink) {
    //sink.sessionCall(VALID_HOOK_TYPES[this.hook_type].command, this.hook_params);
    taskRegistry.run('queryLevelDB', {
      sink: sink,
      queryMethodName: VALID_HOOK_TYPES[this.hook_type].command,
      filter: this._filter,
      scanInitially: true,
      onPut: this.onLevelDBData.bind(this),
      onDel: this.onLevelDBData.bind(this),
      onInit: console.log.bind(console, 'queryLevelDB init')
    });
    return q.resolve(true);
  };

  function fromarrayToData (key, data, val) {
    if (key.length === 1) {
      data.replace(key[0], val);
      return;
    }

    var k = key.shift();
    if (!lib.isVal(data.get(k))) {
      data.add(k, new lib.Map());
    }
    fromarrayToData (key, data.get(k), val);
  }


  AllexLevelDB.prototype._processMap = function (leveldata) {
    var key = leveldata[0];
    if (lib.isArray(key)){
      fromarrayToData (key.slice(), this.data, leveldata[1]);
    }else{
      //this.data[leveldata[0]] = leveldata[1];
      this.data.replace(leveldata[0], leveldata[1]);
    }
    this._bl.emitData();
  };

  AllexLevelDB.prototype._processArray = function (leveldata) {
    this.data.push (leveldata);
    this._bl.emitData();
  };

  //TODO: fali filter, faili optimizacija na set data, radi se na slepo
  AllexLevelDB.prototype.onLevelDBData = function (leveldata) {
    if (!leveldata) return;

    if (this.hook_type === 'data') {
      this._processMap(leveldata);
      return;
    }

    if (this.hook_type === 'log') {
      this._processArray (leveldata);
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
      //case 'data': return lib.extend({}, this.data);
      case 'data': return this.data;
    }
    throw new Error('Unknow hook type', this.hook_type);
  };

  return AllexLevelDB;
}

module.exports = createAllexLevelDBDataSource;

