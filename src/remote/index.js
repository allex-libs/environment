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
    taskRegistry = execlib.execSuite.taskRegistry,
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
    this.sessionlevel = !!options.session;
    this.setRepresentation(representation, options.sink);
  }
  lib.inherit(AllexRemoteCommand, CommandBase);
  AllexRemoteCommand.prototype.destroy = function () {
    this.sessionlevel = null;
    this.methodname = null;
    this.representation = null;
  };
  AllexRemoteCommand.prototype.setRepresentation = function (representation, sinkname) {
    if (sinkname === '.') {
      this.representation = representation;
      return;
    }
    this.representation = representation.subsinks[sinkname];
  };
  AllexRemoteCommand.prototype.doExecute = function (args) {
    var ret;
    ret = this.representation.waitForSink().then(
      this.onSink.bind(this, args)
    );
    args = null;
    return ret;
  };
  AllexRemoteCommand.prototype.onSink = function (args, sink) {
    console.log('calling', arguments);
    var d, ret;
    if (!this.sessionlevel) {
      return sink.call.apply(sink, [this.methodname].concat(args));
    }
    d = q.defer();
    ret = d.promise;
    taskRegistry.run('invokeSessionMethod', {
      sink: sink,
      methodname: this.methodname,
      params: args,
      onSuccess: d.resolve.bind(d),
      onNotify: d.notify.bind(d),
      onError: d.reject.bind(d)
    });
    return ret;
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
    this.connectionAttempt = null;
    this.checkForSessionId();
    this.createStorage(remoteStorageName);
  }
  lib.inherit(AllexRemoteEnvironment, AllexEnvironment);
  HotelAndApartmentHandlerMixin.addMethods(AllexRemoteEnvironment);
  AllexRemoteEnvironment.prototype.destroy = function () {
    this.connectionAttempt = null;     
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
    return this.jobs.run('.', new jobs.CheckSessionJob(this, remoteStorageName, false)).then(
      this.loginWithSession.bind(this)
    );
  };
  AllexRemoteEnvironment.prototype.loginWithSession = function (sessionid) {
    return this.login({__sessions__id: sessionid.sessionid}, null, 'letMeInWithSession');
  };
  AllexRemoteEnvironment.prototype.cloneMySession = function () {
    return this.jobs.run('.', new jobs.CheckSessionJob(this, remoteStorageName, true)).then(
      this.cloneSession.bind(this)
    );
  };
  AllexRemoteEnvironment.prototype.cloneSession = function (sessionid) {
    return this.jobs.run('.', new jobs.CloneSessionJob(this, protocolSecurer, {__sessions__id: sessionid.sessionid}));
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
    return this.jobs.run(
      '.',
      new jobs.LoginJob(
        this,
        remoteStorageName,
        protocolSecurer,
        letMeInHeartBeat,
        credentials,
        entrypointmethod,
        defer
      )
    );
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
    this.set('connectionAttempt', null);
    this.delFromStorage(remoteStorageName, 'sessionid').then (
      defer.reject.bind(defer, new lib.JSONizingError('INVALID_LOGIN', credentials, 'Invalid'))
    );
  };
  AllexRemoteEnvironment.prototype.logout = function () {
    if (!this.sessionid) return;
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
