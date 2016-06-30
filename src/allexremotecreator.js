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
