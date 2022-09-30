function createCloneSessionJob (lib, mylib) {
  'use strict';

  var q = lib.q,
  qlib = lib.qlib,
  EntryPointCallerJob = mylib.EntryPointCallerJob;

  function CloneSessionJob (env, protocolsecurer, credentials, defer) {
    EntryPointCallerJob.call(this, env, protocolsecurer, credentials, 'cloneSession', defer);
  }
  lib.inherit(CloneSessionJob, EntryPointCallerJob);
  CloneSessionJob.prototype.go = function () {
    var ok = this.okToGo();
    if (!ok.ok) {
      return ok.val;
    }
    if (!this.credentials) {
      this.reject(new lib.Error('CANNOT_CLONESESSION', 'Cannot clone session without credentials'));
      return ok.val;
    }
    lib.runNext(this.doTheCall.bind(this));
    return ok.val;
  };

  mylib.CloneSessionJob = CloneSessionJob;
}
module.exports = createCloneSessionJob;