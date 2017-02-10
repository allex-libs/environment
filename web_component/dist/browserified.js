(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
ALLEX.execSuite.libRegistry.register('allex_environmentlib',require('./src/index')(ALLEX));
ALLEX.WEB_COMPONENTS.allex_environmentlib = ALLEX.execSuite.libRegistry.get('allex_environmentlib');

},{"./src/index":19}],2:[function(require,module,exports){
function createAllexEnvironment (execlib, dataSourceRegistry, EnvironmentBase) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q;
  
  function AllexEnvironment (options) {
    EnvironmentBase.call(this, options);
  }
  lib.inherit (AllexEnvironment, EnvironmentBase);
  AllexEnvironment.prototype.createDataSource = function (type, options) {
    if (options && options.sinks) {
      return this.createMultiSinkDataSource (type, options);
    }
    if (!options || !options.sink) {
      return this.createSinkLessSource (type, options);
    }
    return this.findSink(options.sink).then(
      this.onSinkForCreateDataSource.bind(this, type, options)
    );
  };

  AllexEnvironment.prototype.createSinkLessSource = function (type, options) {
    var ctor;
    switch (type) {
      case 'jsdata': 
        ctor = dataSourceRegistry.JSData;
        break;
      case 'commandwaiter':
        ctor = dataSourceRegistry.AllexCommandDataWaiter;
        break;
      default:
        throw new lib.Error('DATASOURCE_TYPE_NOT_APPLICABLE_TO_ALLEX_ENVIRONMENT', type);
    }

    return q (new ctor(options));
  };

  AllexEnvironment.prototype.onSinkForCreateDataSource = function (type, options, sink) {
    var ctor;
    switch (type) {
      case 'allexleveldb':
        ctor = dataSourceRegistry.AllexLevelDB;
        break;
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
    var d = q.defer(), Err = lib.Error;
    this.findSink(sinkname).then(function (sink) {
      if (!sink) {
        console.error('Sink for createMultiSinkDataSource referenced as', sinkreference, 'was not found');
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
    //d.promise.done (console.log.bind(console, 'got sink', sinkname), console.log.bind(console, 'failed sink', sinkname));
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
      /*
      case 'allexdata+bank':
        ctor = dataSourceRegistry.AllexDataPlusBank;
        break;
        */
      case 'allexdata+leveldb':
        ctor = dataSourceRegistry.AllexDataPlusLevelDB;
        break;
      case 'allexdata+data':
        ctor = dataSourceRegistry.AllexDataPlusData;
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

function createAllexRemoteEnvironment (execlib, dataSourceRegistry, AllexEnvironment, UserRepresentation) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    qlib = lib.qlib,
    remoteStorageName = 'remoteenvironmentstorage',
    letMeInHeartBeat = lib.intervals.Second;

  function AllexRemoteCommand (representation, options) {
    this.representation = null;
    this.methodname = options.name;
    this.setRepresentation(representation, options.sink);
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
      return q.reject(new lib.Error('ARGUMENTS_FOR_COMMAND_EXECUTION_MUST_BE_AN_ARRAY'));
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

  function AllexRemoteDataCommand (representation, options) {
    AllexRemoteCommand.call(this, representation, options);
    this.waiter = options.waiter;
    this.waiter.setData([]);
  }
  lib.inherit(AllexRemoteDataCommand, AllexRemoteCommand);
  AllexRemoteDataCommand.prototype.destroy = function () {
    this.waiter = null;
    AllexRemoteCommand.prototype.destroy.call(this);
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

  function AllexRemoteEnvironment (options) {
    if (options && options.doNotStoreSession){
      if (!options) {
        options = {};
      }
      if (!options.blockStorages) options.blockStorages = [];
      lib.arryOperations.appendNonExistingItems (options.blockStorages, [remoteStorageName]);
    }
    AllexEnvironment.call(this, options);
    if (!options.entrypoint) {
      throw new lib.JSONizingError('NO_ENTRYPOINT_DESC', options, 'No entrypoint descriptor:');
    }
    this.address = options.entrypoint.address;
    this.port = options.entrypoint.port;
    this.identity = options.entrypoint.identity;
    this.userRepresentation = null;
    this.hotelSinkDestroyedListener = null;
    this.apartmentSinkDestroyedListener = null;
    this.pendingRequest = 0;
    this.credentialsForLogin = null;
    this.sessionid = null;
    this.checkForSessionId();
    this.createStorage(remoteStorageName);
  }
  lib.inherit(AllexRemoteEnvironment, AllexEnvironment);
  AllexRemoteEnvironment.prototype.destroy = function () {
    this.purgeHotelSinkDestroyedListener();
    this.purgeApartmentSinkDestroyedListener();
    this.credentialsForLogin = null;
    this.pendingRequest = null;
    if (this.userRepresentation) {
      this.userRepresentation.destroy();
    }
    this.userRepresentation = null;
    this.identity = null;
    this.port = null;
    this.address = null;
    this.sessionid = null;
  };
  AllexRemoteEnvironment.prototype.purgeHotelSinkDestroyedListener = function () {
    if (this.hotelSinkDestroyedListener) {
      this.hotelSinkDestroyedListener.destroy();
    }
    this.hotelSinkDestroyedListener = null;
  };
  AllexRemoteEnvironment.prototype.onHotelSinkDestroyed = function () {
    this.purgeHotelSinkDestroyedListener();
    lib.runNext(this.checkForSessionId.bind(this), 100+Math.random()*1000);
  };
  AllexRemoteEnvironment.prototype.purgeApartmentSinkDestroyedListener = function () {
    if (this.apartmentSinkDestroyedListener) {
      this.apartmentSinkDestroyedListener.destroy();
    }
    this.apartmentSinkDestroyedListener = null;
  };
  AllexRemoteEnvironment.prototype.onApartmentSinkDestroyed = function () {
    this.purgeApartmentSinkDestroyedListener();
    lib.runNext(this.checkForSessionId.bind(this), 100+Math.random()*1000);
  };
  AllexRemoteEnvironment.prototype.checkForSessionId = function (defer) {
    this.set('state', 'pending');
    this.getFromStorage(remoteStorageName, 'sessionid').then(
      this.onSessionId.bind(this, defer),
      this.onGetSessionIDFromStorageFailed.bind(this, defer)
    );
    defer = null;
  };
  AllexRemoteEnvironment.prototype.onGetSessionIDFromStorageFailed = function (defer) {
    if (defer) {
      defer.reject(new lib.Error('NO_SESSION_ID'));
      return;
    }
    this.set('state', 'loggedout');
    defer = null;
  };
  AllexRemoteEnvironment.prototype.onSessionId = function (defer, sessionid) {
    this.sessionid = sessionid;
    if (!sessionid) {
      if (defer) {
        defer.reject(new lib.Error('NO_SESSION_ID'));
      }
      this.set('state', 'loggedout');
      defer = null;
      return;
    }
    this.login({session: sessionid.sessionid}, defer);
    defer = null;
  };
  function callWebMethodResolver(defer,res){
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
      onComplete: callWebMethodResolver.bind(null,d),
      onError: d.reject.bind(d)
    });
    return d.promise;
  };
  AllexRemoteEnvironment.prototype.register = function (datahash) {
    //return this._callWebMethod('register', datahash);
    var d = q.defer();
    this.login(datahash, d, 'register');
    return d.promise;
  };
  AllexRemoteEnvironment.prototype.usernameExists = function (datahash) {
    //datahash <=> {username: 'micatatic'}
    return this._callWebMethod('usernameExists', datahash);
  };
  AllexRemoteEnvironment.prototype.login = function (credentials, defer, entrypointmethod) {
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
      'allex:hotel'
    ], qlib.executor(this.sendLetMeInRequest.bind(this, credentials, defer, entrypointmethod)));
  };
  AllexRemoteEnvironment.prototype.findSink = function (sinkname) {
    if (sinkname === '.') {
      return q(this.userRepresentation);
    }
    return q(this.userRepresentation.subsinks[sinkname]);
  };
  AllexRemoteEnvironment.prototype.createCommand = function (options) {
    var ctor;
    if (!options) {
      throw Error ('no options');
    }
    if (!options.sink) {
      throw Error ('no sink in options');
    }
    if (!options.name) {
      throw new lib.JSONizingError ('NO_NAME_IN_OPTIONS', options, 'No name:');
    }
    switch (options.type) {
      case 'leveldbstreamer':
        ctor = AllexLevelDBStreamerCommand;
        break;
      default:
        ctor = AllexRemoteCommand;
        break;
    }
    return new ctor(this.userRepresentation, options);
  };
  AllexRemoteEnvironment.prototype.sendLetMeInRequest = function (credentials, d, entrypointmethod) {
    if (this.pendingRequest === null) {
      return;
    }
    if (this.pendingRequest > 0) {
      return;
    }
    this.pendingRequest = Date.now();
    d = d || q.defer();
    lib.request(protocolSecurer('http')+'://'+this.address+':'+this.port+'/'+ (entrypointmethod || 'letMeIn'), {
      /*
      parameters: {
        username: credentials.username,
        password: credentials.password
      },
      */
      parameters: credentials,
      onComplete: this.onLetMeInResponse.bind(this, this.pendingRequest, credentials, d),
      onError: this.onLetMeInRequestFail.bind(this, d)
    });
    lib.runNext(this.retryLetMeInIfStalled.bind(this, this.pendingRequest, d), 10*letMeInHeartBeat);
    credentials = null;
    return d.promise;
  };
  AllexRemoteEnvironment.prototype.retryLetMeInIfStalled = function (pr, d) {
    var cfl;
    if (this.pendingRequest === pr) {
      cfl = this.credentialsForLogin;
      this.credentialsForLogin = null;
      this.pendingRequest = 0;
      if (cfl) {
        this.login(cfl, d);
      } else {
        this.checkForSessionId(d);
      }
    }
  };
  AllexRemoteEnvironment.prototype.onLetMeInResponse = function (pr, credentials, defer, response) {
    if (this.pendingRequest !== pr) {
      return;
    }
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
        if (response.error && response.error==='NO_TARGETS_YET') {
          lib.runNext(this.checkForSessionId.bind(this, defer), letMeInHeartBeat);
          return;
        }
        if (!(response.ipaddress && response.port && response.session)) {
          this.giveUp(credentials, defer);
          return;
        }
        execlib.execSuite.taskRegistry.run('acquireSink', {
          connectionString: protocol+'://'+response.ipaddress+':'+response.port,
          session: response.session,
          onSink:this._onSink.bind(this, defer, response.session),
          singleshot: true
        });
      } catch(e) {
        console.error('problem with', response);
        //console.error(e.stack);
        console.error(e);
        //error handling
        this.giveUp(credentials, defer);
      }
    }
    defer = null;
  };
  AllexRemoteEnvironment.prototype.onLetMeInRequestFail = function (d, reason) {
    var lastrun = Date.now() - this.pendingRequest;
    this.set('error', reason);
    if (lastrun >= letMeInHeartBeat) {
      this.reRunCheckSession(d);
    } else {
      lib.runNext(this.reRunCheckSession.bind(this, d), letMeInHeartBeat-lastrun+1); //1=>safety margin
    }
  };
  AllexRemoteEnvironment.prototype.reRunCheckSession = function (defer) {
    if (Date.now() - this.pendingRequest < letMeInHeartBeat) {
      defer.reject(new lib.Error('ANOTHER_PENDING_REQUEST_ALREADY_ACTIVE', 'Another pending request is already active'));
      return;
    }
    this.credentialsForLogin = null;
    this.pendingRequest = 0;
    this.checkForSessionId(defer);
  };
  AllexRemoteEnvironment.prototype._onSink = function (defer, sessionid, sink) {
    if (!sink) {
      this.checkForSessionId();
      return;
    }
    if (!sink.destroyed) {
      this.checkForSessionId();
      return;
    }
    this.purgeHotelSinkDestroyedListener();
    this.hotelSinkDestroyedListener = sink.destroyed.attach(this.onHotelSinkDestroyed.bind(this));
    execlib.execSuite.taskRegistry.run('acquireUserServiceSink', {
      sink: sink,
      cb: this._onAcquired.bind(this, defer, sessionid)
    });
    defer = null;
  };
  AllexRemoteEnvironment.prototype._onAcquired = function (defer, sessionid, sink) {
    this.userRepresentation.setSink(sink);
    //console.log(this.userRepresentation);
    this.pendingRequest = 0;
    if (!sink) {
      this.checkForSessionId();
      return;
    }
    if (!sink.destroyed) {
      this.checkForSessionId();
      return;
    }
    this.purgeApartmentSinkDestroyedListener();
    this.apartmentSinkDestroyedListener = sink.destroyed.attach(this.onApartmentSinkDestroyed.bind(this));
    this.sessionid = sessionid;
    return qlib.promise2defer(this.putToStorage(remoteStorageName, 'sessionid', {sessionid: sessionid, token: lib.uid()}).then(
      this.onSessionIdSaved.bind(this)
    ), defer);
    //return qlib.promise2defer(q(this.set('state', 'established')), defer);
  };
  AllexRemoteEnvironment.prototype.onSessionIdSaved = function () {
    this.credentialsForLogin = null;
    return q(this.set('state', 'established'));
  };
  AllexRemoteEnvironment.prototype.giveUp = function (credentials, defer) {
    this.pendingRequest = 0;
    this.credentialsForLogin = null;
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
    this.sendLetMeOutRequest({session: this.sessionid});
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
  AllexRemoteEnvironment.prototype.type = 'allexremote';



  return AllexRemoteEnvironment;

}

module.exports = createAllexRemoteEnvironment;

},{}],4:[function(require,module,exports){
function createEnvironmentBase (execlib, leveldblib) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
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
    this.storages = new lib.DIContainer();
    this.dataSources = new lib.DIContainer();
    this.commands = new lib.Map();
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
        this.onDataSourceCreated.bind(this, desc),
        this.onFailedToCreateDataSource.bind(this, desc)
      );
    }
    return ret || this.dataSources.waitFor(desc.name);
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
    if (!desc.name) {
      throw new lib.JSONizingError('NO_COMMAND_NAME', desc, 'No name:');
    }
    var oldc = this.commands.replace(desc.name, this.createCommand(desc.options));
    if (oldc) {
      oldc.destroy();
    }
    return q(true);
  };
  EnvironmentBase.prototype.toDataCommand = function (desc) {
    if (!desc.name) {
      throw new lib.JSONizingError('NO_COMMAND_NAME', desc, 'No name:');
    }
    return this.toDataSource({
      name: desc.name,
      type: 'commandwaiter',
      options: {}
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
    var dss = this.dataSources;
    if (dss) {
      dss.traverse(unregisterer.bind(null, dss));
    }
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

  return EnvironmentBase;
}

module.exports = createEnvironmentBase;

},{}],5:[function(require,module,exports){
function createAllexCommandDataWaiter(execlib, JSData) {
  'use strict';

  var lib = execlib.lib;

  function AllexCommandDataWaiter (options) {
    options.data = [];
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

  return AllexCommandDataWaiter;
}

module.exports = createAllexCommandDataWaiter;

},{}],6:[function(require,module,exports){
function createAllexDataPlusDataSource (execlib, DataSourceBase, BusyLogic) {
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
    this._bl.emitData();
    //this.target.set('data', this.data.slice());
  };

  AllexDataPlusData.prototype.copyData = function () {
    return this.data.slice();
  };

  return AllexDataPlusData;
}

module.exports = createAllexDataPlusDataSource;

},{}],7:[function(require,module,exports){
function createAllexDataPlusLevelDBDataSource(execlib, DataSourceTaskBase, BusyLogic, LevelDBChannelProxy) {
  'use strict';

  var lib = execlib.lib,
    taskRegistry = execlib.execSuite.taskRegistry,
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
    this.data = [];
    this.map = new lib.Map();
    this._reconsume = true;
    this._leveldb_sink_name = options.sinks.leveldb;
  }
  lib.inherit(AllexDataPlusLevelDB, DataSourceTaskBase);
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
    //this.valuename = null;
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
    LevelDBChannelProxy.consumeChannel(this._leveldb_sink_name,leveldbsink,'l', this.onLevelDBData.bind(this));
    //accounts? zaista? samo to ... nista vise ? pogledaj allexleveldbcreator ....
    leveldbsink.sessionCall('hook', {scan: true, accounts: ['***']});
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

  return AllexDataPlusLevelDB;
}

module.exports = createAllexDataPlusLevelDBDataSource;

},{}],8:[function(require,module,exports){
function createAllexDataQueryDataSource(execlib, DataSourceTaskBase, BusyLogic) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    taskRegistry = execlib.execSuite.taskRegistry,
    cnt = 0;


  function AllexDataQuery (sink, options) {
    DataSourceTaskBase.call(this, sink, options);
    this._bl = new BusyLogic(this);
    this.data = [];
    this.cnt = cnt++;
  }
  lib.inherit(AllexDataQuery, DataSourceTaskBase);
  AllexDataQuery.prototype.destroy = function () {
    this._bl.destroy();
    this._bl = null;
    this.cnt = null;
    this.data = null;
    DataSourceTaskBase.prototype.destroy.call(this);
  };

  AllexDataQuery.prototype.setTarget = function (target) {
    this._bl.setTarget(target);
    DataSourceTaskBase.prototype.setTarget.call(this, target);
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

  return AllexDataQuery;
}

module.exports = createAllexDataQueryDataSource;

},{}],9:[function(require,module,exports){
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

},{}],10:[function(require,module,exports){
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


},{}],11:[function(require,module,exports){
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
    //console.log('got state data', data);
    if (!this.target) {
      return;
    }
    this.target.set('data', data);
  };

  return AllexState;
}

module.exports = createAllexStateDataSource;

},{}],12:[function(require,module,exports){
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

},{}],13:[function(require,module,exports){
function createBusyLogicCreator (execlib) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    _initialperiod = 10;

  function BusyLogic (datasource) {
    this.target = null;
    this.blocked = false;
    this.datasource = datasource;
    this._timer = null;
    this._period = _initialperiod;
    this._newrecords = 0;
    this._timeouttimestamp = 0;
  }

  BusyLogic.prototype.destroy = function () {
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
    this.target.set('data', ds);
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

  return BusyLogic;
}

module.exports = createBusyLogicCreator;

},{}],14:[function(require,module,exports){
function createDataSourceRegistry (execlib) {
  'use strict';
  var 
    LevelDBChannelProxy = require('./leveldbproxy')(execlib),
    BusyLogic = require('./busylogic')(execlib),
    DataSourceBase = require('./basecreator')(execlib),
    DataSourceSinkBase = require('./sinkbasecreator')(execlib, DataSourceBase),
    DataSourceTaskBase = require('./taskbasecreator')(execlib, DataSourceSinkBase),
    AllexState = require('./allexstatecreator')(execlib, DataSourceBase),
    AllexHash2Array = require('./allexhash2arraycreator')(execlib, AllexState),
    AllexDataQuery = require('./allexdataquerycreator')(execlib, DataSourceTaskBase, BusyLogic),
    AllexDataPlusLevelDB = require('./allexdataplusleveldbcreator')(execlib, DataSourceTaskBase, BusyLogic, LevelDBChannelProxy),
    AllexLevelDB = require('./allexleveldbcreator')(execlib, DataSourceSinkBase, BusyLogic, LevelDBChannelProxy),
    AllexDataPlusData = require('./allexdataplusdatacreator.js')(execlib, DataSourceBase, BusyLogic),
    JSData = require('./jsdatacreator')(execlib, DataSourceBase, BusyLogic),
    AllexCommandDataWaiter = require('./allexcommanddatawaitercreator')(execlib, JSData);

  return {
    AllexLevelDB : AllexLevelDB,
    AllexState: AllexState,
    AllexHash2Array: AllexHash2Array,
    AllexDataQuery: AllexDataQuery,
    AllexDataPlusLevelDB : AllexDataPlusLevelDB,
    AllexDataPlusData : AllexDataPlusData,
    JSData: JSData,
    AllexCommandDataWaiter: AllexCommandDataWaiter
  };
}

module.exports = createDataSourceRegistry;

},{"./allexcommanddatawaitercreator":5,"./allexdataplusdatacreator.js":6,"./allexdataplusleveldbcreator":7,"./allexdataquerycreator":8,"./allexhash2arraycreator":9,"./allexleveldbcreator":10,"./allexstatecreator":11,"./basecreator":12,"./busylogic":13,"./jsdatacreator":15,"./leveldbproxy":16,"./sinkbasecreator":17,"./taskbasecreator":18}],15:[function(require,module,exports){
function createJSDataDataSource(execlib, DataSourceBase, BusyLogic) {
  'use strict';

  var lib = execlib.lib;

  function JSData (options) {
    DataSourceBase.call(this, options);
    this._bl = new BusyLogic(this);
    this.data = options ? options.data : null;
  }
  lib.inherit (JSData, DataSourceBase);
  JSData.prototype.destroy = function () {
    this._bl.destroy();
    this.data = null;
    DataSourceBase.prototype.destroy.call(this);
  };

  JSData.prototype.setTarget = function (target) {
    DataSourceBase.prototype.setTarget.call(this, target);
    this._bl.setTarget(target);
    this.setData();
  };

  JSData.prototype.setData = function (data) {
    if (arguments.length) {
      this.data = data;
    }
    if (!this.target) {
      return;
    }
    this._bl.emitData();
  };

  JSData.prototype.copyData = function () {
    if (lib.isArray(this.data)) {
      return this.data.slice();
    }

    if (this.data instanceof Object){
      return lib.extend({}, this.data);
    }

    return this.data;
  };

  return JSData;
}

module.exports = createJSDataDataSource;

},{}],16:[function(require,module,exports){
function createLevelDBProxy (execlib) {
  'use strict';

  var lib = execlib.lib,
    HookCollection = lib.HookCollection;

  function Emitter (sink, channel, destroyed_listener) {
    this.hc = new HookCollection ();
    this.destroyed_listener = destroyed_listener;
    this.records = [];
    sink.consumeChannel(channel, this._onLeveldbdata.bind(this));

  }

  Emitter.prototype.destroy = function () {
    if (this.destroyed_listener) {
      this.destroyed_listener.destroy();
    }
    this.destroyed_listener = null;
    this.hc.destroy();
    this.hc = null;
    this.records = null;
  };

  Emitter.prototype._onLeveldbdata = function (record) {
    this.records.push (record);
    this.hc.fire(record);
  };

  Emitter.prototype.hook = function (cb) {
    this.hc.attach (cb);
  };

  Emitter.prototype.dump = function (cb) {
    for (var i = 0; i < this.records.length; i++) {
      cb(this.records[i]);
    }
  };

  function LevelDBChannelProxy () {
    this.map = new lib.Map ();
  }

  LevelDBChannelProxy.prototype.destroy = function () {
    this.map.destroy();
    this.map = null;
  };

  LevelDBChannelProxy.prototype.getEmiitterID = function (sink_name, channel) {
    return channel+'@@'+sink_name;
  };

  LevelDBChannelProxy.prototype.consumeChannel = function (name, sink, channel, cb) {
    var emitter = this.map.get(this.getEmiitterID(name, channel));
    if (!emitter) {
      emitter = new Emitter (sink, channel, sink.destroyed.attach(this._onSinkDestroyed.bind(this, name, channel)));
      this.map.add(this.getEmiitterID (name, channel), emitter);
    }else{
      emitter.dump(cb);
    }
    emitter.hook(cb);
  };

  LevelDBChannelProxy.prototype._onSinkDestroyed = function (name, channel) {
    var el = this.map.remove (this.getEmiitterID(name, channel));
    if (el) el.destroy();
  };

  return new LevelDBChannelProxy();
}

module.exports = createLevelDBProxy;

},{}],17:[function(require,module,exports){
function createDataSourceSinkBase (execlib, DataSourceBase) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    cnt = 0;

  function DataSourceSinkBase (sink, options){
    DataSourceBase.call(this, options);
    this.cnt = cnt++;
    this.sink = sink;
    this._starting = null;
    this._should_stop = null;
    this._sink_instance = null;
    this._sink_destroyed_listener = null;
  }
  lib.inherit(DataSourceSinkBase, DataSourceBase);

  DataSourceSinkBase.prototype.destroy = function () {
    this.stop();
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
      this._starting.done(this._starting.bind(this));
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
    this._sink_destroyed_listener.destroy();
    this._sink_destroyed_listener = null;
    this._sink_instance = null;

    if (this._should_stop) return;
    //go and search for sink again ...
    this.start();
  };

  DataSourceSinkBase.prototype.onGotSink = function (sink){
    if (this._should_stop) return q.resolve(true);
    if (!sink.destroyed) return q.reject(false);

    this._sink_instance = sink;
    this._sink_destroyed_listener = sink.destroyed.attach(this._onSinkDestroyed.bind(this));

    return this._doGoWithSink(sink);
  };

  DataSourceSinkBase.prototype.setFilter = function (filter) {
    this.stop();
    DataSourceBase.prototype.setFilter.call(this, filter);
    if (!this._should_stop) this.start();
  };

  return DataSourceSinkBase;
}

module.exports = createDataSourceSinkBase;


},{}],18:[function(require,module,exports){
function createDataSourceTaskBase (execlib, DataSourceSinkBase) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q;

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
    if (this.task) {
      this.task.destroy();
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

  return DataSourceTaskBase;
}

module.exports = createDataSourceTaskBase;


},{}],19:[function(require,module,exports){
(function (global){
function createLib (execlib) {
  return execlib.loadDependencies('client', ['allex:leveldb:lib'], createEnvironmentFactory.bind(null, execlib));
}

function createEnvironmentFactory (execlib, leveldblib) {
  'use strict';
  var dataSourceRegistry = require('./datasources')(execlib),
    EnvironmentBase = require('./basecreator')(execlib, leveldblib),
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

module.exports = createLib;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./allexcreator":2,"./allexremotecreator":3,"./basecreator":4,"./datasources":14,"./userrepresentationcreator":20}],20:[function(require,module,exports){
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
      if(this.secp.sink && this.secp.sink.state){
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
    this.sinkDestroyedListener = null;
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
    this.purgeSinkDestroyedListener();
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
      this.purgeSinkDestroyedListener();
      this.sinkDestroyedListener = sink.destroyed.attach(this.onSinkDown.bind(this));
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
  SinkRepresentation.prototype.onSinkDown = function () {
    this.purgeSinkDestroyedListener();
    this.stateEvents.sink = null;
  };
  SinkRepresentation.prototype.purgeSinkDestroyedListener = function () {
    if (this.sinkDestroyedListener) {
      this.sinkDestroyedListener.destroy();
    }
    this.sinkDestroyedListener = null;
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
