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
    this.secondphasesessionid = null;
    this.checkForSessionId();
    this.createStorage(remoteStorageName);
  }
  lib.inherit(AllexRemoteEnvironment, AllexEnvironment);
  AllexRemoteEnvironment.prototype.destroy = function () {
    this.purgeHotelSinkDestroyedListener();
    this.purgeApartmentSinkDestroyedListener();
    this.secondphasesessionid = null;
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
      'allex_hotelservice'
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
        if (response.secondphase) {
          this.pendingRequest = 0;
          this.credentialsForLogin = null;
          this.secondphasesessionid = response.secondphase;
          this.delFromStorage(remoteStorageName, 'sessionid').then (
            defer.resolve.bind(defer, this.set('state', 'secondphase')) //yes, 'state' is set immediately
          );
          return;
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
      onCannotConnect : defer.reject.bind(defer),
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
    this.secondphasesessionid = null;
    return q(this.set('state', 'established'));
  };
  AllexRemoteEnvironment.prototype.giveUp = function (credentials, defer) {
    this.pendingRequest = 0;
    this.credentialsForLogin = null;
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
    return this.login({session: this.secondphasesessionid, secondphasetoken: token});
  };
  AllexRemoteEnvironment.prototype.type = 'allexremote';



  return AllexRemoteEnvironment;

}

module.exports = createAllexRemoteEnvironment;
