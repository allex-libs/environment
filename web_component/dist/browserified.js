(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
var lR = ALLEX.execSuite.libRegistry;
lR.register('allex_environmentlib',require('./src/libindex')(
  ALLEX,
  lR.get('allex_leveldblib'),
  lR.get('allex_userrepresentationlib')
));
ALLEX.WEB_COMPONENTS.allex_environmentlib = lR.get('allex_environmentlib');

},{"./src/libindex":21}],2:[function(require,module,exports){
function createAllexEnvironment (execlib, environmentRegistry, CommandBase) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    EnvironmentBase = environmentRegistry.get('.'),
    _persistableStorageName = 'localpersistablestorage';

  function LocalCommand (options) {
    if (!(options && lib.isFunction(options.func))) {
      throw new Error('options for the LocalCommand ctor must be a hash with the "func" property - that IsA Function');
    }
    CommandBase.call(this);
    this.func = options.func;
  }
  lib.inherit(LocalCommand, CommandBase);
  LocalCommand.prototype.destroy = function () {
    this.func = null;
  };
  LocalCommand.prototype.doExecute = function (args) {
    if (!lib.isFunction(this.func)) {
      throw new Error (this.ctor.name+' lost its func, cannot execute');
    }
    var funcret = this.func.apply(null, args);
    if (q.isThenable(funcret)) {
      return funcret;
    }
    return q(funcret);
  };
  
  function AllexEnvironment (options) {
    EnvironmentBase.call(this, options);
    this.createStorage(_persistableStorageName);
  }
  lib.inherit (AllexEnvironment, EnvironmentBase);
  AllexEnvironment.prototype.createDataSource = function (type, options, name) {
    var ctor = this.getDataSourceCtor(type);
    if (!options || !options.sink && !options.sinks) {
      return this.createSinkLessSource (type, options, name);
    }
    if (options && options.sinks) {
      if (!ctor.IsMultiSink) {
        throw new Error('DataSource type '+type+' is not of a MultiSink type');
      }
      return this.createMultiSinkDataSource (ctor, options);
    }
    if (options && options.sink) {
      if (!ctor.IsSingleSink) {
        throw new Error('DataSource type '+type+' is not of a SingleSink type');
      }
      return this.findSink(options.sink).then(
        this.onSinkForCreateDataSource.bind(this, ctor, options)
      );
    }
    console.error(options);
    throw new Error('Malformed options for type '+type);
  };

  AllexEnvironment.prototype.createSinkLessSource = function (type, options, name) {
    var ctor;
    switch (type) {
      case 'jsdata': 
        options.env_storage = {
          get: this.getFromStorageSafe.bind(this, _persistableStorageName, name),
          put: this.putToStorage.bind(this, _persistableStorageName, name)
        };
        break;
      case 'localhash2array': 
        break;
      case 'commandwaiter':
        break;
      default:
        throw new lib.Error('DATASOURCE_TYPE_NOT_APPLICABLE_TO_ALLEX_ENVIRONMENT', 'DataSource type '+type+' is not supported by createSinkLessSource');
    }
    ctor = this.getDataSourceCtor(type);

    return q (new ctor(options));
  };

  AllexEnvironment.prototype.onSinkForCreateDataSource = function (ctor, options, sink) {
    return q(new ctor(sink, options));
  };

  AllexEnvironment.prototype.sinkfinder = function (promises, sinks, sinkname, sinkreference) {
    var d = q.defer(), Err = lib.Error;
    this.findSink(sinkname).then(function (sink) {
      if (!sink) {
        console.error('Sink for createMultiSinkDataSource referenced as', sinkreference,'and name', sinkname, 'was not found');
        d.reject(new Err('SINK_NOT_FOUND_FOR_MULTISINK_DATASOURCE', 'Sink for createMultiSinkDataSource referenced as '+sinkreference+' was not found'));
      } else {
        sinks[sinkreference] = sink;
        d.resolve(true);
      }
      Err = null;
      sinks = null;
      sinkreference = null;
      d = null;
    });
    promises.push(d.promise);
  }

  AllexEnvironment.prototype.createMultiSinkDataSource = function (ctor, options) {
    var promises = [], sinks = {}, _p = promises, _s = sinks;
    lib.traverseShallow(options.sinks, this.sinkfinder.bind(this, _p, _s));
    _p = null;
    _s = null;
    return q.all(promises).then(this.onSinksReady.bind(this, ctor, sinks, options));
  };

  AllexEnvironment.prototype.onSinksReady = function (ctor, sinks, options) {
    return q(new ctor(sinks, options));
  };

  AllexEnvironment.prototype.createCommand = function (options) {
    var ctor;
    switch (options.type) {
      case 'local':
        ctor = LocalCommand;
        break;
      default: 
        throw new lib.Error('NOT_IMPLEMENTED_YET', options.type+' is not an applicable Command type for AllexEnvironment');
    }
    return new ctor(options.options);
  };

  AllexEnvironment.prototype.onDataSourceCreated = function (desc, ds) {
    return EnvironmentBase.prototype.onDataSourceCreated.call(this, desc, ds);
  };

  environmentRegistry.register('allexbase', AllexEnvironment);
}

module.exports = createAllexEnvironment;

},{}],3:[function(require,module,exports){
function createEnvironmentBase (execlib, leveldblib, DataSourceRegistry, environmentRegistry) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    qlib = lib.qlib,
    Configurable = lib.Configurable,
    ChangeableListenable = lib.ChangeableListenable;

  function InMemStorage () {
    this.map = new lib.Map();
  }
  InMemStorage.prototype.destroy = function () {
    if (this.map) {
      this.map.destroy();
    }
    this.map = null;
  };
  InMemStorage.prototype.put = function (name, val) {
    this.map.replace(name, val);
    return q(val);
  }
  InMemStorage.prototype.get = function (name) {
    return q(this.map.get(name));
  };

  function EnvironmentBase (config) {
    ChangeableListenable.call(this);
    Configurable.call(this, config);
    this.jobs = new qlib.JobCollection();
    this.storages = new lib.DIContainer();
    this.dataSources = new lib.DIContainer();
    this.commands = new lib.DIContainer(); //lib.Map();
    this.state = null;
    this.error = null;
    this.operation = null;

    this.blockStorages = null;
    if (config) {
      if (lib.isString(config.blockStorages)) {
        this.blockStorages = blockStorages.split (',');
      }else{
        if (lib.isArray(config.blockStorages)){
          this.blockStorages = config.blockStorages;
        }
      }
      if (lib.isArray(config.storages)) {
        config.storages.forEach(this.createStorage.bind(this));
      }
    }
  }

  ChangeableListenable.addMethods(EnvironmentBase);
  lib.inherit(EnvironmentBase, ChangeableListenable);
  Configurable.addMethods(EnvironmentBase);
  EnvironmentBase.prototype.destroy = function () {
    this.blockStorages = null;
    this.operation = null;
    this.error = null;
    this.state = null;
    if (this.commands) {
      lib.containerDestroyAll(this.commands);
      this.commands.destroy();
    }
    this.commands = null;
    if (this.dataSources) {
      lib.containerDestroyAll(this.dataSources);
      this.dataSources.destroy();
    }
    this.dataSources = null;
    if (this.storages) {
      lib.containerDestroyAll(this.storages);
      this.storages.destroy();
    }
    this.storages = null;
    if (this.jobs) {
      this.jobs.destroy();
    }
    this.jobs = null;
    Configurable.prototype.destroy.call(this);
    ChangeableListenable.prototype.destroy.call(this);
  };

  EnvironmentBase.prototype.isStorageBlocked = function (storagename) {
    return this.blockStorages && this.blockStorages.indexOf(storagename) > -1;
  };

  EnvironmentBase.prototype.set_state = function (state) {
    if (this.state === state) {
      return false;
    }
    if (state === 'established') {
      return this.onEstablished().then(
        this.onEstablishedDone.bind(this, state)
      );
    } else {
      this.onDeEstablished();
    }
    this.state = state;
    return true;
  };
  EnvironmentBase.prototype.onEstablishedDone = function (state) {
    this.state = state;
    return q(true);
  };
  EnvironmentBase.prototype.onEstablished = function () {
    var ds = this.getConfigVal('datasources'),
      cs = this.getConfigVal('commands'),
      dcs = this.getConfigVal('datacommands'),
      promises = [];
    this.set('error', null);
    if (lib.isArray(ds)) {
      promises = promises.concat(ds.map(this.toDataSource.bind(this)));
    }
    if (lib.isArray(cs)) {
      promises = promises.concat(cs.map(this.toCommand.bind(this)));
    }
    if (lib.isArray(dcs)) {
      promises = promises.concat(dcs.map(this.toDataCommand.bind(this)));
    }
    return q.all(promises);
  };
  EnvironmentBase.prototype.addDataSources = function (dss) {
    if (!lib.isArray(dss)) {
      return q([]);
    }
    this.setConfigVal('datasources', (this.getConfigVal('datasources') || []).concat(dss), true);
    //if (this.state === 'established') {
      return q.all(dss.map(this.toDataSource.bind(this)));
    //}
    return q(true);
  };
  EnvironmentBase.prototype.addCommands = function (cs) {
    if (!lib.isArray(cs)) {
      return q([]);
    }
    this.setConfigVal('commands', (this.getConfigVal('commands') || []).concat(cs), true);
    //if (this.state === 'established') {
      return q.all(cs.map(this.toCommand.bind(this)));
    //}
    return q(true);
  };
  EnvironmentBase.prototype.addDataCommands = function (dcs) {
    if (!lib.isArray(dcs)) {
      return q([]);
    }
    this.setConfigVal('datacommands', (this.getConfigVal('datacommands') || []).concat(dcs), true);
    //if (this.state === 'established') {
      return q.all(dcs.map(this.toDataCommand.bind(this)));
    //}
    return q(true);
  };

  EnvironmentBase.prototype.isEstablished = function () { return this.state === 'established';}
  EnvironmentBase.prototype.toDataSource = function (desc) {
    var ret;
    if (!desc.name) {
      throw new lib.JSONizingError('NO_DATASOURCE_NAME', desc, 'No name:');
    }
    if (!desc.type) {
      throw new lib.JSONizingError('NO_DATASOURCE_TYPE', desc, 'No type:');
    }
    return this.dataSources.queueCreation(desc.name, this.createDataSource.bind(this, desc.type, desc.options, desc.name));
  };

  EnvironmentBase.prototype.onFailedToCreateDataSource = function (desc) {
    this.dataSources.register(desc.name, null);
    return q(null);
  };

  EnvironmentBase.prototype.onDataSourceCreated = function (desc, ds) {
    this.dataSources.register(desc.name, ds);
    return q(ds);
  };
  EnvironmentBase.prototype.toCommand = function (desc) {
    var opts, ret;
    if (!desc.name) {
      throw new lib.JSONizingError('NO_DATASOURCE_NAME', desc, 'No name:');
    }
    opts = desc.options;
    ret = this.commands.queueCreation(desc.name, this.createCommand.bind(this, opts));
    opts = null;
    return ret;
  };
  EnvironmentBase.prototype.toDataCommand = function (desc) {
    if (!desc.name) {
      throw new lib.JSONizingError('NO_COMMAND_NAME', desc, 'No name:');
    }
    return this.toDataSource({
      name: desc.name,
      type: 'commandwaiter',
      options: {data: desc.initialdata}
    }).then(
      this.onDataSourceForDataCommand.bind(this, desc)
    );
  };
  EnvironmentBase.prototype.onDataSourceForDataCommand = function (desc, waiter) {
    desc.options = desc.options || {};
    desc.options.waiter = waiter;
    return this.toCommand(desc);
  };
  function unregisterer(dss, ds, dsname) {
    dss.unregisterDestroyable(dsname);
  }
  EnvironmentBase.prototype.onDeEstablished = function () {
    var dss = this.dataSources, cmds = this.commands;
    if (dss) {
      dss.traverse(unregisterer.bind(null, dss));
    }
    if (cmds) {
      cmds.traverse(unregisterer.bind(null, cmds));
    }
    dss = null;
    cmds = null;
  };
  EnvironmentBase.prototype.getDataSourceCtor = function (name) { //throws
    return DataSourceRegistry.get(name);
  };
  EnvironmentBase.prototype.createStorage = function (storagename) {
    if (this.isStorageBlocked(storagename)) {
      ///TODO: check if this is correct ....
      return q.resolve (null);
    }
    var s = this.storages.get(storagename), d;
    if (s) {
      return q(s);
    }
    d = q.defer();
    d.promise.then(this.onStorage.bind(this, storagename), this.onNoStorage.bind(this, storagename));
    new leveldblib.LevelDBHandler({
      starteddefer:d,
      maxretries:3,
      dbname: storagename,
      dbcreationoptions: {
        valueEncoding: 'json'
      }
    });
    return this.storages.waitFor(storagename);
  };
  EnvironmentBase.prototype.onStorage = function (storagename, storage) {
    this.storages.register(storagename, storage);
    return storage;
  };
  EnvironmentBase.prototype.onNoStorage = function (storagename, reason) {
    var storage = new InMemStorage();
    this.storages.register(storagename, storage);
    return storage;
  };
  EnvironmentBase.prototype.putToStorage = function (storagename, key, value) {
    if (this.isStorageBlocked(storagename)) {
      return q.resolve(null);
    }

    return this.storages.waitFor(storagename).then(function (storage) {
      var ret = storage.put(key, value);
      key = null;
      value = null;
      return ret;
    });
  };
  EnvironmentBase.prototype.getFromStorage = function (storagename, key) {
    if (this.isStorageBlocked(storagename)){
      return q.resolve(null);
    }

    return this.storages.waitFor(storagename).then(function (storage) {
      var ret = storage.get(key);
      key = null;
      return ret;
    });
  };
  EnvironmentBase.prototype.getFromStorageSafe = function (storagename, key, deflt) {
    if (this.isStorageBlocked(storagename)) {
      return q.resolve(null);
    }

    return this.storages.waitFor(storagename).then(function (storage) {
      var ret = storage.safeGet(key, deflt);
      key = null;
      deflt = null;
      return ret;
    });
  };
  EnvironmentBase.prototype.delFromStorage = function (storagename, key) {
    if (this.isStorageBlocked(storagename)) {
      return q.resolve(null);
    }

    return this.storages.waitFor(storagename).then(function (storage) {
      var ret = storage.del(key);
      key = null;
      return ret;
    });
  };
  EnvironmentBase.prototype.DEFAULT_CONFIG = lib.dummyFunc;

  environmentRegistry.register('.', EnvironmentBase);
}

module.exports = createEnvironmentBase;

},{}],4:[function(require,module,exports){
function createCommandBase (lib) {
  'use strict';

  function CommandBase () {
  };
  CommandBase.prototype.destroy = lib.dummyFunc;
  CommandBase.prototype.execute = function (args) {
    if (!lib.isArray(args)) {
      console.warn('Supressing command execution');
      return lib.q.reject(new lib.Error('ARGUMENTS_FOR_COMMAND_EXECUTION_MUST_BE_AN_ARRAY', 'Arguments for comand execution have to be in a single Array'));
    }
    return this.doExecute(args);
  };
  CommandBase.prototype.doExecute = function (args) {
    throw new Error('CommandBase does not implement the doExecute method, descendant needs to override');
  };

  return CommandBase;
}

module.exports = createCommandBase;

},{}],5:[function(require,module,exports){
function createAllexCommandDataWaiter(execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    JSData = dataSourceRegistry.get('jsdata');

  function AllexCommandDataWaiter (options) {
    JSData.call(this, options);
  }
  lib.inherit(AllexCommandDataWaiter, JSData);
  AllexCommandDataWaiter.prototype.appendRecord = function (record) {
    if (!lib.isArray(this.data)) {
      throw new lib.Error('DATA_NOT_AN_ARRAY');
    }
    this.data.push(record);
    this.setData();
  };

  dataSourceRegistry.register('commandwaiter', AllexCommandDataWaiter);
}

module.exports = createAllexCommandDataWaiter;

},{}],6:[function(require,module,exports){
function createAllexDataPlusDataSource (execlib, dataSourceRegistry) {
  'use strict';
  var lib = execlib.lib,
    taskRegistry = execlib.execSuite.taskRegistry,
    q = lib.q,
    DataSourceBase = dataSourceRegistry.get('.'),
    BusyLogic = dataSourceRegistry.get('busylogic'),
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
    this._bl = new BusyLogic(this);
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
    this._bl.destroy();
    this._bl = null;
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
  AllexDataPlusData.prototype.IsMultiSink = 2;

  AllexDataPlusData.prototype.setTarget = function (target){
    if (!this.keys_sink) console.warn ('No keys sink');
    if (!this.values_sink) console.warn ('No values sink');
    this._bl.setTarget(target);

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
    if (this.key_indices_map) {
      this.key_indices_map.destroy();
    }
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
    this._bl.emitData();
    //this.target.set('data', this.data.slice());
  };

  AllexDataPlusData.prototype.copyData = function () {
    return this.data.slice();
  };

  dataSourceRegistry.register('allexdata+data', AllexDataPlusData);
}

module.exports = createAllexDataPlusDataSource;

},{}],7:[function(require,module,exports){
function createAllexDataPlusLevelDBDataSource(execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    taskRegistry = execlib.execSuite.taskRegistry,
    DataSourceTaskBase = dataSourceRegistry.get('taskbase'),
    BusyLogic = dataSourceRegistry.get('busylogic'),
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
  AllexDataPlusLevelDB.IsMultiSink = 2;
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

  dataSourceRegistry.register('allexdata+leveldb', AllexDataPlusLevelDB);
}

module.exports = createAllexDataPlusLevelDBDataSource;

},{}],8:[function(require,module,exports){
function createAllexDataQueryDataSource(execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    taskRegistry = execlib.execSuite.taskRegistry,
    DataSourceTaskBase = dataSourceRegistry.get('taskbase'),
    BusyLogic = dataSourceRegistry.get('busylogic'),
    cnt = 0;


  function AllexDataQuery (sink, options) {
    DataSourceTaskBase.call(this, sink, options);
    this._bl = new BusyLogic(this);
    this.data = [];
    this.cnt = cnt++;
    if (options.filter) {
      this.filter = options.filter;
    }
  }
  lib.inherit(AllexDataQuery, DataSourceTaskBase);
  AllexDataQuery.prototype.destroy = function () {
    this._bl.destroy();
    this._bl = null;
    this.cnt = null;
    this.data = null;
    DataSourceTaskBase.prototype.destroy.call(this);
  };
  AllexDataQuery.IsSingleSink = true;

  AllexDataQuery.prototype.setTarget = function (target) {
    this._bl.setTarget(target);
    DataSourceTaskBase.prototype.setTarget.call(this, target);
  };

  AllexDataQuery.prototype.start = function () {
    if (this.resetDataOnSinkLost) {
      this.data = [];
      this.fire();
    }
    return DataSourceTaskBase.prototype.start.call(this);
  };

  AllexDataQuery.prototype._doStartTask = function (sink) {
    var fire_er = this.fire.bind(this);
    //console.log('about to start task on ', this.cnt, Date.now(), this.target.get('busy'));
    this._bl.block();
    this.task = taskRegistry.run('materializeQuery', {
      sink: sink,
      data: this.data,
      onInitiated: this.onInitiated.bind(this),
      onNewRecord: fire_er,
      onDelete: fire_er,
      onUpdate: fire_er,
      continuous: true,
      filter : this.filter
    });
  };

  AllexDataQuery.prototype.fire = function () {
    this._bl.unblock();
    this._bl.emitData();
  };

  AllexDataQuery.prototype.onInitiated = function () {
    //console.log('about to report initiated task on ', this.cnt, Date.now(), this.target.get('busy'));
    this._bl.unblockAndFlush();
  };

  AllexDataQuery.prototype.copyData = function () {
    return this.data.slice();
  };

  dataSourceRegistry.register('allexdataquery', AllexDataQuery);
}

module.exports = createAllexDataQueryDataSource;

},{}],9:[function(require,module,exports){
function createAllexHash2ArrayDataSource (execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    Hash2ArrayMixin = dataSourceRegistry.get('hash2arraymixin'),
    AllexState = dataSourceRegistry.get('allexstate');

  function AllexHash2Array(sink, options) {
    AllexState.call(this, sink, options);
    Hash2ArrayMixin.call(this, options);
  }
  lib.inherit(AllexHash2Array, AllexState);
  AllexHash2Array.prototype.destroy = function () {
    Hash2ArrayMixin.prototype.destroy.call(this);
    AllexState.prototype.destroy.call(this);
  };
  Hash2ArrayMixin.addMethods(AllexHash2Array);
  AllexHash2Array.IsSingleSink = true;

  AllexHash2Array.prototype.onStateData = function (data) {
    if (!this.target) {
      console.log('no target? too bad for', data);
      return;
    }
    this.target.set('data', this.packHash2Array(data));
  };

  dataSourceRegistry.register('allexhash2array', AllexHash2Array);
}

module.exports = createAllexHash2ArrayDataSource;

},{}],10:[function(require,module,exports){
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


},{}],11:[function(require,module,exports){
function createAllexStateDataSource (execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    DataSourceBase = dataSourceRegistry.get('.');

  function AllexState (sink, options) {
    DataSourceBase.call(this, options);
    if (!sink) {
      //throw new lib.Error('NO_SINK');
      console.error ('Sink for state was not found. Sink: ', options.sink, 'path:', options.path);
      return;
    }
    if (!(options && options.path)) {
      throw new lib.Error('NO_STATE_NAME');
    }
    this.sink = sink;
    this.name = options.path;
    this.removalValue = options.removalValue;
    this.monitor = null;
  }
  lib.inherit(AllexState, DataSourceBase);
  AllexState.prototype.destroy = function () {
    if (this.monitor) {
      this.monitor.destroy();
    }
    this.monitor = null;
    this.removalValue = null;
    this.name = null;
    this.sink = null;
    DataSourceBase.prototype.destroy.call(this);
  };
  AllexState.IsSingleSink = true;
  AllexState.prototype.setTarget = function (target) {
    if (!this.sink) return;
    DataSourceBase.prototype.setTarget.call(this, target);
    var h = {};
    h[this.name] = this.onStateData.bind(this);
    this.monitor = this.sink.monitorStateForGui(h);
  };
  AllexState.prototype.onStateData = function (data) {
    //console.log('got state data', data);
    var und;
    if (!this.target) {
      return;
    }
    if (und === data) {
      if (und !== this.removalValue) {
        this.target.set('data', this.removalValue);
      } else {
        this.target.set('data', null);
      }
    } else {
      this.target.set('data', data);
    }
  };

  dataSourceRegistry.register('allexstate', AllexState);
}

module.exports = createAllexStateDataSource;

},{}],12:[function(require,module,exports){
function createDataSourceBase (execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib;

  function DataSourceBase(options) {
    this.target = null;
    this.filter = null;
  }

  DataSourceBase.prototype.destroy = function () {
    this.target = null;
    this.filter = null;
  };

  DataSourceBase.prototype.setTarget = function (target) {
    this.target = null;
    this.stop();
    if (!target) {
      return;
    }

    if (this.target && this.target != target) {
      throw new lib.Error('ALREADY_HAVE_TARGET', 'Already have a target');
    }
    this.target = target;
    this.start();
  };

  DataSourceBase.prototype.start = lib.dummyFunc;
  DataSourceBase.prototype.stop = lib.dummyFunc;


  DataSourceBase.prototype.setFilter = function (filter) {
    this.filter = filter;
  };

  dataSourceRegistry.register('.', DataSourceBase);
}

module.exports = createDataSourceBase;

},{}],13:[function(require,module,exports){
function createBusyLogicCreator (execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    _initialperiod = 10;

  function BusyLogic (datasource, trigger_changed_instead_set) {
    this.target = null;
    this.blocked = false;
    this.datasource = datasource;
    this._timer = null;
    this._period = _initialperiod;
    this._newrecords = 0;
    this._timeouttimestamp = 0;
    this._trigger_changed_instead_set = trigger_changed_instead_set;
  }

  BusyLogic.prototype.destroy = function () {
    this._trigger_changed_instead_set = null;
    this.blocked = false;
    if (this._timer) {
      lib.clearTimeout (this._timer);
    }
    this._timer = null;
    this.target = null;
    this.datasource = null;
  };

  BusyLogic.prototype.setTarget = function (target) {
    if (this._timer) {
      lib.clearTimeout(this._timer);
    }
    this.target = target;
    if (this.target) this.emitData();
  };

  BusyLogic.prototype.emitData = function () {
    if (this.blocked) return;
    if (!this._period) return;
    if (!this.target) throw new Error('No target and you want to emit data');
    //console.log('will emit busy true on', this.datasource.cnt, Date.now(), this.datasource.data.length);
    //this.target.set('busy', false);
    this._newrecords++;
    if (!this._timer) {
      this.createTimer();
    }
    //console.log(Date.now());
  };

  BusyLogic.prototype.createTimer = function () {
    this._period *= 2;
    if (this._period > lib.intervals.Second) {
      this.flush();
    }
    this._newrecords = 0;
    this._timer = lib.runNext (this._timerProc.bind(this), this._period);
  };

  BusyLogic.prototype._timerProc = function () {
    this._timer = null;
    if (this.blocked) return;
    if (!this._newrecords) {
      this.flush();
    } else {
      this.createTimer();
    }
  };

  BusyLogic.prototype.flush = function () {
    var ds = this.datasource.copyData();
    this._period = _initialperiod;
    if (!this._trigger_changed_instead_set || this.target.get('data') !== ds){
      this.target.set('data', ds);
    }else{
      this.target.changed.fire ('data', ds);
    }
    //console.log('will emit busy false on', this.datasource.cnt, Date.now(), ds.length);
    this.target.set('busy', false);
  };

  BusyLogic.prototype.block = function () {
    //console.log('about to block datasource emit', this.datasource.cnt);
    this.blocked = true;
    this.target.set('busy', true);
  };

  BusyLogic.prototype.unblock = function () {
    this.blocked = false;
  };

  BusyLogic.prototype.unblockAndFlush = function () {
    this.unblock();
    this.emitData();
  };

  dataSourceRegistry.register('busylogic', BusyLogic);
}

module.exports = createBusyLogicCreator;

},{}],14:[function(require,module,exports){
function createHash2ArrayMixin (execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib;


  function Hash2ArrayMixin (options) {
    this.columnnames = options.columnnames;
  }
  Hash2ArrayMixin.prototype.destroy = function () {
    this.columnnames = null;
  };
  Hash2ArrayMixin.prototype.packHash2Array = function (hash) {
    var ret = [], _r = ret;
    lib.traverseShallow(hash, packer.bind(null, this.columnnames, _r));
    _r = null;
    return ret;
  };
  Hash2ArrayMixin.addMethods = function (klass) {
    lib.inheritMethods(klass, Hash2ArrayMixin
      ,'packHash2Array'
    );
  };

  function packer (colnames, arry, thingy, pk) {
    var record = [pk];
    if (lib.isArray(colnames) && colnames.length) {
      colnames.reduce(recordpacker.bind(null, thingy), record);
    } else {
      record.push(thingy);
    }
    arry.push(record);
  }
  function recordpacker (obj, result, itemname) {
    if (obj && obj.hasOwnProperty && obj.hasOwnProperty(itemname)) {
      result.push(obj[itemname]);
    }
    return result;
  }

  dataSourceRegistry.register('hash2arraymixin', Hash2ArrayMixin);
}

module.exports = createHash2ArrayMixin;

},{}],15:[function(require,module,exports){
function createDataSourceRegistry (execlib, DataSourceRegistry) {
  'use strict';
  var ret = new DataSourceRegistry();
  require('./busylogic')(execlib, ret);
  require('./hash2arraymixincreator')(execlib, ret);
  require('./basecreator')(execlib, ret);
  require('./localhash2arraycreator')(execlib, ret);
  require('./jsdatacreator')(execlib, ret);
  require('./allexcommanddatawaitercreator')(execlib, ret);
  require('./sinkbasecreator')(execlib, ret);
  require('./taskbasecreator')(execlib, ret);
  require('./allexstatecreator')(execlib, ret);
  require('./allexhash2arraycreator')(execlib, ret);
  require('./allexdataquerycreator')(execlib, ret);
  require('./allexdataplusleveldbcreator')(execlib, ret);
  require('./allexleveldbcreator')(execlib, ret);
  require('./allexdataplusdatacreator.js')(execlib, ret);

  return ret;
}

module.exports = createDataSourceRegistry;

},{"./allexcommanddatawaitercreator":5,"./allexdataplusdatacreator.js":6,"./allexdataplusleveldbcreator":7,"./allexdataquerycreator":8,"./allexhash2arraycreator":9,"./allexleveldbcreator":10,"./allexstatecreator":11,"./basecreator":12,"./busylogic":13,"./hash2arraymixincreator":14,"./jsdatacreator":16,"./localhash2arraycreator":17,"./sinkbasecreator":19,"./taskbasecreator":20}],16:[function(require,module,exports){
function createJSDataDataSource(execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    qlib = lib.qlib,
    DataSourceBase = dataSourceRegistry.get('.'),
    BusyLogic = dataSourceRegistry.get('busylogic'),
    jobs = require('./persistablejobs')(lib);

  function JSData (options) {
    DataSourceBase.call(this, options);
    this._bl = new BusyLogic(this);
    this.persist = options.persist;
    this.data = null; //options ? options.data : null;
    this.envStorage = options ? options.env_storage : null;
    this.jobs = new qlib.JobCollection();
    this._fetchInitialData(options ? options.data : null);
  }
  lib.inherit (JSData, DataSourceBase);
  JSData.prototype.destroy = function () {
    if (this.jobs) {
      this.jobs.destroy();
    }
    this.jobs = null;
    this.envStorage = null;
    this.data = null;
    this.persist = null;
    if (this._bl) {
      this._bl.destroy();
    }
    this._bl = null;
    DataSourceBase.prototype.destroy.call(this);
  };

  JSData.prototype.setTarget = function (target) {
    DataSourceBase.prototype.setTarget.call(this, target);
    this._bl.setTarget(target);
    this.setData();
  };

  JSData.prototype.setData = function (data) {
    if (this.data === data) {
      return;
    }
    this.jobs.run('.', new jobs.SetDataJob(this, data));
  };

  JSData.prototype.copyData = function () {
    if (lib.isArray(this.data)) {
      return this.data.slice();
    }

    if (this.data instanceof Object){
      return lib.extend(lib.isArray(this.data) ? [] : {}, this.data);
    }

    return this.data;
  };

  JSData.prototype.processFetchedData = function (data) {
    return data;
  };

  JSData.prototype._fetchInitialData = function (dflt) {
    return this.jobs.run('.', new jobs.FetchInitialDataJob(this, dflt));
  };


  dataSourceRegistry.register('jsdata', JSData);
}

module.exports = createJSDataDataSource;

},{"./persistablejobs":18}],17:[function(require,module,exports){
function createLocalHash2Array (execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    Hash2ArrayMixin = dataSourceRegistry.get('hash2arraymixin'),
    DataSourceBase = dataSourceRegistry.get('.'),
    BusyLogic = dataSourceRegistry.get('busylogic');

  function LocalHash2Array (options) {
    DataSourceBase.call(this, options);
    Hash2ArrayMixin.call(this, options);
    this._bl = new BusyLogic(this);
    this.data = this.packHash2Array(options ? options.data : {});
  }
  lib.inherit(LocalHash2Array, DataSourceBase);
  Hash2ArrayMixin.addMethods(LocalHash2Array);
  LocalHash2Array.prototype.destroy = function () {
    if (this._bl) {
      this._bl.destroy();
    }
    this._bl = null;
    this.data = null;
    Hash2ArrayMixin.prototype.destroy.call(this);
    DataSourceBase.prototype.destroy.call(this);
  };
  LocalHash2Array.prototype.setTarget = function (target) {
    DataSourceBase.prototype.setTarget.call(this, target);
    this._bl.setTarget(target);
    this.setData();
  };

  LocalHash2Array.prototype.setData = function (data) {
    if (arguments.length) {
      this.data = this.packHash2Array(data);
    }
    if (!this.target) {
      return;
    }
    this._bl.emitData();
  };
  LocalHash2Array.prototype.copyData = function () {
    if (lib.isArray(this.data)) {
      return this.data.slice();
    }

    if (this.data) {
      throw new Error('data of an instance of '+this.constructor.name+' has to be an array');
    }

    return this.data;
  };

  dataSourceRegistry.register('localhash2array', LocalHash2Array);
}

module.exports = createLocalHash2Array;

},{}],18:[function(require,module,exports){
function createPersistableJobs (lib) {
  'use strict';

  var mylib = {};
  var q = lib.q,
    qlib = lib.qlib,
    JobOnDestroyableBase = qlib.JobOnDestroyableBase;

  function JobOnPersistable (persistable, defer) {
    JobOnDestroyableBase.call(this, persistable, defer);
  }
  lib.inherit(JobOnPersistable, JobOnDestroyableBase);
  JobOnPersistable.prototype._destroyableOk = function () {
    if (!this.destroyable) {
      return false;
    }
    if (!this.destroyable._bl) {
      return false;
    }
    return true;
  };

  function FetchInitialDataJob (persistable, deflt, defer) {
    JobOnPersistable.call(this, persistable, defer);
    this.deflt = deflt;
  }
  lib.inherit(FetchInitialDataJob, JobOnPersistable);
  FetchInitialDataJob.prototype.destroy = function () {
    this.deflt = null;
    JobOnPersistable.prototype.destroy.call(this);
  };
  FetchInitialDataJob.prototype.go = function () {
    var ok = this.okToGo();
    if (!ok.ok) {
      return ok.val;
    }
    this.fetchResult().then(
      this.onFetchResult.bind(this),
      this.reject.bind(this)
    );
    return ok.val;
  };
  FetchInitialDataJob.prototype.onFetchResult = function (res) {
    if (!this.okToProceed()) {
      return;
    }
    qlib.thenAny(this.destroyable.processFetchedData(res),
      this.onFetchedDataProcessed.bind(this),
      this.reject.bind(this)
    );
  };
  FetchInitialDataJob.prototype.onFetchedDataProcessed = function (data) {
    if (!this.okToProceed()) {
      return;
    }
    qlib.promise2defer(
      (new mylib.SetDataJob(this.destroyable, data)).go(),
      this
    );
  };
  FetchInitialDataJob.prototype.fetchResult = function () {
    if (!this.destroyable.persist) {
      return q(this.deflt);
    }
    if (!this.destroyable.envStorage) {
      return q(this.deflt);
    }
    if (!lib.isFunction(this.destroyable.envStorage.get)) {
      return q(this.deflt);
    }
    return this.destroyable.envStorage.get(this.deflt);
  };

  mylib.FetchInitialDataJob = FetchInitialDataJob;


  function SetDataJob (persistable, data, defer) {
    JobOnPersistable.call(this, persistable, defer);
    this.data = data;
  }
  lib.inherit(SetDataJob, JobOnPersistable);
  SetDataJob.prototype.destroy = function () {
    this.data = null;
    JobOnPersistable.prototype.destroy.call(this);
  };
  SetDataJob.prototype.go = function () {
    var ok = this.okToGo();
    if (!ok.ok) {
      return ok.val;
    }
    if (lib.isUndef(this.data)) {
      if (this.destroyable.target) {
        this.destroyable._bl.emitData();
      }
      lib.runNext(this.resolve.bind(this, this.data));
      return ok.val;
    }
    this.maybePersistData().then(
      this.setDataAfterMaybePersist.bind(this),
      this.reject.bind(this)
    );
    return ok.val;
  };
  SetDataJob.prototype.maybePersistData = function () {
    if (!this.destroyable.persist) {
      return q(this.data);
    }
    if (!this.destroyable.envStorage) {
      return q(this.data);
    }
    if (!lib.isFunction(this.destroyable.envStorage.put)) {
      return q(this.data);
    }
    return this.destroyable.envStorage.put(this.data).then(
      qlib.returner(this.data)
    );
  };

  SetDataJob.prototype.setDataAfterMaybePersist = function (data) {
    if (!this.okToProceed()) {
      return;
    }
    this.destroyable.data = data;
    if (this.destroyable.target) {
      this.destroyable._bl.emitData();
    }
    this.resolve(this.data);
  };

  mylib.SetDataJob = SetDataJob;

  return mylib;
}
module.exports = createPersistableJobs;

},{}],19:[function(require,module,exports){
function createDataSourceSinkBase (execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    DataSourceBase = dataSourceRegistry.get('.'),
    cnt = 0;

  function DataSourceSinkBase (sink, options){
    DataSourceBase.call(this, options);
    this.cnt = cnt++;
    this.sink = sink;
    this.resetDataOnSinkLost = options.resetdataonsinklost;
    this._starting = null;
    this._should_stop = null;
    this._sink_instance = null;
    this._sink_destroyed_listener = null;
  }
  lib.inherit(DataSourceSinkBase, DataSourceBase);

  DataSourceSinkBase.prototype.destroy = function () {
    this.stop();
    this.resetDataOnSinkLost = null;
    this.sink = null;
    this._should_stop = null;
    this._starting = null;
    DataSourceBase.prototype.destroy.call(this);
  };

  DataSourceSinkBase.prototype.setTarget = function (target) {
    if (!this.sink) return;
    DataSourceBase.prototype.setTarget.call(this, target);

    if (target) {
      this.start();
    }else{
      this.stop();
    }
  };

  DataSourceSinkBase.prototype.stop = function () {
    this._starting = null;
    if (this._sink_destroyed_listener) this._sink_destroyed_listener.destroy();
    this._sink_destroyed_listener = null;
    this._sink_instance = null;
  };

  DataSourceSinkBase.prototype.start = function () {
    this._should_stop = false;
    if (this._starting) return this._starting;
    if (!this.sink) return;

    if (this._sink_instance) {
      this._starting = this.onGotSink(this._sink_instance);
      this._starting.done(this._started.bind(this));
      return this._starting;
    }

    this._starting = this.sink.waitForSink().then(this.onGotSink.bind(this));
    this._starting.done (this._started.bind(this));
    return this._starting;
  };

  DataSourceSinkBase.prototype._started = function () {
    this._starting = null;
  };

  DataSourceSinkBase.prototype._onSinkDestroyed = function () {
    if (this._sink_destroyed_listener) {
      this._sink_destroyed_listener.destroy();
    }
    this._sink_destroyed_listener = null;
    this._sink_instance = null;

    if (this._should_stop) return;
    //go and search for sink again ...
    this.start();
  };

  DataSourceSinkBase.prototype.onGotSink = function (sink){
    if (this._should_stop) return q.resolve(true);
    if (!sink.destroyed) return q.resolve(false);

    this._sink_instance = sink;
    this._sink_destroyed_listener = sink.destroyed.attach(this._onSinkDestroyed.bind(this));

    return this._doGoWithSink(sink);
  };

  DataSourceSinkBase.prototype.setFilter = function (filter) {
    this.stop();
    DataSourceBase.prototype.setFilter.call(this, filter);
    if (!this._should_stop) this.start();
  };

  dataSourceRegistry.register('sinkbase', DataSourceSinkBase);
}

module.exports = createDataSourceSinkBase;


},{}],20:[function(require,module,exports){
function createDataSourceTaskBase (execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    DataSourceSinkBase = dataSourceRegistry.get('sinkbase');

  function DataSourceTaskBase (tasksink, options){
    DataSourceSinkBase.call(this, tasksink, options);
    this.task = null;
    this._destroyed_listener = null;
  }
  lib.inherit(DataSourceTaskBase, DataSourceSinkBase);

  DataSourceTaskBase.prototype.destroy = function () {
    if (this._destroyed_listener) this._destroyed_listener.destroy();
    this._destroyed_listener = null;
    DataSourceSinkBase.prototype.destroy.call(this);
  };

  DataSourceTaskBase.prototype.stop = function () {
    var _ss = this._should_stop;
    if (this.task) {
      this._should_stop = true;
      this.task.destroy();
      this._should_stop = _ss;
    }
    this.task = null;
    DataSourceSinkBase.prototype.stop.call(this);
  };

  DataSourceTaskBase.prototype._doGoWithSink = function (sink) {
    if (!sink) {
      console.warn ('No sink in _doGoWithSink');
      return;
    }
    if (this.task) {
      //console.log('we have already set the filter in task ...');
      return q.reject (new Error('Already have a task'));
    }
    this._doStartTask(sink);
    if (this.task) {
      this._destroyed_listener = this.task.destroyed.attach (this._restart.bind(this));
    }
    return q.resolve('ok');
  };

  DataSourceTaskBase.prototype._restart = function () {
    ///to monitor sink up/down situations ...
    if (this._destroyed_listener) this._destroyed_listener.destroy();
    this._destroyed_listener = null;

    this.task = null;
    if (this._should_stop) return;
    this.start();
  };

  DataSourceTaskBase.prototype.setFilter = function (filter) {
    if (!filter) {
      this.stop();
      if (this.target) {
        this.target.set('data', null);
      }
      return;
    }
    return this.task ? this._doSetFilterWithTask(filter) : this._doSetFilterWithoutTask(filter);
  };


  DataSourceTaskBase.prototype._doSetFilterWithTask = function (filter){
    //console.log('will do set filter with task', filter);
    var sink = this.task.sink;
    if (this._destroyed_listener) this._destroyed_listener.destroy();
    this.task.destroy();
    this.task = null;

    this.filter = filter;
    this._doGoWithSink(sink);
    sink = null;
  };

  DataSourceTaskBase.prototype._doSetFilterWithoutTask = function (filter) {
    return DataSourceSinkBase.prototype.setFilter.call(this, filter);
  };

  dataSourceRegistry.register('taskbase', DataSourceTaskBase);
}

module.exports = createDataSourceTaskBase;


},{}],21:[function(require,module,exports){
(function (global){(function (){
function createEnvironmentFactory (execlib, leveldblib, UserRepresentation) {
  'use strict';
  var lib = execlib.lib,
    CommandBase = require('./commandbasecreator')(lib),
    registries = require('./registrycreator')(lib),
    DataSourceRegistry = registries.DataSourceRegistry,
    EnvironmentRegistry = registries.EnvironmentRegistry,
    dataSourceRegistry = require('./datasources')(execlib, DataSourceRegistry),
    environmentRegistry = new EnvironmentRegistry();

  
  require('./basecreator')(execlib, leveldblib, dataSourceRegistry, environmentRegistry),
  require('./allexcreator')(execlib, environmentRegistry, CommandBase),
  require('./remote')(execlib, environmentRegistry, UserRepresentation, CommandBase);


  function createFromConstructor (ctor, options) {
    if (lib.isFunction (ctor)) return new ctor (options);
    var _glob = 'undefined' === typeof(global) ? window : global,
      c = _glob[ctor];
    if (!lib.isFunction (c)) throw new Error ('Custom environment ctor '+ctor+' is not a function in a global namespace');
    var ret = new c(options);

    if (!(ret instanceof EnvironmentBase)) throw new Error('Creating an environment which is not instance of EnvironmentBase is not allowed');

    return ret;
  }

  function environmentFactory (desc) {
    /*
    switch (desc.type) {
      case 'allexremote' : return new AllexRemoteEnvironment (desc.options);
      case 'fromctor' : return createFromConstructor(desc.options.ctor, desc.options.options);
      default : throw new Error('Environment type '+desc.type+' not supported');
    }
    */
    if (desc.type === 'fromctor') {
      return createFromConstructor(desc.options.ctor, desc.options.options);
    }

    return new (environmentRegistry.get(desc.type))(desc.options);
  }
  environmentFactory.dataSourceRegistry = dataSourceRegistry;
  environmentFactory.environmentRegistry = environmentRegistry;
  environmentFactory.CommandBase = CommandBase;

  return environmentFactory;
}

module.exports = createEnvironmentFactory;

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./allexcreator":2,"./basecreator":3,"./commandbasecreator":4,"./datasources":15,"./registrycreator":22,"./remote":23}],22:[function(require,module,exports){
function createRegistries (lib) {
  'use strict';

  var Map = lib.Map;

  function RegistryBase () {
    Map.call(this);
  }
  lib.inherit(RegistryBase, Map);
  RegistryBase.prototype.get = function (name) {
    var ret = Map.prototype.get.call(this, name);
    if (!lib.isFunction(ret)) {
      throw new Error(this.TypeName+' '+name+' is not registered');
    }
    return ret;
  };
  RegistryBase.prototype.register = function (name, ctor) {
    var typecheck, check;
    if (!lib.isFunction(ctor)) {
      throw new Error ('Cannot register a constructor under '+name+' if it is not a function');
    }
    try { check = this.get(name); } catch(ignore) {}
    if (check) {
      console.error(name, 'is already registered', check);
      throw new Error(this.TypeName+' '+name+' is already registered');
    }
    this.add(name, ctor);
  };

  function DataSourceRegistry () {
    RegistryBase.call(this);
  }
  lib.inherit(DataSourceRegistry, RegistryBase);
  DataSourceRegistry.prototype.TypeName = 'DataSource';

  function EnvironmentRegistry () {
    RegistryBase.call(this);
  }
  lib.inherit(EnvironmentRegistry, RegistryBase);
  EnvironmentRegistry.prototype.TypeName = 'Environment';

  return {
    DataSourceRegistry: DataSourceRegistry,
    EnvironmentRegistry: EnvironmentRegistry
  };
}

module.exports = createRegistries;

},{}],23:[function(require,module,exports){
function protocolSecurer (protocol) {
    if ('undefined' !== typeof window && window.location && window.location.protocol && window.location.protocol.indexOf('https') >=0) {
      return protocol+'s';
    }
    return protocol;
}

function createAllexRemoteEnvironment (execlib, environmentRegistry, UserRepresentation, CommandBase) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    qlib = lib.qlib,
    remoteStorageName = 'remoteenvironmentstorage',
    letMeInHeartBeat = lib.intervals.Second,
    AllexEnvironment = environmentRegistry.get('allexbase'),
    mixins = require('./remotemixins')(lib),
    HotelAndApartmentHandlerMixin = mixins.HotelAndApartmentHandlerMixin,
    jobs = require('./remotejobs')(execlib, mixins);

  function AllexRemoteCommand (representation, options) {
    CommandBase.call(this);
    this.representation = null;
    this.methodname = options.name;
    this.setRepresentation(representation, options.sink);
  }
  lib.inherit(AllexRemoteCommand, CommandBase);
  AllexRemoteCommand.prototype.destroy = function () {
    this.methodname = null;
    this.methodname = null;
  };
  AllexRemoteCommand.prototype.setRepresentation = function (representation, sinkname) {
    if (sinkname === '.') {
      this.representation = representation;
      return;
    }
    this.representation = representation.subsinks[sinkname];
  };
  AllexRemoteCommand.prototype.doExecute = function (args) {
    args.unshift(this.methodname);
    return this.representation.waitForSink().then(
      this.onSink.bind(this, args)
    );
  };
  AllexRemoteCommand.prototype.onSink = function (args, sink) {
    console.log('calling', arguments);
    return sink.call.apply(sink, args);
  };

  function AllexRemoteDataCommand (representation, options) {
    AllexRemoteCommand.call(this, representation, options);
    this.waiter = options.waiter;
    this.resetoncall = options.resetoncall;
    //this.waiter.setData([]);
  }
  lib.inherit(AllexRemoteDataCommand, AllexRemoteCommand);
  AllexRemoteDataCommand.prototype.destroy = function () {
    this.resetoncall = null;
    this.waiter = null;
    AllexRemoteCommand.prototype.destroy.call(this);
  };
  AllexRemoteDataCommand.prototype.doExecute = function (args) {
    if (lib.defined(this.resetoncall)) {
      if (this.waiter) {
        this.waiter.setData(this.resetoncall);
      }
    }
    return AllexRemoteCommand.prototype.doExecute.call(this, args);
  };

  function AllexAggregateDataCommand (representation, options) {
    AllexRemoteDataCommand.call(this, representation, options);
    this._current = null;
  }
  lib.inherit (AllexAggregateDataCommand, AllexRemoteDataCommand);
  AllexAggregateDataCommand.prototype.destroy = function () {
    this._current = null;
    AllexRemoteDataCommand.prototype.destroy.call(this);
  };
  
  AllexAggregateDataCommand.prototype.onSink = function (args, sink) {
    var promise = AllexRemoteDataCommand.prototype.onSink.call(this, args, sink);
    promise.done (null, null, this._onProgress.bind(this));
    return promise;
  };

  AllexAggregateDataCommand.prototype._onProgress = function (data) {
    switch (data[0]) {
      case 'rb' : {
        this._processBegin(data[1]);
        break;
      }
      case 'r1' : {
        this._processRecord(data[1], data[2]);
        break;
      }
      case 're' : {
        this._processEnd (data[1]);
      }
    }
  };

  AllexAggregateDataCommand.prototype._processBegin = function (session) {
    if (this._current) return;
    this._current = session;
    this.waiter.setData([]);
  };

  AllexAggregateDataCommand.prototype._processRecord = function (session, record) {
    if (this._current !== session) return;
    var data = this.waiter.data.slice();
    data.push (record);
    this.waiter.setData(data);
  };

  AllexAggregateDataCommand.prototype._processEnd = function (session) {
    if (this._current !== session) return;
    this._current = null;
  };

  function AllexLevelDBStreamerCommand (representation, options) {
    AllexRemoteDataCommand.call(this, representation, options);
    this.primarykey = options.primarykey;
    this.fieldnames = options.fieldnames;
    this.pagesize = options.pagesize || 10;
  };
  lib.inherit(AllexLevelDBStreamerCommand, AllexRemoteDataCommand);
  AllexLevelDBStreamerCommand.prototype.destroy = function () {
    this.pagesize = null;
    this.fieldnames = null;
    this.primarykey = null;
    AllexRemoteDataCommand.prototype.destroy.call(this);
  };
  function resolver(d) {
    d.resolve(true);
  }
  AllexLevelDBStreamerCommand.prototype.onSink = function (args, sink) {
    this.waiter.setData([]);
    var options = {pagesize: this.pagesize};

    if (args[1]) {
      options = lib.extend (options, args[1]);
    }
    return execlib.execSuite.libRegistry.get('allex_leveldblib').streamInSink(
      sink,
      this.methodname,
      options,
      this.onLevelDBData.bind(this),
      resolver
    );
  };
  AllexLevelDBStreamerCommand.prototype.onLevelDBData = function (kv) {
    var ret, _ret;
    if (!kv) {
      return;
    }
    if (!this.waiter) {
      return;
    }
    ret  = {};
    if (this.primarykey){
      ret[this.primarykey] = kv.key;
    }

    if (!kv.value) {
      this.waiter.appendRecord(ret);
      return;
    }
    if (lib.isArray(this.fieldnames)) {
      _ret = ret;
      this.fieldnames.forEach(function (name, index) {
        _ret[name] = kv.value[index];
      });
      _ret = null;
    }
    kv = null;
    this.waiter.appendRecord(ret);
  };

  function AllexDataResolvingDataCommand (representation, options) {
    AllexRemoteDataCommand.call(this, representation, options);
  }
  lib.inherit(AllexDataResolvingDataCommand, AllexRemoteDataCommand);
  AllexDataResolvingDataCommand.prototype.onSink = function (args, sink) {
    var promise = AllexRemoteDataCommand.prototype.onSink.call(this, args, sink);
    promise.done(this.onResolved.bind(this), this.onFailed.bind(this));
    return promise;
  };
  AllexDataResolvingDataCommand.prototype.onResolved = function (data) {
    this.waiter.setData(data);
  };
  AllexDataResolvingDataCommand.prototype.onFailed = function (reason) {
    console.error(this.methodname, 'encountered an error', reason);
  };

  function AllexRemoteEnvironment (options) {
    if (options && options.doNotStoreSession){
      if (!options) {
        options = {};
      }
      if (!options.blockStorages) options.blockStorages = [];
      lib.arryOperations.appendNonExistingItems (options.blockStorages, [remoteStorageName]);
    }
    AllexEnvironment.call(this, options);
    HotelAndApartmentHandlerMixin.call(this);
    if (!options.entrypoint) {
      throw new lib.JSONizingError('NO_ENTRYPOINT_DESC', options, 'No entrypoint descriptor:');
    }
    this.address = options.entrypoint.address;
    this.port = options.entrypoint.port;
    this.userRepresentation = new UserRepresentation();
    this.sessionid = null;
    this.secondphasesessionid = null;
    this.jobs = new qlib.JobCollection();
    this.checkForSessionId();
    this.createStorage(remoteStorageName);
  }
  lib.inherit(AllexRemoteEnvironment, AllexEnvironment);
  HotelAndApartmentHandlerMixin.addMethods(AllexRemoteEnvironment);
  AllexRemoteEnvironment.prototype.destroy = function () {
    if (this.jobs) {
      this.jobs.destroy();
    }
    this.jobs = null;
    this.secondphasesessionid = null;
    this.sessionid = null;
    if (this.userRepresentation) {
      this.userRepresentation.destroy();
    }
    this.userRepresentation = null;
    this.port = null;
    this.address = null;
    HotelAndApartmentHandlerMixin.prototype.purgeBothListenersAndSinks();
    HotelAndApartmentHandlerMixin.prototype.destroy.call(this);
    AllexEnvironment.prototype.destroy.call(this);
  };
  AllexRemoteEnvironment.prototype.setApartmentSink = function (sink) {
    this.set('state', 'pending');
    this.userRepresentation.setSink(sink);
    HotelAndApartmentHandlerMixin.prototype.setApartmentSink.call(this, sink);
    this.set('state', 'established');
  };
  AllexRemoteEnvironment.prototype.onApartmentSinkDestroyed = function () {
    HotelAndApartmentHandlerMixin.prototype.onApartmentSinkDestroyed.call(this);
    this.checkForSessionId();
  };
  AllexRemoteEnvironment.prototype.checkForSessionId = function () {
    return this.jobs.run('.', new jobs.CheckSessionJob(this, remoteStorageName)).then(
      this.loginWithSession.bind(this)
    );
  };
  AllexRemoteEnvironment.prototype.loginWithSession = function (sessionid) {
    return this.login({__sessions__id: sessionid.sessionid}, null, 'letMeInWithSession');
  };

  function webMethodResolver(defer,res){
    if (res.status === 200){
      if (!!res.response){
        defer.resolve(JSON.parse(res.response));
      }else{
        defer.resolve('NO_RESPONSE');
      }
    }else{
      defer.reject(new lib.Error('CALL_WEB_METHOD_ERROR'));
    }
  }
  AllexRemoteEnvironment.prototype._callWebMethod = function (methodname, datahash) {
    var d = q.defer();
    lib.request(protocolSecurer('http')+'://'+this.address+':'+this.port+'/'+methodname, {
      parameters: datahash,
      onComplete: webMethodResolver.bind(null,d),
      onError: d.reject.bind(d)
    });
    return d.promise;
  };
  AllexRemoteEnvironment.prototype.register = function (datahash) {
    return this.login(datahash, null, 'register');
  };
  AllexRemoteEnvironment.prototype.usernameExists = function (datahash) {
    //datahash <=> {username: 'micatatic'}
    return this._callWebMethod('usernameExists', datahash);
  };
  AllexRemoteEnvironment.prototype.login = function (credentials, defer, entrypointmethod) {
    return this.jobs.run('.', new jobs.LoginJob(this, remoteStorageName, protocolSecurer, letMeInHeartBeat, credentials, entrypointmethod, defer));
  };
  AllexRemoteEnvironment.prototype.findSink = function (sinkname) {
    if (!this.userRepresentation) {
      return q.reject(new lib.Error('ALREADY_DESTROYED', 'This instance of '+this.constructor.name+' is already destroyed'));
    }
    if (sinkname === '.') {
      return q(this.userRepresentation);
    }
    return q(this.userRepresentation.subsinks[sinkname]);
  };
  AllexRemoteEnvironment.prototype.createCommand = function (options) {
    var baseret, ctor;
    try {
      return AllexEnvironment.prototype.createCommand.call(this, options);
    } catch (ignore) {}
    if (!options) {
      throw Error ('no options');
    }
    if (!options.sink) {
      throw Error ('no sink in options');
    }
    if (!options.name) {
      throw new lib.JSONizingError ('NO_NAME_IN_OPTIONS', options, 'No name:');
    }
    ctor = this.chooseCommandCtor(options.type);
    return new ctor(this.userRepresentation, options);
  };
  AllexRemoteEnvironment.prototype.chooseCommandCtor = function (type) {
    switch (type) {
      case 'aggregation' : 
        return AllexAggregateDataCommand;
      case 'leveldbstreamer':
        return AllexLevelDBStreamerCommand;
      case 'dataresolving':
        return AllexDataResolvingDataCommand;
      default:
        return AllexRemoteCommand;
    }
  };

  AllexRemoteEnvironment.prototype.giveUp = function (credentials, defer) {
    this.pendingRequest = 0;
    this.loginData = null;
    this.secondphasesessionid = null;
    this.set('state', 'loggedout');
    this.delFromStorage(remoteStorageName, 'sessionid').then (
      defer.reject.bind(defer, new lib.JSONizingError('INVALID_LOGIN', credentials, 'Invalid'))
    );
  };
  AllexRemoteEnvironment.prototype.logout = function () {
    if (!this.sessionid) return;

    console.log('will logout');
    this.set('state', 'pending');
    this.purgeHotelSinkDestroyedListener();
    this.purgeApartmentSinkDestroyedListener();
    this.sendLetMeOutRequest({__sessions__id: this.sessionid}).done (this.onLoggedOut.bind(this));
  };

  AllexRemoteEnvironment.prototype.sendLetMeOutRequest = function (credentials, d) {
    d = d || q.defer();
    lib.request(protocolSecurer('http')+'://'+this.address+':'+this.port+'/letMeOut', {
      parameters: credentials,
      onComplete: this.onLetMeOutResponse.bind(this, credentials, d),
      onError: this.onLetMeOutRequestFail.bind(this, credentials, d)
    });
    credentials = null;
    return d.promise;
  };

  AllexRemoteEnvironment.prototype.onLetMeOutResponse = function (credentials, defer, response) {
    var set = this.set.bind(this);
    console.log('onLetMeOutResponse', response);
    if (response && response.response && response.response === 'ok' ) {
      this.sessionid = null;
      this.delFromStorage(remoteStorageName, 'sessionid').then (
        function () {
          set('state', 'loggedout');
          defer.resolve(true);
          set = null;
          defer = null;
        },
        function () {
          set('state', 'loggedout');
          defer.resolve(true);
          set = null;
          defer = null;
          //because what else?
        }
      );
    }
    defer.resolve(true);
  };


  AllexRemoteEnvironment.prototype.onLetMeOutRequestFail = function (credentials, defer, reason) {
    this.set('error', reason);
    lib.runNext(this.sendLetMeOutRequest.bind(this, credentials, defer), lib.intervals.Second);
  };
  function nosecondphaser () {
    return new lib.Error('NO_SECONDPHASE_IN_PROCESS', 'No second phase is in process, cannot send second phase token');
  }
  AllexRemoteEnvironment.prototype.sendSecondPhaseToken = function (token) {
    var d, d2, ret;
    if (!this.secondphasesessionid) {
      d = q.defer();
      this.giveUp({}, d);
      return d.promise.then(null, nosecondphaser);
    }
    if (!token) {
      //cancel 2 phase
      d = q.defer();
      d2 = q.defer();
      ret = d2.promise;
      this.giveUp({}, d);
      d.promise.then(null, d2.resolve.bind(d2, true));
      return ret;
    }
    return this.login({__sessions__id: this.secondphasesessionid, secondphasetoken: token}, null, 'letMeInWithSession');
  };

  AllexRemoteEnvironment.prototype.onLoggedOut = function () {
    HotelAndApartmentHandlerMixin.prototype.destroy.call(this);
    this.set('state', 'loggedout');
  };
  AllexRemoteEnvironment.prototype.type = 'allexremote';



  environmentRegistry.register('allexremote', AllexRemoteEnvironment);

}

module.exports = createAllexRemoteEnvironment;

},{"./remotejobs":27,"./remotemixins":32}],24:[function(require,module,exports){
function createAcquireSinkOnHotelJob (execlib, mylib) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    qlib = lib.qlib,
    JobOnEnvironment = mylib.JobOnEnvironment;

  function AcquireSinkOnHotelJob (env, protocolsecurer, params, defer) {
    JobOnEnvironment.call(this, env, defer);
    this.protocolsecurer = protocolsecurer;
    this.params = params;
    this.task = null;
  }
  lib.inherit(AcquireSinkOnHotelJob, JobOnEnvironment);
  AcquireSinkOnHotelJob.prototype.destroy = function () {
    if (this.task) {
      this.task.destroy();
    }
    this.task = null;
    this.params = null;
    this.protocolsecurer = null;
    JobOnEnvironment.prototype.destroy.call(this);
  };
  AcquireSinkOnHotelJob.prototype.go = function () {
    var ok = this.okToGo();
    if (!ok.ok) {
      return ok.val;
    }
    this.doDaAcquire();
    return ok.val;
  };
  AcquireSinkOnHotelJob.prototype.doDaAcquire = function () {
    var protocol = this.protocolsecurer('http');
    if (this.task) {
      this.task.destroy();
    }

    this.task = execlib.execSuite.taskRegistry.run('acquireSink', {
      connectionString: protocol+'://'+this.params.ipaddress+':'+this.params.port,
      session: this.params.session,
      onSink: this.resolve.bind(this),
      onCannotConnect : this.reject.bind(this),
      onConnectionLost: this.reject.bind(this),
      singleshot: true
    });
  };

  mylib.AcquireSinkOnHotelJob = AcquireSinkOnHotelJob;
}
module.exports = createAcquireSinkOnHotelJob;

},{}],25:[function(require,module,exports){
function createAcquireUserSinkJob (execlib, mylib) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    qlib = lib.qlib,
    JobOnEnvironment = mylib.JobOnEnvironment;

  function AcquireUserSinkJob (env, hotelsink, defer) {
    JobOnEnvironment.call(this, env, defer);
    this.hotelsink = hotelsink;
    this.task = null;
  }
  lib.inherit(AcquireUserSinkJob, JobOnEnvironment);
  AcquireUserSinkJob.prototype.destroy = function () {
    if (this.task) {
      this.task.destroy();
    }
    this.task = null;
    this.hotelsink = null;
    JobOnEnvironment.prototype.destroy.call(this);
  };
  AcquireUserSinkJob.prototype.go = function () {
    var ok = this.okToGo();
    if (!ok.ok) {
      return ok.val;
    }
    this.doDaAcquire();
    return ok.val;
  };
  AcquireUserSinkJob.prototype.doDaAcquire = function () {
    if (!this.okToProceed()) {
      return;
    }
    if (this.task) {
      this.task.destroy();
    }
    //will not report errors
    this.task = execlib.execSuite.taskRegistry.run('acquireUserServiceSink', {
      sink: this.hotelsink,
      cb: this.resolve.bind(this)
    });
  };

  mylib.AcquireUserSinkJob = AcquireUserSinkJob;
}
module.exports = createAcquireUserSinkJob;

},{}],26:[function(require,module,exports){
function createCheckSessionJob (lib, mylib) {
  'use strict';
  var q = lib.q,
    qlib = lib.qlib,
    JobOnEnvironment = mylib.JobOnEnvironment;

  function CheckSessionJob (env, remotestoragename, defer) {
    JobOnEnvironment.call(this, env, defer);
    this.remotestoragename = remotestoragename;
  }
  lib.inherit(CheckSessionJob, JobOnEnvironment);
  CheckSessionJob.prototype.destroy = function () {
    this.remotestoragename = null;
    JobOnEnvironment.prototype.destroy.call(this);
  };
  CheckSessionJob.prototype.go = function () {
    var ok = this.okToGo();
    if (!ok.ok) {
      return ok.val;
    }
    this.destroyable.set('state', 'pending');
    this.destroyable.getFromStorage(this.remotestoragename, 'sessionid').then(
      this.onSessionId.bind(this),
      this.onGetSessionIDFromStorageFailed.bind(this)
    );
    return ok.val;
  };
  CheckSessionJob.prototype.onSessionId = function (sessionid) {
    if (!this.okToProceed()) {
      return;
    }
    this.destroyable.sessionid = sessionid;
    if (!sessionid) {
      this.onGetSessionIDFromStorageFailed();
      return;
    }
    this.resolve(sessionid);
  };
  CheckSessionJob.prototype.onGetSessionIDFromStorageFailed = function () {
    if (!this.okToProceed()) {
      return;
    }
    this.destroyable.set('state', 'loggedout');
    this.reject(new lib.Error('NO_SESSION_ID'));
  };

  mylib.CheckSessionJob = CheckSessionJob;
}
module.exports = createCheckSessionJob;

},{}],27:[function(require,module,exports){
function createRemoteJobs (execlib, mixins) {
  'use strict';

  var ret = {};
  require('./onenvironmentcreator')(execlib.lib, ret);
  require('./checksessioncreator')(execlib.lib, ret);
  require('./letmeincreator')(execlib, ret);
  require('./logincreator')(execlib.lib, mixins, ret);
  require('./acquiresinkonhotelcreator')(execlib, ret);
  require('./acquireusersinkcreator')(execlib, ret);

  return ret;
}
module.exports = createRemoteJobs;

},{"./acquiresinkonhotelcreator":24,"./acquireusersinkcreator":25,"./checksessioncreator":26,"./letmeincreator":28,"./logincreator":29,"./onenvironmentcreator":30}],28:[function(require,module,exports){
function createLetMeInJob (execlib, mylib) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    qlib = lib.qlib,
    JobOnEnvironment = mylib.JobOnEnvironment;

  function LetMeInJob (env, protocolsecurer, heartbeat, credentials, entrypointmethod, defer) {
    JobOnEnvironment.call(this, env, defer);
    this.protocolsecurer = protocolsecurer;
    this.heartbeat = heartbeat;
    this.credentials = credentials;
    this.entrypointmethod = entrypointmethod;
  }
  lib.inherit(LetMeInJob, JobOnEnvironment);
  LetMeInJob.prototype.destroy = function () {
    this.entrypointmethod = null;
    this.credentials = null;
    this.heartbeat = null;
    this.protocolsecurer = null;
    JobOnEnvironment.prototype.destroy.call(this);
  };
  LetMeInJob.prototype.go = function () {
    var ok = this.okToGo();
    if (!ok.ok) {
      return ok.val;
    }
    if (!this.credentials) {
      this.reject(new lib.Error('CANNOT_LOGIN', 'Cannot login without credentials'));
      return ok.val;
    }
    execlib.loadDependencies('client', [
      '.',
      'allex:hotel'
    ], qlib.executor(this.sendLetMeInRequest.bind(this)));
    return ok.val;
  };
  LetMeInJob.prototype.sendLetMeInRequest = function () {
    if (!this.okToProceed()) {
      return;
    }
    lib.request(this.protocolsecurer('http')+'://'+this.destroyable.address+':'+this.destroyable.port+'/'+ (this.entrypointmethod || 'letMeIn'), {
      parameters: this.credentials,
      onComplete: this.onLetMeInResponse.bind(this),
      onError: this.reject.bind(this)
    });
    lib.runNext(this.onStale.bind(this), 10*this.heartbeat);
  };
  LetMeInJob.prototype.onLetMeInResponse = function (response) {
    if (!this.okToProceed()) {
      return;
    }
    if (!response) {
      this.resolve(null);
      return;
    }
    if ('data' in response) {
      this.parseAndResolve(response.data);
      return;
    }
    if ('response' in response) {
      this.parseAndResolve(response.response);
      return;
    }
    this.resolve(response);
  };
  LetMeInJob.prototype.parseAndResolve = function (response) {
    try {
      this.resolve(JSON.parse(response));
    } catch (e) {
      console.error('problem with', response);
      console.error(e);
      this.reject(e);
    }
  };
  LetMeInJob.prototype.onStale = function () {
    this.reject(new lib.Error('STALE_LET_ME_IN_REQUEST', 'Stale request'));
  };

  mylib.LetMeInJob = LetMeInJob;
}
module.exports = createLetMeInJob;

},{}],29:[function(require,module,exports){
function createLoginJob (lib, mixins, mylib) {
  'use strict';

  var q = lib.q,
    qlib = lib.qlib,
    JobOnEnvironment = mylib.JobOnEnvironment,
    HotelAndApartmentHandlerMixin = mixins.HotelAndApartmentHandlerMixin;

  function LoginJob (env, remotestoragename, protocolsecurer, heartbeat, credentials, entrypointmethod, defer) {
    JobOnEnvironment.call(this, env, defer);
    HotelAndApartmentHandlerMixin.call(this);
    this.sinksreported = false;
    this.remotestoragename = remotestoragename;
    this.protocolsecurer = protocolsecurer;
    this.heartbeat = heartbeat;
    this.credentials = credentials;
    this.entrypointmethod = entrypointmethod;
    this.letmeinresponse = null;
  }
  lib.inherit(LoginJob, JobOnEnvironment);
  HotelAndApartmentHandlerMixin.addMethods(LoginJob);
  LoginJob.prototype.destroy = function () {
    if (!this.sinksreported) {
      HotelAndApartmentHandlerMixin.prototype.purgeBothListenersAndSinks();
    }
    this.letmeinresponse = null;
    this.entrypointmethod = null;
    this.credentials = null;
    this.heartbeat = null;
    this.protocolsecurer = null;
    this.remotestoragename = null;
    this.sinksreported = null;
    HotelAndApartmentHandlerMixin.prototype.destroy.call(this);
    JobOnEnvironment.prototype.destroy.call(this);
  };
  LoginJob.prototype.go = function () {
    var ok = this.okToGo();
    if (!ok.ok) {
      return ok.val;
    }
    lib.runNext(this.init.bind(this));
    return ok.val;
  };
  LoginJob.prototype.init = function () {
    if (this.destroyable.apartmentSink && this.destroyable.apartmentSink.destroyed) {
      this.resolve(true);
    } else {
      this.doDaLetMeIn();
    }
  };
  LoginJob.prototype.doDaLetMeIn = function () {
    this.letmeinresponse = null;
    HotelAndApartmentHandlerMixin.prototype.purgeBothListenersAndSinks.call(this);
    (new mylib.LetMeInJob(
      this.destroyable,
      this.protocolsecurer,
      this.heartbeat,
      this.credentials,
      this.entrypointmethod
    )).go().then(
      this.onLetMeInResponse.bind(this),
      this.onLetMeInRequestFail.bind(this)
    );
  };
  LoginJob.prototype.onLetMeInResponse = function (response) {
    if (!this.okToProceed()) {
      return;
    }
    if (!response) {
      this.destroyable.giveUp(this.credentials, this);
      return;
    }
    if (response) {
      if (response.error) {
        console.log('response.error', response.error);
        if (response.error==='NO_TARGETS_YET' || response.error==='NO_DB_YET') {
          lib.runNext(this.doDaLetMeIn.bind(this), this.heartbeat*10);
          //this.reject(response.error);
          return;
        }
      }
      if (response.secondphase) {
        this.destroyable.secondphasesessionid = response.secondphase;
        this.destroyable.delFromStorage(remoteStorageName, 'sessionid').then (
          this.resolve.bind(this, this.destroyable.set('state', 'secondphase')) //yes, 'state' is set immediately
        );
        return;
      }
      if (!(response.ipaddress && response.port && response.session)) {
        this.destroyable.giveUp(this.credentials, this);
        return;
      }
      this.letmeinresponse = response;
      this.acquireSinkOnHotel();
      return;
    }
    this.destroyable.giveUp(this.credentials, this);
  };
  LoginJob.prototype.onLetMeInRequestFail = function (reason) {
    if (!this.okToProceed()) {
      return;
    }
    lib.runNext(this.doDaLetMeIn.bind(this), this.heartbeat*10);
    /*
    if (reason && 'STALE_LET_ME_IN_REQUEST' === reason.code) {
      this.doDaLetMeIn();
      return;
    }
    this.destroyable.set('error', reason);
    this.destroyable.giveUp(this.credentials, this);
    */
  };
  LoginJob.prototype.acquireSinkOnHotel = function () {
    if (!this.okToProceed()) {
      return;
    }
    (new mylib.AcquireSinkOnHotelJob(this.destroyable, this.protocolsecurer, this.letmeinresponse)).go().then(
      this.onHotelSink.bind(this),
      this.onHotelSinkFail.bind(this)
    );
  };
  LoginJob.prototype.onHotelSink = function (hotelsink) {
    if (!this.okToProceed()) {
      if (hotelsink) {
        hotelsink.destroy();
      }
      return;
    }
    this.purgeHotelSinkDestroyedListener();
    if (!(hotelsink && hotelsink.destroyed)) {
      this.acquireSinkOnHotel();
      return;
    }
    HotelAndApartmentHandlerMixin.prototype.setHotelSink.call(this, hotelsink);
    this.acquireApartmentServiceSink();
  };
  LoginJob.prototype.onHotelSinkFail = function (reason) {
    console.warn('Could not acquire sink on Hotel', reason);
    if (reason && reason.code === 'CLIENT_SHOULD_FORGET') {
      this.reject(reason);
      return;
    }
    this.doDaLetMeIn();
  };
  LoginJob.prototype.onHotelSinkDestroyed = function () {
    HotelAndApartmentHandlerMixin.prototype.onHotelSinkDestroyed.call(this);
    this.acquireSinkOnHotel();
  };
  LoginJob.prototype.acquireApartmentServiceSink = function () {
    if (!this.okToProceed()) {
      return;
    }
    (new mylib.AcquireUserSinkJob(this.destroyable, this.hotelSink)).go().then(
      this.onApartmentSink.bind(this),
      this.onApartmentSinkFail.bind(this)
    );
  };
  LoginJob.prototype.onApartmentSink = function (usersink) {
    if (!this.okToProceed()) {
      if (usersink) {
        usersink.destroy();
      }
      return;
    }
    if (!(usersink && usersink.destroyed)) {
      this.acquireApartmentServiceSink();
      return;
    }
    HotelAndApartmentHandlerMixin.prototype.setApartmentSink.call(this, usersink);
    this.destroyable.putToStorage(this.remotestoragename, 'sessionid', {sessionid: this.letmeinresponse.session, token: lib.uid()}).then(
      this.onSessionSaved.bind(this),
      this.onSessionSaveFailed.bind(this)
    );
  };
  LoginJob.prototype.onApartmentSinkFail = function (reason) {
    console.warn('Could not acquire Apartment sink on Hotel', reason);
    this.doDaLetMeIn();
  };
  LoginJob.prototype.onSessionSaved = function (ok) {
    if (!this.okToProceed()) {
      return;
    }
    this.destroyable.sessionid = this.letmeinresponse.session;
    this.destroyable.setApartmentSink(this.apartmentSink);
    this.sinksreported = true;
    this.resolve(true);
  };
  LoginJob.prototype.onSessionSaveFailed = function (reason) {
    if (!this.okToProceed()) {
      return;
    }
  };

  mylib.LoginJob = LoginJob;
}
module.exports = createLoginJob;

},{}],30:[function(require,module,exports){
function createJobOnEnvironment (lib, mylib) {
  'use strict';
  var q = lib.q,
    qlib = lib.qlib,
    JobOnDestroyableBase = qlib.JobOnDestroyableBase;

  function JobOnEnvironment (env, defer) {
    JobOnDestroyableBase.call(this, env, defer);
  }
  lib.inherit(JobOnEnvironment, JobOnDestroyableBase);
  JobOnEnvironment.prototype._destroyableOk = function () {
    return (this.destroyable && this.destroyable.jobs);
  };

  mylib.JobOnEnvironment = JobOnEnvironment;
}
module.exports = createJobOnEnvironment;

},{}],31:[function(require,module,exports){
function createHotelAndApartmentSinkHandlerMixin (lib) {
  'use strict';

  function HotelAndApartmentHandlerMixin () {
    this.hotelSinkDestroyedListener = null;
    this.hotelSink = null;
    this.apartmentSinkDestroyedListener = null;
    this.apartmentSink = null;
  }
  HotelAndApartmentHandlerMixin.prototype.destroy = function () {
    this.apartmentSink = null;
    this.purgeApartmentSinkDestroyedListener();
    this.hotelSink = null;
    this.purgeHotelSinkDestroyedListener();
  };
  HotelAndApartmentHandlerMixin.prototype.purgeHotelSinkDestroyedListener = function () {
    if (this.hotelSinkDestroyedListener) {
      this.hotelSinkDestroyedListener.destroy();
    }
    this.hotelSinkDestroyedListener = null;
  };
  HotelAndApartmentHandlerMixin.prototype.purgeApartmentSinkDestroyedListener = function () {
    if (this.apartmentSinkDestroyedListener) {
      this.apartmentSinkDestroyedListener.destroy();
    }
    this.apartmentSinkDestroyedListener = null;
  };
  HotelAndApartmentHandlerMixin.prototype.setHotelSink = function (hotelsink) {
    this.hotelSinkDestroyedListener = hotelsink.destroyed.attach(this.onHotelSinkDestroyed.bind(this));
    this.hotelSink = hotelsink;
  };
  HotelAndApartmentHandlerMixin.prototype.setApartmentSink = function (apartmentsink) {
    this.purgeApartmentSinkDestroyedListener();
    this.apartmentSinkDestroyedListener = apartmentsink.destroyed.attach(this.onApartmentSinkDestroyed.bind(this));
    this.apartmentSink = apartmentsink;
  };
  HotelAndApartmentHandlerMixin.prototype.onHotelSinkDestroyed = function () {
    this.hotelSink = null;
    this.purgeHotelSinkDestroyedListener();
  };
  HotelAndApartmentHandlerMixin.prototype.onApartmentSinkDestroyed = function () {
    this.apartmentSink = null;
    this.purgeApartmentSinkDestroyedListener();
    /* not needed, acquireUserServiceSink already connected this
    if (this.hotelSink) {
      this.hotelSink.destroy();
    }
    */
  };
  HotelAndApartmentHandlerMixin.prototype.purgeBothListenersAndSinks = function () {
    this.purgeApartmentSinkDestroyedListener();
    this.purgeHotelSinkDestroyedListener();
    if (this.apartmentSink) {
      this.apartmentSink.destroy();
    }
    this.apartmentSink = null;
    if (this.hotelSink && this.hotelSink.destroyed) {
      this.hotelSink.destroy();
    }
    this.hotelSink = null;
  };

  HotelAndApartmentHandlerMixin.addMethods = function (klass) {
    lib.inheritMethods(klass, HotelAndApartmentHandlerMixin
      ,'purgeHotelSinkDestroyedListener'
      ,'purgeApartmentSinkDestroyedListener'
      ,'setHotelSink'
      ,'setApartmentSink'
      ,'onHotelSinkDestroyed'
      ,'onApartmentSinkDestroyed'
      ,'purgeBothListenersAndSinks'
    );
  }

  return HotelAndApartmentHandlerMixin;
}
module.exports = createHotelAndApartmentSinkHandlerMixin;

},{}],32:[function(require,module,exports){
function createMixins (lib) {
  'use strict';

  return {
    HotelAndApartmentHandlerMixin: require('./hotelandapartmentsinkhandlercreator')(lib)
  };
}
module.exports = createMixins;

},{"./hotelandapartmentsinkhandlercreator":31}]},{},[1]);
