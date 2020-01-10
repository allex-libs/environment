function createAllexLevelDBDataSource(execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    taskRegistry = execlib.execSuite.taskRegistry,
    DataSourceTaskBase = dataSourceRegistry.get('taskbase'),
    BusyLogic = dataSourceRegistry.get('busylogic'),
    q = lib.q,
    COMMANDS = {
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
    if (options.hook_type) {
      throw new Error('AllexLevelDB has moved to query instead of hook');
    }
    DataSourceTaskBase.call(this,sink, options); //nisam bas najsigurniji ...
    this._sink_name = options.sink;
    this.filter = options.filter || {};
    this.command_type = options.command_type ? options.command_type : 'data';
    this._bl = new BusyLogic(this, this.command_type === 'data');
    if (!(this.command_type in COMMANDS)) throw new Error ('Invalid hook type : '+options.command_type);
    this.data = null;
    this._resetData();
  }
  lib.inherit(AllexLevelDB, DataSourceTaskBase);
  AllexLevelDB.prototype.destroy = function () {
    this._sink_name = null;
    this._bl.destroy();
    this._bl = null;
    this.command_type = null;
    this.data = null;
    DataSourceTaskBase.prototype.destroy.call(this);
  };
  AllexLevelDB.IsSingleSink = true;

  AllexLevelDB.prototype._resetData = function () {
    var init = COMMANDS[this.command_type].init;
    if (lib.isFunction(init)) {
      this.data = new init;
    }
    if (lib.isArray(init)) {
      this.data = init.slice();
    }
  };

  AllexLevelDB.prototype.stop = function (){
    DataSourceTaskBase.prototype.stop.call(this);
    this._resetData();
  };

  AllexLevelDB.prototype._doStartTask = function (sink) {
    this.task = taskRegistry.run('queryLevelDB', {
      sink: sink,
      queryMethodName: COMMANDS[this.command_type].command,
      filter: this.filter,
      scanInitially: true,
      onPut: this.onLevelDBData.bind(this),
      onDel: console.warn.bind(console, 'AllexLevelDB deletion!'),
      onInit: lib.dummyFunc
    });
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
    if (!this.target) {
      console.log('stizu podaci iako nemam target ...', leveldata);
      return;
    }

    if (this.command_type === 'data') {
      this._processMap(leveldata);
      return;
    }

    if (this.command_type === 'log') {
      this._processArray (leveldata);
      return;
    }
  };

  AllexLevelDB.prototype.setTarget = function (target) {
    DataSourceTaskBase.prototype.setTarget.call(this, target);
    this._bl.setTarget(target);
  };

  AllexLevelDB.prototype.copyData = function () {
    switch (this.command_type) {
      case 'log' : return this.data.slice();
      //case 'data': return lib.extend({}, this.data);
      case 'data': return this.data;
    }
    throw new Error('Unknow hook type', this.command_type);
  };

  dataSourceRegistry.register('allexleveldb', AllexLevelDB);
}

module.exports = createAllexLevelDBDataSource;

