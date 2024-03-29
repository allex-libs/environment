function createLetMeInJob (execlib, mylib) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    qlib = lib.qlib,
    EntryPointCallerJob = mylib.EntryPointCallerJob;

  function LetMeInJob (env, urlmaker, heartbeat, credentials, entrypointmethod, defer) {
    EntryPointCallerJob.call(this, env, urlmaker, credentials, entrypointmethod, defer);
    this.heartbeat = heartbeat;
  }
  lib.inherit(LetMeInJob, EntryPointCallerJob);
  LetMeInJob.prototype.destroy = function () {
    this.heartbeat = null;
    EntryPointCallerJob.prototype.destroy.call(this);
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
    this.doTheCall();
    lib.runNext(this.onStale.bind(this), 10*this.heartbeat);
  };

  LetMeInJob.prototype.onStale = function () {
    this.reject(new lib.Error('STALE_LET_ME_IN_REQUEST', 'Stale request'));
  };

  mylib.LetMeInJob = LetMeInJob;
}
module.exports = createLetMeInJob;
