function createAllexDataPlusDataSource (execlib, DataSourceBase) {
  'use strict';
  var lib = execlib.lib,
    taskRegistry = execlib.execSuite.taskRegistry,
    q = lib.q,
    unique = lib.arryOperations.unique, 
    difference = lib.arryOperations.difference;


  function AllexDataPlusData (sinks, options) {
    if (!sinks.hasOwnProperty('keys')) {
      throw new lib.Error('NO_DATA_SINK_IN_SINKS');
    }
    if (!sinks.hasOwnProperty('values')) {
      throw new lib.Error('NO_FETCH_SINK_IN_SINKS');
    }

    if (!options.hasOwnProperty('key_fields')){
      throw new lib.Error('NO_KEY_FIELDS');
    }

    DataSourceBase.call(this, sinks.keys, options);
    this.keys_sink = sinks.keys;
    this.values_sink = sinks.values;
    this._should_stop = null;
    this._tasks_starting = null;
    this.keys_task = null;
    this.key_fields = lib.isString(options.key_fields) ? options.key_fields.split(',') : options.key_fields;

    this.key_vals = {};
    for (var i in this.key_fields){
      this.key_vals[this.key_fields[i]] = [];
    }
    this.values_task = null;
    this.left_side_data = [];
    this.right_side_data = [];
    this._keys = null;
    this.key_indices_map = null;
    this.data = [];
  }

  lib.inherit (AllexDataPlusData, DataSourceBase);
  AllexDataPlusData.prototype.destroy = function () {
    this.stop();
    this.key_vals = null;
    this.key_fields = null;
    this.keys = null;
    this.left_side_data = null;
    this.right_side_data = null;
    this.keys_sink = null;
    this.values_sink = null;
    this.keys_task = null;
    this.values_task = null;
    this._should_stop = null;
    this._tasks_starting = null;
    this.data = null;
    DataSourceBase.prototype.destroy.call(this);
  };


  AllexDataPlusData.prototype.setTarget = function (target){
    if (!this.keys_sink) console.warn ('No keys sink');
    if (!this.values_sink) console.warn ('No values sink');

    DataSourceBase.prototype.setTarget.call(this, target);
    if (target) {
      this.start();
    }else{
      this.stop();
    }
  };


  AllexDataPlusData.prototype.start = function () {
    if (!this.keys_sink || !this.values_sink) return;
    if (this._tasks_starting) return this._tasks_starting;
    this._should_stop = false;

    this._tasks_starting = this.keys_sink.waitForSink()
      .then(this.onKeysSinkReady.bind(this))
      .then(this.values_sink.waitForSink.bind(this.values_sink))
      .then(this.onSinksReady.bind(this));
  };

  AllexDataPlusData.prototype.stop = function () {
    this._should_stop = true;
    this._tasks_starting = null;
    if (this.keys_task) {
      this.keys_task.destroy();
    }
    this.keys_task = null;
    if (this.values_task){
      this.values_task.destroy();
    }
    this.values_task = null;
    this.key_indices_map.destroy();
    this.key_indices_map = null;
  };

  AllexDataPlusData.prototype.onSinksReady = function (keysink){
  };

  AllexDataPlusData.prototype.onKeysSinkReady = function (keysink){
    this.keys_task = taskRegistry.run ('materializeQuery', {
      sink : keysink,
      data : this.left_side_data,
      onInitiated : this._process_left_side.bind(this, 'init'),
      onNewRecord : this._process_left_side.bind(this, 'new'),
      onDelete : this._process_left_side.bind(this, 'delete'),
      onUpdate : this._process_left_side.bind(this, 'update'),
      continuous : true,
      filter : this.filter
    });
    return q.resolve('ok');
  };

  function valuize (data, key) {
    return data[key];
  }
  function toMapKey (fields, data) {
    return JSON.stringify(fields.map (valuize.bind(null, data)))
  }


  AllexDataPlusData.prototype._process_left_side = function (what) {
    this.data.splice(0, this.data.length);
    var km = new lib.Map(), 
      ld,
      list, //list of values for 'in' filter for fetch ... 
      map_key,
      fieldname,
      i,
      j,
      key;


    if (this.key_indices_map) this.key_indices_map.destroy();
    this.key_indices_map = new lib.Map();

    for (i = 0; i < this.left_side_data.length; i++){
      ld = this.left_side_data[i];

      for (j = 0; j < this.key_fields.length; j++){
        fieldname = this.key_fields[j];
        list = km.get(fieldname);
        if (!list) {
          list = [];
          km.add(fieldname, list);
        }
        list.push (ld[fieldname]);
      }
      try {
        key = toMapKey(this.key_fields, ld);
        if (lib.isUndef(this.key_indices_map.get(key))) {
          this.key_indices_map.add (key, i);
        }
      }catch (e) {
        console.warn('Duplicate detected in left side data ...', map_key, e);
      }
      this.data[i] = ld;
    }
    var changed = false, field;

    for (i in this.key_fields){
      field = this.key_fields[i];
      list = km.get(field);

      if (!this.key_vals[field] && list){
        changed = true;
      }

      if (this.key_vals[field] && !list) {
        changed = true;
      }


      if (!changed) {
        field = this.key_fields[i];
        if (this.key_vals[field].length !== list.length || difference(this.key_vals[field], list).length)
        {
          changed = true;
        }
      }
      this.key_vals[field] = list;
    }

    if (changed) {
      this.values_sink.waitForSink().then(this.restartValuesTask.bind(this));
    }
  };

  AllexDataPlusData.prototype.restartValuesTask = function (sink) {
    if (this.values_task) {
      this.values_task.destroy();
    }
    this.values_task = taskRegistry.run ('materializeQuery', {
      sink : sink,
      data : this.right_side_data,
      onInitiated : this._join_values.bind(this),
      onNewRecord : this._join_values.bind(this),
      onDelete : this._join_values.bind(this),
      onUpdate : this._join_values.bind(this),
      continuous : true,
      filter : null ///TODO: ovde si stao ... kako da napises filtar
    });
  };

  AllexDataPlusData.prototype._join_values = function () {
    var i = 0, 
      rsd,
      key,
      index;
    for (var i = 0; i < this.right_side_data.length; i++) {
      rsd = this.right_side_data[i];
      key = toMapKey (this.key_fields, rsd);
      index = this.key_indices_map.get(key);

      if (lib.isUndef(index)) continue;
      this.data[index] = lib.extend (this.left_side_data[index], rsd);
    }
    this.target.set('data', this.data.slice());
  };

  return AllexDataPlusData;
}

module.exports = createAllexDataPlusDataSource;
