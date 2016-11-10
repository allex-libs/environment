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
    remoteStorageName = 'remoteenvironmentstorage';

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
    return execlib.execSuite.libRegistry.get('allex_leveldblib').streamInSink(
      sink,
      this.methodname,
      {pagesize: this.pagesize},
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
    if (!sessionid) {
      if (defer) {
        defer.reject(new lib.Error('NO_SESSION_ID'));
      }
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
      'allex:users'
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
    lib.runNext(this.retryLetMeInIfStalled.bind(this, this.pendingRequest, d), 10*lib.intervals.Second);
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
          lib.runNext(this.checkForSessionId.bind(this, defer), lib.intervals.Second);
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
    this.credentialsForLogin = null;
    this.pendingRequest = 0;
    this.set('error', reason);
    lib.runNext(this.checkForSessionId.bind(this, d), lib.intervals.Second);
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
    console.log('will logout');
    this.set('state', 'pending');
    this.purgeHotelSinkDestroyedListener();
    this.purgeApartmentSinkDestroyedListener();
    this.getFromStorage(remoteStorageName, 'sessionid').then(
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
    var set = this.set.bind(this);
    console.log('onLetMeOutResponse', response);
    if (response && response.response && response.response === 'ok' ) {
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
