(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
ALLEX.execSuite.libRegistry.register('allex_environmentlib',require('./src/index')(ALLEX));
ALLEX.WEB_COMPONENTS.allex_environmentlib = ALLEX.execSuite.libRegistry.get('allex_environmentlib');

},{"./src/index":14}],2:[function(require,module,exports){
function createAllexEnvironment (execlib, dataSourceRegistry, EnvironmentBase) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q;
  
  function AllexEnvironment (options) {
    EnvironmentBase.call(this, options);
  }
  lib.inherit (AllexEnvironment, EnvironmentBase);
  AllexEnvironment.prototype.createDataSource = function (type, options) {
    if (options.sinks) {
      return this.createMultiSinkDataSource (type, options);
    }
    if (!options.sink) {
      return this.createSinkLessSource (type, options);
    }
    return this.findSink(options.sink).then(
      this.onSinkForCreateDataSource.bind(this, type, options)
    );
  };

  AllexEnvironment.prototype.createSinkLessSource = function (type, options) {
    var ctor;
    switch (type) {
      case 'jsdata': {
        ctor = dataSourceRegistry.JSData;
        break;
      }
      default:
        throw new lib.Error('DATASOURCE_TYPE_NOT_APPLICABLE_TO_ALLEX_ENVIRONMENT', type);
    }

    return q (new ctor(options));
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
      case 'allexdataquery':
        ctor = dataSourceRegistry.AllexDataQuery;
        break;
      default:
        throw new lib.Error('DATASOURCE_TYPE_NOT_APPLICABLE_TO_ALLEX_ENVIRONMENT', type);
    }
    return q(new ctor(sink, options));
  };

  /*
     {  
        name: 'clubs',                                                                                                         
        type: 'allexdataquery',                                                                                                 
        options: {                                                                                                              
          sinks : {
            data: 'Clubs'                                                                                                          bank: 'AgentBank'
          }
        }                                                                                                                       

  */

  AllexEnvironment.prototype.sinkfinder = function (promises, sinks, sinkname, sinkreference) {
    var d = q.defer();
    this.findSink(sinkname).then(function (sink) {
      sinks[sinkreference] = sink;
      sinks = null;
      sinkreference = null;
      d.resolve(true);
      d = null;
    });
    promises.push(d.promise);
  }

  AllexEnvironment.prototype.createMultiSinkDataSource = function (type, options) {
    var promises = [], sinks = {}, _p = promises, _s = sinks;
    lib.traverseShallow(options.sinks, this.sinkfinder.bind(this, _p, _s));
    _p = null;
    _s = null;
    return q.all(promises).then(this.onSinksReady.bind(this, type, sinks, options));
  };

  AllexEnvironment.prototype.onSinksReady = function (type, sinks, options) {
    var ctor;
    switch (type) {
      case 'allexdata+bank':
        ctor = dataSourceRegistry.AllexDataPlusBank;
        break;
      case 'allexdata+leveldb':
        ctor = dataSourceRegistry.AllexDataPlusLevelDB;
        break;
      default:
        throw new lib.Error('DATASOURCE_TYPE_NOT_APPLICABLE_TO_ALLEX_ENVIRONMENT', type);
    }
    return q(new ctor(sinks, options));
  };

  AllexEnvironment.prototype.createCommand = function (options) {
    throw new lib.Error('NOT_IMPLEMENTED_YET', 'Base AllexEnvironment still has to come up with methods to implement sink calls');
    console.log('command options', options);
  };

  return AllexEnvironment;
}

module.exports = createAllexEnvironment;

},{}],3:[function(require,module,exports){
function protocolSecurer (protocol) {
    if ('undefined' !== typeof window && window.location && window.location.protocol && window.location.protocol.indexOf('https') >=0) {
      return protocol+'s';
    }
    return protocol;
}

function createAllexRemoteEnvironment (execlib, leveldblib, dataSourceRegistry, AllexEnvironment, UserRepresentation) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    qlib = lib.qlib;

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

  function AllexRemoteCommand (representation, sinkname, methodname) {
    this.representation = null;
    this.methodname = methodname;
    this.setRepresentation(representation, sinkname);
  }
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
  AllexRemoteCommand.prototype.execute = function (args) {
    if (!lib.isArray(args)) {
      console.warn('Supressing sink call');
      return;
    }
    args.unshift(this.methodname);
    return this.representation.waitForSink().then(
      this.onSink.bind(this, args)
    );
  };
  AllexRemoteCommand.prototype.onSink = function (args, sink) {
    console.log('calling', arguments);
    return sink.call.apply(sink, args);
  };

  function AllexRemoteEnvironment (options) {
    AllexEnvironment.call(this, options);
    if (!options.entrypoint) {
      throw new lib.JSONizingError('NO_ENTRYPOINT_DESC', options, 'No entrypoint descriptor:');
    }
    this.address = options.entrypoint.address;
    this.port = options.entrypoint.port;
    this.identity = options.entrypoint.identity;
    this.userRepresentation = null;
    this.storage = null;
    this.pendingRequest = false;
    var d = q.defer();
    d.promise.then(this.checkForSessionId.bind(this), this.onNoStorage.bind(this));
    this.set('state', 'pending');
    this.storage = new leveldblib.LevelDBHandler({
      starteddefer:d,
      maxretries:3,
      dbname: 'remoteenvironmentstorage',
      dbcreationoptions: {
        valueEncoding: 'json'
      }
    });
    this.credentialsForLogin = null;
  }
  lib.inherit(AllexRemoteEnvironment, AllexEnvironment);
  AllexRemoteEnvironment.prototype.destroy = function () {
    this.pendingRequest = null;
    if (this.storage) {
      this.storage.destroy();
    }
    if (this.userRepresentation) {
      this.userRepresentation.destroy();
    }
    this.userRepresentation = null;
    this.identity = null;
    this.port = null;
    this.address = null;
  };
  AllexRemoteEnvironment.prototype.onNoStorage = function () {
    if (this.storage) {
      this.storage.destroy();
    }
    this.storage = new InMemStorage();
    this.checkForSessionId();
  };
  AllexRemoteEnvironment.prototype.checkForSessionId = function () {
    if (!this.storage) {
      return;
    }
    this.set('state', 'pending');
    this.storage.get('sessionid').then(
      this.onSessionId.bind(this),
      this.set.bind(this, 'state', 'loggedout')
    );
  };
  AllexRemoteEnvironment.prototype.onSessionId = function (sessionid) {
    if (!sessionid) {
      return;
    }
    this.login({session: sessionid.sessionid});
  };
  AllexRemoteEnvironment.prototype.login = function (credentials) {
    if (this.credentialsForLogin) {
      return;
    }
    this.credentialsForLogin = credentials;
    if (!this.credentialsForLogin) {
      return;
    }
    this.set('state', 'pending');
    if (this.userRepresentation) {
      this.userRepresentation.destroy();
    }
    this.userRepresentation =new UserRepresentation();
    return execlib.loadDependencies('client', [
      '.',
      'allex:users'
    ], qlib.executor(this.sendLetMeInRequest.bind(this, credentials)));
  };
  AllexRemoteEnvironment.prototype.findSink = function (sinkname) {
    if (sinkname === '.') {
      return q(this.userRepresentation);
    }
    return q(this.userRepresentation.subsinks[sinkname]);
  };
  AllexRemoteEnvironment.prototype.createCommand = function (options) {
    if (!options) {
      throw Error ('no options');
    }
    if (!options.sink) {
      throw Error ('no sink in options');
    }
    if (!options.name) {
      throw new lib.JSONizingError ('NO_NAME_IN_OPTIONS', options, 'No name:');
    }
    return new AllexRemoteCommand(this.userRepresentation, options.sink, options.name);
  };
  AllexRemoteEnvironment.prototype.sendLetMeInRequest = function (credentials, d) {
    if (this.pendingRequest === null) {
      return;
    }
    if (this.pendingRequest) {
      return;
    }
    this.pendingRequest = true;
    d = d || q.defer();
    lib.request(protocolSecurer('http')+'://'+this.address+':'+this.port+'/letMeIn', {
      /*
      parameters: {
        username: credentials.username,
        password: credentials.password
      },
      */
      parameters: credentials,
      onComplete: this.onLetMeInResponse.bind(this, credentials, d),
      onError: this.onLetMeInRequestFail.bind(this, credentials, d)
    });
    credentials = null;
    return d.promise;
  };
  AllexRemoteEnvironment.prototype.onLetMeInResponse = function (credentials, defer, response) {
    this.pendingRequest = false;
    if (!response) {
      this.giveUp(credentials, defer);
      return;
    }
    if ('data' in response){
      response = response.data;
    } else if ('response' in response) {
      response = response.response;
    }

    if (response) {
      try {
        var response = JSON.parse(response),
          protocol = protocolSecurer('ws');
        if (!(response.ipaddress && response.port && response.session)) {
          this.giveUp(credentials, defer);
          return;
        }
        execlib.execSuite.taskRegistry.run('acquireSink', {
          connectionString: protocol+'://'+response.ipaddress+':'+response.port,
          session: response.session,
          onSink:this._onSink.bind(this, defer, response.session)
        });
      } catch(e) {
        console.error('problem with', response);
        //console.error(e.stack);
        console.error(e);
        //error handling
        this.giveUp(credentials, defer);
      }
    } else {
      lib.runNext(this.sendLetMeInRequest.bind(this, credentials, defer), lib.intervals.Second);
    }
    defer = null;
  };
  AllexRemoteEnvironment.prototype.onLetMeInRequestFail = function (credentials, d, reason) {
    this.pendingRequest = false;
    this.set('error', reason);
    lib.runNext(this.sendLetMeInRequest.bind(this, credentials, d), lib.intervals.Second);
  };
  AllexRemoteEnvironment.prototype._onSink = function (defer, sessionid, sink) {
    if (!sink) {
      this.checkForSessionId();
      return;
    }
    execlib.execSuite.taskRegistry.run('acquireUserServiceSink', {
      sink: sink,
      cb: this._onAcquired.bind(this, defer, sessionid)
    });
    defer = null;
  };
  AllexRemoteEnvironment.prototype._onAcquired = function (defer, sessionid, sink) {
    this.userRepresentation.setSink(sink);
    //console.log(this.userRepresentation);
    if (!sink) {
      this.checkForSessionId();
      return;
    }
    return qlib.promise2defer(this.storage.put('sessionid', {sessionid: sessionid, token: lib.uid()}).then(
      this.onSessionIdSaved.bind(this)
    ), defer);
    //return qlib.promise2defer(q(this.set('state', 'established')), defer);
  };
  AllexRemoteEnvironment.prototype.onSessionIdSaved = function () {
    this.credentialsForLogin = null;
    return q(this.set('state', 'established'));
  };
  AllexRemoteEnvironment.prototype.giveUp = function (credentials, defer) {
    this.credentialsForLogin = null;
    this.set('state', 'loggedout');
    this.storage.del('sessionid').then (
      defer.reject.bind(defer, new lib.JSONizingError('INVALID_LOGIN', credentials, 'Invalid'))
    );
  };
  AllexRemoteEnvironment.prototype.logout = function () {
    console.log('will logout');
    this.storage.get('sessionid').then(
      this.doDaLogout.bind(this),
      this.set.bind(this, 'state', 'loggedout')
    );
  };
  AllexRemoteEnvironment.prototype.doDaLogout = function (sessionid) {
    return this.sendLetMeOutRequest({session: sessionid.sessionid});
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
    console.log('onLetMeInResponse', response);
    defer.resolve(true);
  };
  AllexRemoteEnvironment.prototype.onLetMeOutRequestFail = function (credentials, defer, reason) {
    this.set('error', reason);
    lib.runNext(this.sendLetMeOutRequest.bind(this, credentials, defer), lib.intervals.Second);
  };
  AllexRemoteEnvironment.prototype.type = 'allexremote';



  return AllexRemoteEnvironment;

}

module.exports = createAllexRemoteEnvironment;

},{}],4:[function(require,module,exports){
function createEnvironmentBase (execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    Configurable = lib.Configurable,
    ChangeableListenable = lib.ChangeableListenable;

  function EnvironmentBase (config) {
    ChangeableListenable.call(this);
    Configurable.call(this, config);
    this.dataSources = new lib.DIContainer();
    this.commands = new lib.Map();
    this.state = null;
    this.error = null;
  }
  ChangeableListenable.addMethods(EnvironmentBase);
  lib.inherit(EnvironmentBase, ChangeableListenable);
  Configurable.addMethods(EnvironmentBase);
  EnvironmentBase.prototype.destroy = function () {
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
    Configurable.prototype.destroy.call(this);
    ChangeableListenable.prototype.destroy.call(this);
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
      promises = [];
    this.set('error', null);
    if (lib.isArray(ds)) {
      promises = promises.concat(ds.map(this.toDataSource.bind(this)));
    }
    if (lib.isArray(cs)) {
      promises = promises.concat(cs.map(this.toCommand.bind(this)));
    }
    return q.all(promises);
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
    if (!this.dataSources.busy(desc.name)) {
      ret = this.dataSources.waitFor(desc.name);
      this.createDataSource(desc.type, desc.options).then(
        this.onDataSourceCreated.bind(this, desc)
      );
    }
    return ret || this.dataSources.waitFor(desc.name);
  };
  EnvironmentBase.prototype.onDataSourceCreated = function (desc, ds) {
    this.dataSources.register(desc.name, ds);
    return q(ds);
  };
  EnvironmentBase.prototype.toCommand = function (desc) {
    if (!desc.name) {
      throw new lib.JSONizingError('NO_COMMAND_NAME', desc, 'No name:');
    }
    var oldc = this.commands.replace(desc.name, this.createCommand(desc.options));
    if (oldc) {
      oldc.destroy();
    }
    return q(true);
  };
  function unregisterer(dss, ds, dsname) {
    dss.unregisterDestroyable(dsname);
  }
  EnvironmentBase.prototype.onDeEstablished = function () {
    var dss = this.dataSources;
    if (dss) {
      dss.traverse(unregisterer.bind(null, dss));
    }
  };
  EnvironmentBase.prototype.DEFAULT_CONFIG = lib.dummyFunc;

  return EnvironmentBase;
}

module.exports = createEnvironmentBase;

},{}],5:[function(require,module,exports){
function createAllexDataPlusBankDataSource(execlib, AllexDataPlusLevelDB) {
  'use strict';

  var lib = execlib.lib,
    taskRegistry = execlib.execSuite.taskRegistry,
    q = lib.q;

  function AllexDataPlusBank (sinks, options) {
    if (!sinks.hasOwnProperty('bank')) {
      throw new lib.Error('NO_BANK_SINK_IN_SINKS');
    }

    options.valuefilter = this._valuefilter.bind(this);
    options.valuename = options.balancename || 'balance';

    AllexDataPlusLevelDB.call(this, {
      data : sinks.data,
      leveldb : sinks.bank
    },options);
  }
  lib.inherit(AllexDataPlusBank, AllexDataPlusLevelDB);

  AllexDataPlusBank.prototype._valuefilter = function (val) {
    return val[0];
  };

  return AllexDataPlusBank;
}

module.exports = createAllexDataPlusBankDataSource;

},{}],6:[function(require,module,exports){
function createAllexDataPlusLevelDBDataSource(execlib, DataSourceTaskBase) {
  'use strict';

  var lib = execlib.lib,
    taskRegistry = execlib.execSuite.taskRegistry,
    q = lib.q;

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
    this.leveldbsink = sinks.leveldb;
    this.pk = options.primarykey;
    this.valuename = options.valuename || 'value';
    this.valuefilter = options.valuefilter || lib.dummyFunc;
    this.data = [];
    this.map = new lib.Map();
  }
  lib.inherit(AllexDataPlusLevelDB, DataSourceTaskBase);
  AllexDataPlusLevelDB.prototype.destroy = function () {
    if (this.map) {
      this.map.destroy();
    }
    this.map = null;
    this.data = null;
    //this.valuename = null;
    this.pk = null;
    this.leveldbsink = null;
    this.valuefilter = null;
    DataSourceTaskBase.prototype.destroy.call(this);
  };
  AllexDataPlusLevelDB.prototype._doStartTask = function (tasksink) {
    var fire_er = this.fire.bind(this);
    this.task = taskRegistry.run('materializeQuery', {
      sink: tasksink,
      data: this.data,
      onInitiated: fire_er,
      onNewRecord: fire_er,
      onDelete: fire_er,
      onUpdate: fire_er,
      continuous: true
    });
    return this.leveldbsink.waitForSink().then(
      this.onLeveldbSink.bind(this)
    );
  };
  AllexDataPlusLevelDB.prototype.onLeveldbSink = function (leveldbsink) {
    leveldbsink.consumeChannel('l', this.onBalance.bind(this));
    //accounts? zaista?
    leveldbsink.sessionCall('hook', {scan: true, accounts: ['***']});
    return q.resolve(true);
  };
  AllexDataPlusLevelDB.prototype.fire = function () {
    this.map.traverse(this.valuer.bind(this));
    this.target.set('data', this.data.slice());
  };
  AllexDataPlusLevelDB.prototype.onBalance = function (uservaluearry) {
    this.map.replace(uservaluearry[0], this.valuefilter(uservaluearry[1]));
    this.valuer(this.valuefilter(uservaluearry[1]), uservaluearry[0]);
    this.target.set('data', this.data.slice());
  };
  AllexDataPlusLevelDB.prototype.valuer = function (value, pk) {
    var data = this.data, dl = data.length, i, d;
    for (i=0; i<dl; i++) {
      d = data[i];
      if (d[this.pk] === pk) {
        d[this.valuename] = value;
        return;
      }
    }
  };

  return AllexDataPlusLevelDB;
}

module.exports = createAllexDataPlusLevelDBDataSource;

},{}],7:[function(require,module,exports){
function createAllexDataQueryDataSource(execlib, DataSourceTaskBase) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    taskRegistry = execlib.execSuite.taskRegistry;

  function AllexDataQuery (sink, options) {
    DataSourceTaskBase.call(this, sink, options);
    this.data = [];
  }
  lib.inherit(AllexDataQuery, DataSourceTaskBase);
  AllexDataQuery.prototype.destroy = function () {
    this.data = null;
    DataSourceTaskBase.prototype.destroy.call(this);
  };

  AllexDataQuery.prototype._doStartTask = function (sink) {
    var fire_er = this.fire.bind(this);
    if (this.filter) {
      console.log('WILL START TASK WITH ...', this.filter);
    }
    this.task = taskRegistry.run('materializeQuery', {
      sink: sink,
      data: this.data,
      onInitiated: fire_er,
      onNewRecord: fire_er,
      onDelete: fire_er,
      onUpdate: fire_er,
      continuous: true,
      filter : this.filter
    });
    return q.resolve(true);
  };

  AllexDataQuery.prototype.fire = function () {
    console.log('allex data changed', this.data);
    this.target.set('data', this.data.slice()); //horror, if there were a more elegant way...
  };

  return AllexDataQuery;
}

module.exports = createAllexDataQueryDataSource;

},{}],8:[function(require,module,exports){
function createAllexHash2ArrayDataSource (execlib, AllexState) {
  'use strict';

  var lib = execlib.lib;

  function AllexHash2Array(sink, options) {
    AllexState.call(this, sink, options);
    this.columnnames = options.columnnames;
  }
  lib.inherit(AllexHash2Array, AllexState);
  function recordpacker (obj, result, itemname) {
    if (obj && obj.hasOwnProperty && obj.hasOwnProperty(itemname)) {
      result.push(obj[itemname]);
    }
    return result;
  }

  function packer (colnames, arry, thingy, pk) {
    var record = [pk];
    if (lib.isArray(colnames) && colnames.length) {
      colnames.reduce(recordpacker.bind(null, thingy), record);
    } else {
      record.push(thingy);
    }
    arry.push(record);
  }
  AllexHash2Array.prototype.onStateData = function (data) {
    if (!this.target) {
      console.log('no target? too bad for', data);
      return;
    }
    var ret = [];
    lib.traverseShallow(data, packer.bind(null, this.columnnames, ret));
    this.target.set('data', ret);
  };

  return AllexHash2Array;
}

module.exports = createAllexHash2ArrayDataSource;

},{}],9:[function(require,module,exports){
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
    h[this.name] = this.onStateData.bind(this);
    this.monitor = this.sink.monitorStateForGui(h);
  };
  AllexState.prototype.onStateData = function (data) {
    console.log('got state data', data);
    if (!this.target) {
      return;
    }
    this.target.set('data', data);
  };

  return AllexState;
}

module.exports = createAllexStateDataSource;

},{}],10:[function(require,module,exports){
function createDataSourceBase (execlib) {
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
    if (this.target) {
      throw new lib.Error('ALREADY_HAVE_TARGET', 'Already have a target');
    }
    this.target = target;
  };

  DataSourceBase.prototype.setFilter = function (filter) {
    this.filter = filter;
  };

  return DataSourceBase;
}

module.exports = createDataSourceBase;

},{}],11:[function(require,module,exports){
function createDataSourceRegistry (execlib) {
  'use strict';
  var DataSourceBase = require('./basecreator')(execlib),
    DataSourceTaskBase = require('./taskbasecreator')(execlib, DataSourceBase),
    AllexState = require('./allexstatecreator')(execlib, DataSourceBase),
    AllexHash2Array = require('./allexhash2arraycreator')(execlib, AllexState),
    AllexDataQuery = require('./allexdataquerycreator')(execlib, DataSourceTaskBase),
    AllexDataPlusLevelDB = require('./allexdataplusleveldbcreator')(execlib, DataSourceTaskBase),
    AllexDataPlusBank = require('./allexdataplusbankcreator')(execlib, AllexDataPlusLevelDB),
    JSData = require('./jsdatacreator')(execlib, DataSourceBase);

  return {
    AllexState: AllexState,
    AllexHash2Array: AllexHash2Array,
    AllexDataQuery: AllexDataQuery,
    AllexDataPlusLevelDB : AllexDataPlusLevelDB,
    AllexDataPlusBank: AllexDataPlusBank,
    JSData: JSData
  };
}

module.exports = createDataSourceRegistry;

},{"./allexdataplusbankcreator":5,"./allexdataplusleveldbcreator":6,"./allexdataquerycreator":7,"./allexhash2arraycreator":8,"./allexstatecreator":9,"./basecreator":10,"./jsdatacreator":12,"./taskbasecreator":13}],12:[function(require,module,exports){
function createJSDataDataSource(execlib, DataSourceBase) {
  'use strict';

  var lib = execlib.lib;

  function JSData (options) {
    DataSourceBase.call(this, options);
    this.data = options.data;
  }
  lib.inherit (JSData, DataSourceBase);
  JSData.prototype.destroy = function () {
    this.data = null;
    DataSourceBase.prototype.destroy.call(this);
  };

  JSData.prototype.setTarget = function (target) {
    DataSourceBase.prototype.setTarget.call(this, target);
    if (lib.isArray(this.data)) {
      this.target.set('data', this.data.slice());
      return;
    }

    if (this.data instanceof Object){
      this.target.set('data', lib.extend({}, this.data));
      return;
    }
    this.target.set('data', this.data);
  };

  return JSData;
}

module.exports = createJSDataDataSource;

},{}],13:[function(require,module,exports){
function createDataSourceTaskBase (execlib, DataSourceBase) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q;

  function DataSourceTaskBase (tasksink, options){
    DataSourceBase.call(this, options);
    this.task = null;
    this.tasksink = tasksink;
    this._task_starting = null;
    this._should_stop = null;
  }
  lib.inherit(DataSourceTaskBase, DataSourceBase);

  DataSourceTaskBase.prototype.destroy = function () {
    this.stopTask();
    this.task = null;
    this.tasksink = null;
    this._should_stop = null;
    this._task_starting = null;
    DataSourceBase.prototype.destroy.call(this);
  };

  DataSourceTaskBase.prototype.stopTask = function () {
    if (this.task) {
      this.task.destroy();
    }
    this.task = null;
  };

  DataSourceTaskBase.prototype.setTarget = function (target) {
    if (!this.tasksink) return;

    DataSourceBase.prototype.setTarget.call(this, target);
    if (target) {
      this.startTask();
    }else{
      this.stopTask();
    }
  };

  DataSourceTaskBase.prototype.startTask = function () {
    this._should_stop = false;
    if (this._task_starting) return this._task_starting;
    if (!this.tasksink) return;

    this._task_starting = this.tasksink.waitForSink().then(this.onGotSink.bind(this));
    this._task_starting.done (this._taskStarted.bind(this));
    return this._task_starting;
  };

  DataSourceTaskBase.prototype._taskStarted = function () {
    //console.log('go go go ... task started ...');
    this._task_starting = null;
  };

  DataSourceTaskBase.prototype.onGotSink = function (tasksink){
    //if datasource was stopped while tasksink was obtained, make sure that task is not started 
    if (this._should_stop) return q.resolve(true);
    if (!tasksink.destroyed) return q.reject(false);
    return this._doStartTask(tasksink);
  };

  DataSourceTaskBase.prototype.setFilter = function (filter) {
    DataSourceBase.prototype.setFilter.call(this, filter);
    this.stopTask();
    if (!this._should_stop) this.startTask();
  };

  return DataSourceTaskBase;
}

module.exports = createDataSourceTaskBase;


},{}],14:[function(require,module,exports){
(function (global){
function createLib (execlib) {
  return execlib.loadDependencies('client', ['allex:leveldb:lib'], createEnvironmentFactory.bind(null, execlib));
}

function createEnvironmentFactory (execlib, leveldblib) {
  'use strict';
  var dataSourceRegistry = require('./datasources')(execlib),
    EnvironmentBase = require('./basecreator')(execlib),
    UserRepresentation = require('./userrepresentationcreator')(execlib),
    AllexEnvironment = require('./allexcreator')(execlib, dataSourceRegistry, EnvironmentBase),
    AllexRemoteEnvironment = require('./allexremotecreator')(execlib, leveldblib, dataSourceRegistry, AllexEnvironment, UserRepresentation);

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

module.exports = createLib;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./allexcreator":2,"./allexremotecreator":3,"./basecreator":4,"./datasources":11,"./userrepresentationcreator":15}],15:[function(require,module,exports){
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
    //console.log('running delitems', this.delitems);
    this.delitems.forEach(this.runItem.bind(this));
    if (this._state.count>0) {
      //console.log('_state is still not empty');
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
    this.subsinks = {};
    this.stateEvents = new StateEventConsumerPack();
    this.eventHandlers = eventhandlers;
    this.connectEventHandlers(eventhandlers);
    this.sinkWaiters = new lib.DeferFifo();
  }
  SinkRepresentation.prototype.destroy = function () {
    //TODO: all the destroys need to be called here
    if (this.sinkWaiters) {
      this.sinkWaiters.destroy();
    }
    this.sinkWaiters = null;
    this.eventHandlers = null;
    if (this.stateEvents) {
      this.stateEvents.destroy();
    }
    this.stateEvents = null;
    this.subsinks = null;
    //console.log('destroying state');
    this.state.destroy();
    this.state = null;
    this.sink = null;
  };
  SinkRepresentation.prototype.waitForSink = function () {
    if (this.sink) {
      return q(this.sink);
    }
    if (this.sinkWaiters) {
      return this.sinkWaiters.defer();
    }
    return q(true);
  };
  function subSinkRepresentationPurger (subsink) {
    subsink.purge();
  }
  SinkRepresentation.prototype.purge = function () {
    //console.log('purging');
    lib.traverseShallow(this.subsinks,subSinkRepresentationPurger);
    //this.subsinks = {}; //this looks like a baad idea...
    this.purgeState();
  };
  SinkRepresentation.prototype.purgeState = function () {
    var dp = new DataPurger(this.state);
    this.stateEvents.attachTo(dp);
    dp.run();
    //delitems.forEach(this.onStream.bind(this));
  };
  SinkRepresentation.prototype.connectEventHandlers = function (eventhandlers) {
    if (!eventhandlers) {
      return;
    }
    try {
    if (eventhandlers.state) {
      this.stateEvents.addConsumers(eventhandlers.state);
    }
    } catch(e) {
      console.error(e.stack);
      console.error(e);
    }
  };
  SinkRepresentation.prototype.monitorDataForGui = function (cb) {
    console.error('monitorDataForGui has no implementation for now');
    return null;
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
    var d,
      subsinkinfoextras;
    if (!this.stateEvents) {
      return q(0);
    }
    if (this.sink) {
      this.purge();
    }
    d = q.defer();
    if (!sink) {
      //console.log('no sink in setSink');
      this.sink = 0; //intentionally
      d.resolve(0);
    } else {
      this.sink = sink;
      subsinkinfoextras = [];
      //console.log('at the beginning', sink.localSinkNames, '+', sinkinfoextras);
      if (sinkinfoextras) {
        sinkinfoextras.forEach(sinkInfoAppender.bind(null, sink, subsinkinfoextras));
      }
      //console.log('finally', sink.localSinkNames);
      this.handleSinkInfo(d, sink, subsinkinfoextras);
      this.stateEvents.attachTo(sink);
      if(sink.recordDescriptor){
        //taskRegistry.run('materializeQuery',this.produceDataMaterializationPropertyHash(sink));
      }
      this.sinkWaiters.resolve(sink);
    }
    subsinkinfoextras = null;
    sink = null;
    return d.promise;
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
  function subSinkInfoExtraHandler(subsinkinfoextras, esubsinkinfo) {
    if (esubsinkinfo[0] === ssname) {
      subsubsinkinfoextras.push(esubsinkinfo.slice(1));
    }
  }
  SinkRepresentation.prototype.subSinkInfo2SubInit = function (sswaitable, activationobj, subsinkinfoextras, ss) {
    var ssname = sinkNameName(ss.name),
      subsink,
      subsubsinkinfoextras = [];
    if (!ssname) {
      throw new lib.Error('NO_SUBSINK_NAME');
    }
    subsink = this.subsinks[ssname]; 
    if (subsinkinfoextras) {
      subsinkinfoextras.forEach(subSinkInfoExtraHandler.bind(null, subsinkinfoextras));
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
