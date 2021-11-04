function createCheckSessionJob (lib, mylib) {
  'use strict';
  var q = lib.q,
    qlib = lib.qlib,
    JobOnEnvironment = mylib.JobOnEnvironment;

  function CheckSessionJob (env, remotestoragename, defer) {
    JobOnEnvironment.call(this, env, defer);
    this.remotestoragename = remotestoragename;
  }
  lib.inherit(CheckSessionJob, JobOnEnvironment);
  CheckSessionJob.prototype.destroy = function () {
    this.remotestoragename = null;
    JobOnEnvironment.prototype.destroy.call(this);
  };
  CheckSessionJob.prototype.go = function () {
    var ok = this.okToGo();
    if (!ok.ok) {
      return ok.val;
    }
    this.destroyable.set('state', 'pending');
    this.destroyable.getFromStorage(this.remotestoragename, 'sessionid').then(
      this.onSessionId.bind(this),
      this.onGetSessionIDFromStorageFailed.bind(this)
    );
    return ok.val;
  };
  CheckSessionJob.prototype.onSessionId = function (sessionid) {
    if (!this.okToProceed()) {
      return;
    }
    this.destroyable.sessionid = sessionid;
    if (!sessionid) {
      this.onGetSessionIDFromStorageFailed();
      return;
    }
    this.resolve(sessionid);
  };
  CheckSessionJob.prototype.onGetSessionIDFromStorageFailed = function () {
    if (!this.okToProceed()) {
      return;
    }
    this.destroyable.set('state', 'loggedout');
    this.reject(new lib.Error('NO_SESSION_ID'));
  };

  mylib.CheckSessionJob = CheckSessionJob;
}
module.exports = createCheckSessionJob;
