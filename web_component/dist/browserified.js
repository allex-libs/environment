(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
ALLEX.execSuite.libRegistry.register('allex_environmentlib',require('./src/index')(ALLEX));
ALLEX.WEB_COMPONENTS.allex_environmentlib = ALLEX.execSuite.libRegistry.get('allex_environmentlib');

},{"./src/index":9}],2:[function(require,module,exports){
function createAllexEnvironment (execlib, dataSourceRegistry, EnvironmentBase) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q;
  
  function AllexEnvironment (options) {
    EnvironmentBase.call(this, options);
  }
  lib.inherit (AllexEnvironment, EnvironmentBase);
  AllexEnvironment.prototype.createDataSource = function (type, options) {
    if (!options.sink) {
      throw new lib.JSONizingError('NO_SINK_DESCRIPTION', options, 'No sink description:');
    }
    return this.findSink(options.sink).then(
      this.onSinkForCreateDataSource.bind(this, type, options)
    );
  };
  AllexEnvironment.prototype.onSinkForCreateDataSource = function (type, options, sink) {
    var ctor;
    switch (type) {
      case 'allexstate':
        ctor = dataSourceRegistry.AllexState;
        break;
      case 'allexhash2array':
        ctor = dataSourceRegistry.AllexHash2Array;
        break;
      default:
        throw new lib.Error('DATASOURCE_TYPE_NOT_APPLICABLE_TO_ALLEX_ENVIRONMENT', type);
    }
    return q(new ctor(sink, options));
  };
  AllexEnvironment.prototype.createCommand = function (options) {
  };

  return AllexEnvironment;
}

module.exports = createAllexEnvironment;

},{}],3:[function(require,module,exports){
function createAllexRemoteEnvironment (execlib, dataSourceRegistry, AllexEnvironment, UserRepresentation) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    qlib = lib.qlib;

  function AllexRemoteEnvironment (options) {
    AllexEnvironment.call(this, options);
    if (!options.entrypoint) {
      throw new lib.JSONizingError('NO_ENTRYPOINT_DESC', options, 'No entrypoint descriptor:');
    }
    this.address = options.entrypoint.address;
    this.port = options.entrypoint.port;
    this.identity = options.entrypoint.identity;
    this.userRepresentation = null;
  }
  lib.inherit(AllexRemoteEnvironment, AllexEnvironment);
  AllexRemoteEnvironment.prototype.destroy = function () {
    if (this.userRepresentation) {
      this.userRepresentation.destroy();
    }
    this.userRepresentation = null;
  };
  AllexRemoteEnvironment.prototype.go = function () {
    if (this.userRepresentation) {
      this.userRepresentation.destroy();
    }
    this.userRepresentation =new UserRepresentation();
    return execlib.loadDependencies('client', [
      '.',
      'allex:users'
    ], this.sendRequest.bind(this));
  };
  AllexRemoteEnvironment.prototype.findSink = function (sinkname) {
    if (sinkname === '.') {
      return q(this.userRepresentation);
    }
    return q(this.userRepresentation.subsinks[sinkname]);
  };
  AllexRemoteEnvironment.prototype.sendRequest = function () {
    var d = q.defer();
    lib.request('http://'+this.address+':'+this.port+'/letMeIn', {
      parameters: {
        username: this.identity.username,
        password: this.identity.password
      },
      onComplete: this.onResponse.bind(this, d),
      onError: d.reject.bind(d)
    });
    return d.promise;
  }
  AllexRemoteEnvironment.prototype.onResponse = function (defer, response) {
    if (!response) {
      //error handling
    }
    if (response.data) {
      try {
        var response = JSON.parse(response.data);
        execlib.execSuite.taskRegistry.run('acquireSink', {
          connectionString: 'ws://'+response.ipaddress+':'+response.port,
          session: response.session,
          onSink:this._onSink.bind(this, defer)
        });
      } catch(e) {
        console.error(e.stack);
        console.error(e);
        //error handling
      }
    }
  };
  AllexRemoteEnvironment.prototype._onSink = function (defer, sink) {
    execlib.execSuite.taskRegistry.run('acquireUserServiceSink', {
      sink: sink,
      cb: this._onAcquired.bind(this, defer)
    });
  };
  AllexRemoteEnvironment.prototype._onAcquired = function (defer, sink) {
    this.userRepresentation.setSink(sink);
    //console.log(this.userRepresentation);
    return qlib.promise2defer(this.onEstablished(), defer);
  };



  return AllexRemoteEnvironment;

}

module.exports = createAllexRemoteEnvironment;

},{}],4:[function(require,module,exports){
function createEnvironmentBase (execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    Configurable = lib.Configurable;

  function EnvironmentBase (config) {
    Configurable.call(this, config);
    this.dataSources = new lib.Map();
    this.commands = new lib.Map();
  }
  Configurable.addMethods(EnvironmentBase);
  EnvironmentBase.prototype.destroy = function () {
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
    Configurable.prototype.destroy.call(this);
  };
  EnvironmentBase.prototype.onEstablished = function () {
    var ds = this.getConfigVal('datasources'),
      cs = this.getConfigVal('commands'),
      promises = [];
    if (lib.isArray(ds)) {
      promises = promises.concat(ds.map(this.toDataSource.bind(this)));
    }
    /*
    if (lib.isArray(cs)) {
      promises = promises.concat(cs.map(this.toCommand.bind(this)));
    }
    */
    return q.all(promises).then(
      this.fireEstablished.bind(this)
    );
  };
  EnvironmentBase.prototype.toDataSource = function (desc) {
    if (!desc.name) {
      throw new lib.JSONizingError('NO_DATASOURCE_NAME', desc, 'No name:');
    }
    if (!desc.type) {
      throw new lib.JSONizingError('NO_DATASOURCE_TYPE', desc, 'No type:');
    }
    return this.createDataSource(desc.type, desc.options).then(
      this.onDataSourceCreated.bind(this, desc)
    );
  };
  EnvironmentBase.prototype.onDataSourceCreated = function (desc, ds) {
    this.dataSources.add(desc.name, ds);
  };
  EnvironmentBase.prototype.toCommand = function (desc) {
    if (!desc.name) {
      throw new lib.JSONizingError('NO_COMMAND_NAME', desc, 'No name:');
    }
    this.dataSources.add(desc.name, this.createCommand(desc.options));
  };
  EnvironmentBase.prototype.fireEstablished = function () {
    console.log('should fire established');
    return q(this);
  };
  EnvironmentBase.prototype.DEFAULT_CONFIG = lib.dummyFunc;

  return EnvironmentBase;
}

module.exports = createEnvironmentBase;

},{}],5:[function(require,module,exports){
function createAllexHash2ArrayDataSource (execlib, AllexState) {
  'use strict';

  var lib = execlib.lib;

  function AllexHash2Array(sink, name) {
    AllexState.call(this, sink, name);
  }
  lib.inherit(AllexHash2Array, AllexState);

  return AllexHash2Array;
}

module.exports = createAllexHash2ArrayDataSource;

},{}],6:[function(require,module,exports){
function createAllexStateDataSource (execlib, DataSourceBase) {
  'use strict';

  var lib = execlib.lib;

  function AllexState (sink, options) {
    DataSourceBase.call(this, options);
    if (!sink) {
      throw new lib.Error('NO_SINK');
    }
    if (!(options && options.path)) {
      throw new lib.Error('NO_STATE_NAME');
    }
    this.sink = sink;
    this.name = options.path;
    this.monitor = null;
  }
  lib.inherit(AllexState, DataSourceBase);
  AllexState.prototype.destroy = function () {
    if (this.monitor) {
      this.monitor.destroy();
    }
    this.monitor = null;
    this.name = null;
    this.sink = null;
    DataSourceBase.prototype.destroy.call(this);
  };
  AllexState.prototype.setTarget = function (target) {
    DataSourceBase.prototype.setTarget.call(this, target);
    var h = {};
    h[name] = this.onStateData.bind(this);
    this.monitor = sink.monitorStateForGui(h);
  };
  AllexState.prototype.onStateData = function (data) {
    if (!this.target) {
      return;
    }
    this.target.set('data', data);
  };

  return AllexState;
}

module.exports = createAllexStateDataSource;

},{}],7:[function(require,module,exports){
function createDataSourceBase (execlib) {
  'use strict';

  var lib = execlib.lib;

  function DataSourceBase(options) {
    this.target = null;
  }
  DataSourceBase.prototype.destroy = function () {
    this.target = null;
  };
  DataSourceBase.prototype.setTarget = function (target) {
    if (this.target) {
      throw new lib.Error('ALREADY_HAVE_TARGET', 'Already have a target');
    }
    this.target = target;
  };

  return DataSourceBase;
}

module.exports = createDataSourceBase;

},{}],8:[function(require,module,exports){
function createDataSourceRegistry (execlib) {
  'use strict';
  var DataSourceBase = require('./basecreator')(execlib),
    AllexState = require('./allexstatecreator')(execlib, DataSourceBase),
    AllexHash2Array = require('./allexhash2arraycreator')(execlib, AllexState);

  return {
    AllexState: AllexState,
    AllexHash2Array: AllexHash2Array
  };
}

module.exports = createDataSourceRegistry;

},{"./allexhash2arraycreator":5,"./allexstatecreator":6,"./basecreator":7}],9:[function(require,module,exports){
(function (global){
function createEnvironmentFactory (execlib) {
  'use strict';
  var dataSourceRegistry = require('./datasources')(execlib),
    EnvironmentBase = require('./basecreator')(execlib),
    UserRepresentation = require('./userrepresentationcreator')(execlib),
    AllexEnvironment = require('./allexcreator')(execlib, dataSourceRegistry, EnvironmentBase),
    AllexRemoteEnvironment = require('./allexremotecreator')(execlib, dataSourceRegistry, AllexEnvironment, UserRepresentation);


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
    switch (desc.type) {
      case 'allexremote' : return new AllexRemoteEnvironment (desc.options);
      case 'fromctor' : return createFromConstructor(desc.options.ctor, desc.options.options);
      default : throw new Error('Environment type '+desc.type+' not supported');
    }
  }

  return environmentFactory;
}

module.exports = createEnvironmentFactory;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./allexcreator":2,"./allexremotecreator":3,"./basecreator":4,"./datasources":8,"./userrepresentationcreator":10}],10:[function(require,module,exports){
function createUserRepresentation(execlib) {
  'use strict';
  var lib = execlib.lib,
    q = lib.q,
    execSuite = execlib.execSuite,
    taskRegistry = execSuite.taskRegistry,
    ADS = execSuite.ADS;

  function SinkActivationMonitor(defer){
    this.defer = defer;
    this.subinits = [];
    this.subdefers = [];
    this.sinksToWait = new lib.Map();
  }
  SinkActivationMonitor.prototype.destroy = function () {
    if (this.defer) {
      this.defer.resolve(null); //won't hurt if defer was already resolved/rejected
    }
    this.sinksToWait.destroy();
    this.sinksToWait = null;
    this.subdefers = null;
    this.subinits = null;
    this.defer = null;
  };
  SinkActivationMonitor.prototype.setup = function (subinit, name) {
    this.subinits.push(subinit);
    if (name) {
      this.sinksToWait.add(name, true);
    }
  };
  SinkActivationMonitor.prototype.resolve = function (result) {
    if (!this.defer) {
      return;
    }
    this.defer.resolve(result);
    this.destroy();
  };
  SinkActivationMonitor.prototype.reject = function (reason) {
    this.defer.reject(reason);
    this.destroy();
  };
  SinkActivationMonitor.prototype.run = function (sinkstate) {
    if(this.subinits.length){
      taskRegistry.run('acquireSubSinks',{
        state: sinkstate,
        subinits: this.subinits
      });
    }
    if (this.sinksToWait.count < 1) {
      this.resolve(0);
    }
  };
  SinkActivationMonitor.prototype.add = function (name, subsinkdefer) {
    if (this.sinksToWait.get(name)) {
      this.subdefers.push(subsinkdefer);
    }
    if(this.sinksToWait.count === this.subdefers.length){
      q.allSettled(this.subdefers).done(
        this.resolve.bind(this),
        this.reject.bind(this)
      );
    }
  };

  function StateEventConsumer (consumers, cb) {
    this.consumers = consumers;
    this.activatorreference = null;
    this.deactivatorreference = null;
    this.setterreference = null;
    this.rawsetterreference = null;
    if ('function' === typeof cb) {
      this.rawsetterreference = this.consumers.rawsetterhandlers.add(cb);
    }
  }
  StateEventConsumer.prototype.destroy = function () {
    if (!this.consumers) {
      return;
    }
    if (this.activatorreference) {
      this.consumers.activatorhandlers.removeOne(this.activatorreference);
    }
    this.activatorreference = null;
    if (this.deactivatorreference) {
      this.consumers.deactivatorhandlers.removeOne(this.deactivatorreference);
    }
    this.deactivatorreference = null;
    if (this.setterreference) {
      this.consumers.setterhandlers.removeOne(this.setterreference);
    }
    this.setterreference = null;
    if (this.rawsetterreference) {
      this.consumers.rawsetterhandlers.removeOne(this.rawsetterreference);
    }
    this.rawsetterreference = null;
  };

  function StateEventConsumers(stateeventconsumers, path) {
    lib.Destroyable.call(this);
    this.sec = stateeventconsumers;
    this.path = path;
    this.ads = null;
    this.activatorhandlers = new lib.SortedList();
    this.deactivatorhandlers = new lib.SortedList();
    this.setterhandlers = new lib.SortedList();
    this.rawsetterhandlers = new lib.SortedList();
    this.createADS();
  }
  lib.inherit(StateEventConsumers, lib.Destroyable);
  StateEventConsumers.prototype.__cleanUp = function () {
    if (!this.sec) {
      return;
    }
    if (!this.sec.consumers) {
      return;
    }
    this.sec.consumers.remove(this.path);
    lib.containerDestroyAll(this.activatorhandlers);
    this.activatorhandlers.destroy();
    this.activatorhandlers = null;
    lib.containerDestroyAll(this.deactivatorhandlers);
    this.deactivatorhandlers.destroy();
    this.deactivatorhandlers = null;
    lib.containerDestroyAll(this.setterhandlers);
    this.setterhandlers.destroy();
    this.setterhandlers = null;
    lib.containerDestroyAll(this.rawsetterhandlers);
    this.rawsetterhandlers.destroy();
    this.rawsetterhandlers = null;
    this.ads = null;
    this.path = null;
    this.sec = null;
    lib.Destroyable.prototype.__cleanUp.call(this);
  };
  StateEventConsumers.prototype.createADS = function () {
    if (this.ads) {
      this.ads.destroyed = null;
      this.ads.destroy();
    }
    this.ads = this.extendTo(ADS.listenToScalar([this.path], {
      activator: this._activated.bind(this),
      deactivator: this._deactivated.bind(this),
      setter: this._set.bind(this),
      rawsetter: this._setRaw.bind(this)
    }));
  };
  StateEventConsumers.prototype.add = function (cb) {
    return new StateEventConsumer(this, cb);
  };
  StateEventConsumers.prototype._activated = function () {
  };
  StateEventConsumers.prototype._deactivated = function () {
  };
  StateEventConsumers.prototype._set = function () {
  };
  StateEventConsumers.prototype._setRaw = function () {
    var args = arguments;
    this.rawsetterhandlers.traverse(function(cb){
      cb.apply(null,args);
    });
    args = null;
  };

  function StateEventConsumersListener(stateeventconsumerpack, listenerhash) {
    this.secp = stateeventconsumerpack;
    this.listeners = [];
    lib.traverseShallow(listenerhash, this.addConsumer.bind(this));
  }
  StateEventConsumersListener.prototype.destroy = function () {
    lib.arryDestroyAll(this.listeners);
    this.listeners = null;
  };
  StateEventConsumersListener.prototype.addConsumer = function (cb, path) {
    if (path.charAt(0) === '/'){
      path = path.substring(1);
    }
    var consumer = this.secp.consumers.get(path);
    if (!consumer) {
      consumer = new StateEventConsumers(this, path);
      this.secp.consumers.add(path, consumer);
      //secp allready attachedTo
      if(this.secp.sink){
        this.secp.sink.state.setSink(consumer.ads);
      }
    }
    this.listeners.push(consumer.add(cb));
  };

  function StateEventConsumerPack(listenerhash) {
    this.sink = null;
    this.consumers = new lib.Map();
    this.addConsumers(listenerhash);
  }
  StateEventConsumerPack.prototype.destroy = function () {
    if (!this.consumers) {
      return;
    }
    lib.containerDestroyAll(this.consumers);
    this.consumers.destroy();
    this.consumers = null;
    this.sink = null;
  };
  StateEventConsumerPack.prototype.addConsumers = function (listenerhash) {
    return new StateEventConsumersListener(this, listenerhash);
  };
  StateEventConsumerPack.prototype.attachTo = function (sink) {
    this.sink = sink;
    this.consumers.traverse(function(listeners, path){
      listeners.createADS();
      sink.state.setSink(listeners.ads);
    });
    sink = null;
  };

  function delSerializer(path, state, delitems, item, itemname) {
    state.data.add(itemname, item);
    delitems.push({
      p: path.concat(itemname),
      o: 'sr',
      d: item
    });
  }
  function DataPurger(state) {
    this.state = new execSuite.Collection();//new execSuite.StateSource();
    this._state = state;
    var path = []; 
    this.delitems = [];
    this._state.traverse(delSerializer.bind(null, path, this.state, this.delitems));
    if (this.delitems.length !== this._state.count) {
      throw new lib.Error('DELITEMS_CORRUPT', this.delitems.length+' !== '+this._state.count);
    }
    path = null;
  }
  DataPurger.prototype.destroy = function () {
    this.delitems = null;
    this._state = null;
    this.state.destroy();
    this.state = null;
  };
  DataPurger.prototype.run = function () {
    console.log('running delitems', this.delitems);
    this.delitems.forEach(this.runItem.bind(this));
    if (this._state.count>0) {
      console.log('_state is still not empty');
      throw new lib.Error('_STATE_STILL_NOT_EMPTY', this._state.count+' items in _state still exist');
    }
    lib.destroyASAP(this);
  };
  DataPurger.prototype.runItem = function (delitem) {
    this._state.remove(delitem.p[0]);
    this.state.handleStreamItem(delitem);
  };


  function DataEventConsumer(eventconsumers, cb){
    this.ecs = eventconsumers;
    this.subscription = this.ecs.consumers.add(cb);
  }
  DataEventConsumer.prototype.destroy = function () {
    if (this.subscription) {
      this.ecs.consumers.removeOne(this.subscription);
    }
    this.subscription = null;
    this.ecs = null;
  };

  function DataEventConsumers(){
    this.consumers = new lib.SortedList();
    this.listeners = null;
    this.hookcollection = null;
  }
  DataEventConsumers.prototype.destroy = function () {
    this.hookcollection = null;
    this.consumers.destroy();
    this.consumers = null;
    this.detach();
  };
  DataEventConsumers.prototype.attachTo = function (hookcollection) {
    this.detach();
    this.hookcollection = hookcollection;
    this.listeners = this.consumers.map(function(cons){
      return hookcollection.attach(cons);
    });
    hookcollection = null;
  };
  DataEventConsumers.prototype.detach = function () { //detach is "detach self from hook given in attachTo
    if(!this.listeners){
      return;
    }
    this.hookcollection = null;
    lib.containerDestroyAll(this.listeners);
    this.listeners.destroy();
    this.listeners = null;
  };
  DataEventConsumers.prototype.attach = function (cb) { //attach is "remember this cb for later attachTo"
    if(this.hookcollection){
      this.listeners.push(this.hookcollection.attach(cb));
    }
    return new DataEventConsumer(this,cb);
  };
  DataEventConsumers.prototype.fire = function () {
    var args = arguments;
    this.consumers.traverse(function (l) {
      l.apply(null,args);
    });
    args = null;
  };
  DataEventConsumers.prototype.fire_er = function () {
    return this.fire.bind(this);
  };

  function DataEventConsumerPack(){
    this.onInitiated = new DataEventConsumers();
    this.onRecordCreation = new DataEventConsumers();
    this.onNewRecord = new DataEventConsumers();
    this.onUpdate = new DataEventConsumers();
    this.onRecordUpdate = new DataEventConsumers();
    this.onDelete = new DataEventConsumers();
    this.onRecordDeletion = new DataEventConsumers();
  }
  DataEventConsumerPack.prototype.destroy = function () {
    this.onInitiated.destroy();
    this.onInitiated = null;
    this.onRecordCreation.destroy();
    this.onRecordCreation = null;
    this.onNewRecord.destroy();
    this.onNewRecord = null;
    this.onUpdate.destroy();
    this.onUpdate = null;
    this.onRecordUpdate.destroy();
    this.onRecordUpdate = null;
    this.onDelete.destroy();
    this.onDelete = null;
    this.onRecordDeletion.destroy();
    this.onRecordDeletion = null;
  };
  DataEventConsumerPack.prototype.listenerPack = function () {
    return {
      onInitiated: this.onInitiated.fire_er(),
      onRecordCreation: this.onRecordCreation.fire_er(),
      onNewRecord: this.onNewRecord.fire_er(),
      onUpdate: this.onUpdate.fire_er(),
      onRecordUpdate: this.onRecordUpdate.fire_er(),
      onDelete: this.onDelete.fire_er(),
      onRecordDeletion: this.onRecordDeletion.fire_er()
    };
  };
  DataEventConsumerPack.prototype.monitorForGui = function (cb) {
    return new DataMonitorForGui(this, cb);
  };

  function DataMonitorForGui(dataeventconsumers, cb){
    this.onInitiatedListener = dataeventconsumers.onInitiated.attach(cb);
    this.onNewRecordListener = dataeventconsumers.onNewRecord.attach(cb);
    this.onUpdateListener = dataeventconsumers.onUpdate.attach(cb);
    this.onDeleteListener = dataeventconsumers.onDelete.attach(cb);
  }
  DataMonitorForGui.prototype.destroy = function () {
    if (this.onInitiatedListener) {
      this.onInitiatedListener.destroy();
    }
    this.onInitiatedListener = null;
    if (this.onNewRecordListener) {
      this.onNewRecordListener.destroy();
    }
    this.onNewRecordListener = null;
    if (this.onUpdateListener) {
      this.onUpdateListener.destroy();
    }
    this.onUpdateListener = null;
    if (this.onDeleteListener) {
      this.onDeleteListener.destroy();
    }
    this.onDeleteListener = null;
  };

  function SinkRepresentation(eventhandlers){
    this.sink = null;
    this.state = new lib.ListenableMap();
    this.data = [];
    this.subsinks = {};
    this.stateEvents = new StateEventConsumerPack();
    this.dataEvents = new DataEventConsumerPack();
    this.eventHandlers = eventhandlers;
    this.connectEventHandlers(eventhandlers);
  }
  SinkRepresentation.prototype.destroy = function () {
    //TODO: all the destroys need to be called here
    this.eventHandlers = null;
    if (this.dataEvents) {
      this.dataEvents.destroy();
    }
    this.dataEvents = null;
    if (this.stateEvents) {
      this.stateEvents.destroy();
    }
    this.stateEvents = null;
    this.subsinks = null;
    this.data = null;
    console.log('destroying state');
    this.state.destroy();
    this.state = null;
    this.sink = null;
  };
  function subSinkRepresentationPurger (subsink) {
    subsink.purge();
  }
  SinkRepresentation.prototype.purge = function () {
    console.log('purging');
    lib.traverseShallow(this.subsinks,subSinkRepresentationPurger);
    //this.subsinks = {}; //this looks like a baad idea...
    this.purgeState();
    //this.purgeData();
  };
  SinkRepresentation.prototype.purgeState = function () {
    var dp = new DataPurger(this.state);
    this.stateEvents.attachTo(dp);
    dp.run();
    //delitems.forEach(this.onStream.bind(this));
  };
  SinkRepresentation.prototype.purgeData = function () {
    var wasfull = this.data.length>0;
    while (this.data.length) {
      this.dataEvents.onRecordDeletion.fire(this.data.pop());
    }
    if (wasfull) {
      this.dataEvents.onDelete.fire(null);
    }
  };
  SinkRepresentation.prototype.connectEventHandlers = function (eventhandlers) {
    if (!eventhandlers) {
      return;
    }
    try {
    if (eventhandlers.state) {
      this.stateEvents.addConsumers(eventhandlers.state);
    }
    if (eventhandlers.data) {
      lib.traverseShallow(eventhandlers.data, this.attachDataEventHandler.bind(this));
    }
    } catch(e) {
      console.error(e.stack);
      console.error(e);
    }
  };
  SinkRepresentation.prototype.attachDataEventHandler = function (handler, eventname) {
    var de = this.dataEvents[eventname];
    if (!de) {
      return;
    }
    return de.attach(handler);
  };
  SinkRepresentation.prototype.monitorDataForGui = function (cb) {
    return this.dataEvents.monitorForGui(cb);
  };
  function setter(map, cb, cbname) {
    var mapval = map.get(cbname);
    if(lib.defined(mapval)){
      cb(mapval);
    }
  }
  SinkRepresentation.prototype.monitorStateForGui = function (listenerhash) {
    /*
    listenerhash: {
      statepath1: cb1,
      statepath2: [cb2, cb3]
    }
    */
    lib.traverseShallow(listenerhash, setter.bind(null, this.state));
    return this.stateEvents.addConsumers(listenerhash);
  };

  function sinkInfoAppender(sink, subsinkinfoextras, sinkinfo) {
    if (sinkinfo) {
      if (sinkinfo.length===1) {
        if (!sink.localSinkNames) {
          sink.localSinkNames = [];
        }
        if (sink.localSinkNames.indexOf(sinkinfo[0])<0){
          sink.localSinkNames.push(sinkinfo[0]);
        }
      } else {
        subsinkinfoextras.push(sinkinfo);
      }
    }
  }

  SinkRepresentation.prototype.setSink = function (sink, sinkinfoextras) {
    var d = q.defer(),
      subsinkinfoextras = [];
    if (this.sink) {
      this.purge();
    }
    if (!sink) {
      console.log('no sink in setSink');
      this.sink = 0; //intentionally
      d.resolve(0);
    } else {
      this.sink = sink;
      //console.log('at the beginning', sink.localSinkNames, '+', sinkinfoextras);
      if (sinkinfoextras) {
        sinkinfoextras.forEach(sinkInfoAppender.bind(null, sink, subsinkinfoextras));
      }
      //console.log('finally', sink.localSinkNames);
      this.handleSinkInfo(d, sink, subsinkinfoextras);
      this.stateEvents.attachTo(sink);
      if(sink.recordDescriptor){
        taskRegistry.run('materializeQuery',this.produceDataMaterializationPropertyHash(sink));
      }
    }
    subsinkinfoextras = null;
    sink = null;
    return d.promise;
  };
  SinkRepresentation.prototype.produceDataMaterializationPropertyHash = function (sink) {
    var ret = this.dataEvents.listenerPack();
    ret.sink = sink;
    ret.data = this.data;
    ret.continuous = true;
    return ret;
  };
  SinkRepresentation.prototype.handleSinkInfo = function (defer, sink, subsinkinfoextras) {
    if (!sink) {
      defer.resolve(0);
      return;
    }
    var sinkstate = taskRegistry.run('materializeState',{
        sink: sink,
        data: this.state
        }),
        activationobj;
    activationobj = new SinkActivationMonitor(defer);
    if (sink.remoteSinkNames) {
      //console.log('remote sink names', sink.remoteSinkNames);
      sink.remoteSinkNames.forEach(this.subSinkInfo2SubInit.bind(this, false, activationobj, subsinkinfoextras));
    }
    if (sink.localSinkNames) {
      sink.localSinkNames.forEach(this.subSinkInfo2SubInit.bind(this, true, activationobj, subsinkinfoextras));
    } else if (subsinkinfoextras && subsinkinfoextras.length) {
      console.log('No localSinkNames on',sink.modulename,'but still have to do subsinkinfoextras',subsinkinfoextras);
    }
    activationobj.run(sinkstate);
  };
  SinkRepresentation.prototype.subSinkInfo2SubInit = function (sswaitable, activationobj, subsinkinfoextras, ss) {
    var ssname = sinkNameName(ss.name),
      subsink,
      subsubsinkinfoextras = [];
    if (!ssname) {
      throw new lib.Error('NO_SUBSINK_NAME');
    }
    subsink = this.subsinks[ssname]; 
    if (subsinkinfoextras) {
      subsinkinfoextras.forEach(function (esubsinkinfo) {
        if (esubsinkinfo[0] === ssname) {
          subsubsinkinfoextras.push(esubsinkinfo.slice(1));
        }
      });
    }
    //console.log(subsinkinfoextras, '+', ssname, '=>', subsubsinkinfoextras);
    if (!subsink) {
      //console.log('new subsink SinkRepresentation',ssname,this.sink.localSinkNames, this.sink.remoteSinkNames);
      subsink = new SinkRepresentation(this.subSinkEventHandlers(ssname));
      this.subsinks[ssname] = subsink;
    }
    activationobj.setup({
        name: ssname,
        identity: this.subIdentity(ssname),
        cb: this.subSinkActivated.bind(this, activationobj, ssname, subsink, subsubsinkinfoextras)
      },sswaitable ? ssname : null);
    /*
    if (sswaitable) {
      //console.log('will wait for', ssname);
      activationobj.subinits.push({
        name: ssname,
        identity: {name: 'user', role: 'user'},
        cb: this.subSinkActivated.bind(this, activationobj, subsink, subsubsinkinfoextras)
      });
    }
    */
    subsubsinkinfoextras = null;
    ssname = null;
  };
  SinkRepresentation.prototype.subSinkActivated = function (activationobj, ssname, subsink, subsubsinkinfoextras, subsubsink) {
    var ssp = subsink.setSink(subsubsink, subsubsinkinfoextras);
    if (activationobj && activationobj.defer && subsubsink) {
      activationobj.add(ssname, ssp);
    }
  };
  SinkRepresentation.prototype.subSinkEventHandlers = function (subsinkname) {
    if (!this.eventHandlers) {
      return;
    }
    if (!this.eventHandlers.sub) {
      return;
    }
    return this.eventHandlers.sub[subsinkname];
  };
  var _defaultIdentity = {name: 'user', role: 'user'};
  function sinkInfo2Identity(si) {
    var ret = {
      role: si.role || 'user',
      name: si.username || 'user'
    };
    return ret;
  }
  function sinkNameName (sn) {
    if (lib.isArray(sn)) {
      return sn[sn.length-1];
    } else if (lib.isString(sn)) {
      return sn;
    }
  }
  function namefinder(findobj, si) {
    var srcname;
    if (!si) {
      return;
    }
    srcname = sinkNameName(si.name);
    if (!srcname) {
      return;
    }
    if (findobj.name === srcname) {
      findobj.found = si;
      return true;
    }
  }
  function findSinkInfo(sis, name) {
    var und, findobj = {name: name, found: und};
    if(sis.some(namefinder.bind(null, findobj))){
      return findobj.found;
    }
  }
  SinkRepresentation.prototype.subIdentity = function (subsinkname) {
    var si = findSinkInfo(this.sink.localSinkNames, subsinkname);
    if (si) {
      return sinkInfo2Identity(si);
    }
    si = findSinkInfo(this.sink.remoteSinkNames, subsinkname);
    if (si) {
      return sinkInfo2Identity(si);
    }
    return {name: 'user', role: 'user'};
  };

  function UserSinkRepresentation(eventhandlers){
    SinkRepresentation.call(this, eventhandlers);
  }
  lib.inherit(UserSinkRepresentation, SinkRepresentation);

  return UserSinkRepresentation;
}

module.exports = createUserRepresentation;

},{}]},{},[1]);
