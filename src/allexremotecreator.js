function createAllexRemoteEnvironment (execlib, leveldblib, dataSourceRegistry, AllexEnvironment, UserRepresentation) {
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
    this.storage = null;
    var d = q.defer();
    d.promise.then(this.checkForSessionId.bind(this));
    this.set('state', 'pending');
    this.storage = new leveldblib.LevelDBHandler({
      starteddefer:d,
      dbname: 'remoteenvironmentstorage',
      dbcreationoptions: {
        valueEncoding: 'json'
      }
    });
    this.credentialsForLogin = null;
  }
  lib.inherit(AllexRemoteEnvironment, AllexEnvironment);
  AllexRemoteEnvironment.prototype.destroy = function () {
    if (this.userRepresentation) {
      this.userRepresentation.destroy();
    }
    this.userRepresentation = null;
  };
  AllexRemoteEnvironment.prototype.checkForSessionId = function () {
    if (!this.storage) {
      return;
    }
    this.storage.get('sessionid').then(
      this.onSessionId.bind(this),
      this.set.bind(this, 'state', 'loggedout')
    );
  };
  AllexRemoteEnvironment.prototype.onSessionId = function (sessionid) {
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
    ], qlib.executor(this.sendRequest.bind(this, credentials)));
  };
  AllexRemoteEnvironment.prototype.findSink = function (sinkname) {
    if (sinkname === '.') {
      return q(this.userRepresentation);
    }
    return q(this.userRepresentation.subsinks[sinkname]);
  };
  AllexRemoteEnvironment.prototype.sendRequest = function (credentials, d) {
    d = d || q.defer();
    lib.request('http://'+this.address+':'+this.port+'/letMeIn', {
      /*
      parameters: {
        username: credentials.username,
        password: credentials.password
      },
      */
      parameters: credentials,
      onComplete: this.onResponse.bind(this, credentials, d),
      onError: this.onRequestFail.bind(this, credentials, d)
    });
    credentials = null;
    return d.promise;
  }
  AllexRemoteEnvironment.prototype.onResponse = function (credentials, defer, response) {
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
        execlib.execSuite.taskRegistry.run('acquireSink', {
          connectionString: 'ws://'+response.ipaddress+':'+response.port,
          session: response.session,
          onSink:this._onSink.bind(this, defer, response.session)
        });
      } catch(e) {
        console.error('problem with', response);
        console.error(e.stack);
        console.error(e);
        //error handling
      }
    } else {
      this.giveUp(credentials, defer);
    }
    defer = null;
  };
  AllexRemoteEnvironment.prototype._onSink = function (defer, sessionid, sink) {
    if (!sink) {
      this.set('state', 'loggedout');
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
  AllexRemoteEnvironment.prototype.onRequestFail = function (credentials, d, reason) {
    this.set('error', reason);
    lib.runNext(this.sendRequest.bind(this, credentials, d), lib.intervals.Second);
  };
  AllexRemoteEnvironment.prototype.giveUp = function (credentials, defer) {
    this.credentialsForLogin = null;
    this.set('state', 'loggedout');
    this.storage.del('sessionid').then (
      defer.reject.bind(defer, new lib.JSONizingError('INVALID_LOGIN', credentials, 'Invalid'))
    );
  };
  AllexRemoteEnvironment.prototype.type = 'allexremote';



  return AllexRemoteEnvironment;

}

module.exports = createAllexRemoteEnvironment;
