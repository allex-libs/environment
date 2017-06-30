(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
ALLEX.execSuite.libRegistry.register('allex_environmentlib',require('./src/index')(ALLEX));
ALLEX.WEB_COMPONENTS.allex_environmentlib = ALLEX.execSuite.libRegistry.get('allex_environmentlib');

},{"./src/index":18}],2:[function(require,module,exports){
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
    this.pendingRequests = new lib.Map();
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
    if (this.pendingRequests) {
      this.pendingRequests.destroy();
    }
    this.pendingRequests = null;
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
    this.recreateUserRepresentation();
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
      case 'aggregation' : 
        ctor = AllexAggregateDataCommand;
        break;
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
    this.pendingRequests.add(this.pendingRequest, true);
    lib.request(protocolSecurer('http')+'://'+this.address+':'+this.port+'/'+ (entrypointmethod || 'letMeIn'), {
      /*
      parameters: {
        username: credentials.username,
        password: credentials.password
      },
      */
      parameters: credentials,
      onComplete: this.onLetMeInResponse.bind(this, this.pendingRequest, credentials, d),
      onError: this.onLetMeInRequestFail.bind(this, this.pendingRequest, d)
    });
    lib.runNext(this.retryLetMeInIfStalled.bind(this, this.pendingRequest, d), 10*letMeInHeartBeat);
    credentials = null;
    return d.promise;
  };
  AllexRemoteEnvironment.prototype.retryLetMeInIfStalled = function (pr, d) {
    var cfl;
    if (!this.pendingRequests) {
      return;
    }
    if (this.pendingRequests.count > 2) {
      return;
    }
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
    if (!this.pendingRequests) {
      return;
    }
    this.pendingRequests.remove(pr);
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
        var response = JSON.parse(response);

        if (response.error) {
          console.log('response.error', response.error);
          if (response.error==='NO_TARGETS_YET' || response.error==='NO_DB_YET') {
            lib.runNext(this.checkForSessionId.bind(this, defer), letMeInHeartBeat);
            return;
          }
        }
        if (!(response.ipaddress && response.port && response.session)) {
          this.giveUp(credentials, defer);
          return;
        }
        this._acquireSinkOnHotel (response, defer);

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

  AllexRemoteEnvironment.prototype.recreateUserRepresentation = function () {
    this.set('state', 'pending');
    if (this.userRepresentation) {
      this.userRepresentation.destroy();
    }
    this.userRepresentation = new UserRepresentation();
  };

  AllexRemoteEnvironment.prototype.acquireSinkOnHotel = function (params) {
    var defer = q.defer();
    this.recreateUserRepresentation();
    this._acquireSinkOnHotel (params, defer);
    return defer.promise;
  };

  AllexRemoteEnvironment.prototype._acquireSinkOnHotel = function (params, defer) {
    var protocol = protocolSecurer('ws');

    execlib.execSuite.taskRegistry.run('acquireSink', {
      connectionString: protocol+'://'+params.ipaddress+':'+params.port,
      session: params.session,
      onSink:this._onSink.bind(this, defer, params.session),
      singleshot: true
    });
  };

  AllexRemoteEnvironment.prototype.onLetMeInRequestFail = function (pendingrequest, d, reason) {
    var lastrun;
    if (!this.pendingRequests) {
      return;
    }
    this.pendingRequests.remove(pendingrequest);
    lastrun = Date.now() - this.pendingRequest;
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
    this.sendLetMeOutRequest({session: this.sessionid}).done (this.set.bind(this, 'state', 'loggedout'));
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

  return AllexDataPlusData;
}

module.exports = createAllexDataPlusDataSource;

},{}],7:[function(require,module,exports){
function createAllexDataPlusLevelDBDataSource(execlib, DataSourceTaskBase, BusyLogic) {
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
    this.levelDBFilters = options.levelDBFilters || {};
    this.queryMethodName = options.queryMethodName || 'query';
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
function createAllexLevelDBDataSource(execlib, DataSourceTaskBase, BusyLogic) {
  'use strict';

  var lib = execlib.lib,
    taskRegistry = execlib.execSuite.taskRegistry,
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
      //throw new lib.Error('NO_SINK');
      console.error ('Sink for state was not found. Sink: ', options.sink, 'path:', options.path);
      return;
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
    if (!this.sink) return;
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
    if (!target) {
      this.target = null;
      this.stop();
      return;
    }

    if (this.target) {
      throw new lib.Error('ALREADY_HAVE_TARGET', 'Already have a target');
    }
    this.stop();
    this.target = target;
    this.start();
  };

  DataSourceBase.prototype.start = lib.dummyFunc;
  DataSourceBase.prototype.stop = lib.dummyFunc;


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

  return BusyLogic;
}

module.exports = createBusyLogicCreator;

},{}],14:[function(require,module,exports){
function createDataSourceRegistry (execlib) {
  'use strict';
  var BusyLogic = require('./busylogic')(execlib),
    DataSourceBase = require('./basecreator')(execlib),
    DataSourceSinkBase = require('./sinkbasecreator')(execlib, DataSourceBase),
    DataSourceTaskBase = require('./taskbasecreator')(execlib, DataSourceSinkBase),
    AllexState = require('./allexstatecreator')(execlib, DataSourceBase),
    AllexHash2Array = require('./allexhash2arraycreator')(execlib, AllexState),
    AllexDataQuery = require('./allexdataquerycreator')(execlib, DataSourceTaskBase, BusyLogic),
    AllexDataPlusLevelDB = require('./allexdataplusleveldbcreator')(execlib, DataSourceTaskBase, BusyLogic),
    AllexLevelDB = require('./allexleveldbcreator')(execlib, DataSourceTaskBase, BusyLogic),
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

},{"./allexcommanddatawaitercreator":5,"./allexdataplusdatacreator.js":6,"./allexdataplusleveldbcreator":7,"./allexdataquerycreator":8,"./allexhash2arraycreator":9,"./allexleveldbcreator":10,"./allexstatecreator":11,"./basecreator":12,"./busylogic":13,"./jsdatacreator":15,"./sinkbasecreator":16,"./taskbasecreator":17}],15:[function(require,module,exports){
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


},{}],17:[function(require,module,exports){
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
    if (!filter) {
      this.stop();
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

  return DataSourceTaskBase;
}

module.exports = createDataSourceTaskBase;


},{}],18:[function(require,module,exports){
(function (global){
function createLib (execlib) {
  return execlib.loadDependencies('client', ['allex:leveldb:lib', 'allex:userrepresentation:lib'], createEnvironmentFactory.bind(null, execlib));
}

function createEnvironmentFactory (execlib, leveldblib, UserRepresentation) {
  'use strict';
  var dataSourceRegistry = require('./datasources')(execlib),
    EnvironmentBase = require('./basecreator')(execlib, leveldblib),
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
},{"./allexcreator":2,"./allexremotecreator":3,"./basecreator":4,"./datasources":14}]},{},[1]);
