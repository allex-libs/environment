function createLetMeInJob (execlib, mylib) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    qlib = lib.qlib,
    JobOnEnvironment = mylib.JobOnEnvironment;

  function LetMeInJob (env, protocolsecurer, heartbeat, credentials, entrypointmethod, defer) {
    JobOnEnvironment.call(this, env, defer);
    this.protocolsecurer = protocolsecurer;
    this.heartbeat = heartbeat;
    this.credentials = credentials;
    this.entrypointmethod = entrypointmethod;
  }
  lib.inherit(LetMeInJob, JobOnEnvironment);
  LetMeInJob.prototype.destroy = function () {
    this.entrypointmethod = null;
    this.credentials = null;
    this.heartbeat = null;
    this.protocolsecurer = null;
    JobOnEnvironment.prototype.destroy.call(this);
  };
  LetMeInJob.prototype.go = function () {
    var ok = this.okToGo();
    if (!ok.ok) {
      return ok.val;
    }
    if (!this.credentials) {
      this.reject(new lib.Error('CANNOT_LOGIN', 'Cannot login without credentials'));
      return ok.val;
    }
    this.destroyable.recreateUserRepresentation();
    execlib.loadDependencies('client', [
      '.',
      'allex:hotel'
    ], qlib.executor(this.sendLetMeInRequest.bind(this)));
    return ok.val;
  };
  LetMeInJob.prototype.sendLetMeInRequest = function () {
    if (!this.okToProceed()) {
      return;
    }
    lib.request(this.protocolsecurer('http')+'://'+this.destroyable.address+':'+this.destroyable.port+'/'+ (this.entrypointmethod || 'letMeIn'), {
      parameters: this.credentials,
      onComplete: this.onLetMeInResponse.bind(this),
      onError: this.reject.bind(this)
    });
    lib.runNext(this.onStale.bind(this), 10*this.heartbeat);
  };
  LetMeInJob.prototype.onLetMeInResponse = function (response) {
    if (!this.okToProceed()) {
      return;
    }
    if (!response) {
      this.resolve(null);
      return;
    }
    if ('data' in response) {
      this.parseAndResolve(response.data);
      return;
    }
    if ('response' in response) {
      this.parseAndResolve(response.response);
      return;
    }
    this.resolve(response);
  };
  LetMeInJob.prototype.parseAndResolve = function (response) {
    try {
      this.resolve(JSON.parse(response));
    } catch (e) {
      console.error('problem with', response);
      console.error(e);
      this.reject(e);
    }
  };
  LetMeInJob.prototype.onStale = function () {
    this.reject(new lib.Error('STALE_LET_ME_IN_REQUEST', 'Stale request'));
  };

  mylib.LetMeInJob = LetMeInJob;
}
module.exports = createLetMeInJob;
