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
