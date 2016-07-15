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
    d.promise.then(this.onStorage.bind(this));
    this.set('state', 'pending');
    this.storage = new leveldblib.LevelDBHandler({
      starteddefer:d,
      dbname: 'remoteenvironmentstorage'
    });
  }
  lib.inherit(AllexRemoteEnvironment, AllexEnvironment);
  AllexRemoteEnvironment.prototype.destroy = function () {
    if (this.userRepresentation) {
      this.userRepresentation.destroy();
    }
    this.userRepresentation = null;
  };
  AllexRemoteEnvironment.prototype.onStorage = function () {
    this.storage.get('sessionid').then(
      this.onSessionId.bind(this),
      this.set.bind(this, 'state', 'loggedout')
    );
  };
  AllexRemoteEnvironment.prototype.onSessionId = function (sessionid) {
    console.log('sessionid', sessionid);
  };
  AllexRemoteEnvironment.prototype.login = function (credentials) {
    if (this.userRepresentation) {
      this.userRepresentation.destroy();
    }
    this.userRepresentation =new UserRepresentation();
    return execlib.loadDependencies('client', [
      '.',
      'allex:users'
    ], this.sendRequest.bind(this, credentials));
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
      parameters: {
        username: credentials.username,
        password: credentials.password
      },
      onComplete: this.onResponse.bind(this, d),
      onError: this.onRequestFail.bind(this, credentials, d)
    });
    credentials = null;
    return d.promise;
  }
  AllexRemoteEnvironment.prototype.onResponse = function (defer, response) {
    ///TODO: raspraviti ...

    if (!response) {
      //error handling
    }
    if ('data' in response){
      response = response.data;
    }
    if ('response' in response) {
      response = response.response;
    }

    if (response) {
      try {
        var response = JSON.parse(response);
        execlib.execSuite.taskRegistry.run('acquireSink', {
          connectionString: 'ws://'+response.ipaddress+':'+response.port,
          session: response.session,
          onSink:this._onSink.bind(this, defer)
        });
      } catch(e) {
        console.error('problem with', response);
        console.error(e.stack);
        console.error(e);
        //error handling
      }
    }
  };
  AllexRemoteEnvironment.prototype._onSink = function (defer, sink) {
    console.log('_onSink');
    execlib.execSuite.taskRegistry.run('acquireUserServiceSink', {
      sink: sink,
      cb: this._onAcquired.bind(this, defer)
    });
  };
  AllexRemoteEnvironment.prototype._onAcquired = function (defer, sink) {
    this.userRepresentation.setSink(sink);
    //console.log(this.userRepresentation);
    return qlib.promise2defer(this.set('state', 'established'), defer);
  };
  AllexRemoteEnvironment.prototype.onRequestFail = function (credentials, d, reason) {
    this.set('error', reason);
    lib.runNext(this.sendRequest.bind(this, credentials, d), lib.intervals.Second);
  };
  AllexRemoteEnvironment.prototype.type = 'allexremote';



  return AllexRemoteEnvironment;

}

module.exports = createAllexRemoteEnvironment;
