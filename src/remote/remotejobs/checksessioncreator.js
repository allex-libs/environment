function createCheckSessionJob (lib, mylib) {
  'use strict';
  var q = lib.q,
    qlib = lib.qlib,
    JobOnEnvironment = mylib.JobOnEnvironment;

  function CheckSessionJob (env, remotestoragename, donttouchstate, defer) {
    JobOnEnvironment.call(this, env, defer);
    this.remotestoragename = remotestoragename;
    this.donttouchstate = donttouchstate;
  }
  lib.inherit(CheckSessionJob, JobOnEnvironment);
  CheckSessionJob.prototype.destroy = function () {
    this.donttouchstate = null;
    this.remotestoragename = null;
    JobOnEnvironment.prototype.destroy.call(this);
  };
  CheckSessionJob.prototype.go = function () {
    var ok = this.okToGo();
    if (!ok.ok) {
      return ok.val;
    }
    lib.runNext(this.fetchSessionId.bind(this));
    return ok.val;
  };
  CheckSessionJob.prototype.fetchSessionId = function () {
    var loc = window.location, params, sessionid;
    if (loc && loc.search) {
      params = new URLSearchParams(loc.search);
      sessionid = params.get('allexsessionid');
      if (sessionid) {
        this.onSessionId({sessionid: sessionid});
        return;
      }
      /*
      query = params.get('allexquery');
      if (query) {
        try {
          query = JSON.parse(decodeURI(loc.search));
        } catch (e) {
          query = '';
        }
      }
      */
    }
    if (!this.donttouchstate) {
      this.destroyable.set('state', 'pending');
    }
    this.destroyable.getFromStorage(this.remotestoragename, 'sessionid').then(
      this.onSessionId.bind(this),
      this.onGetSessionIDFromStorageFailed.bind(this)
    );
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
    if (!this.donttouchstate) {
      this.destroyable.set('state', 'loggedout');
    }
    this.reject(new lib.Error('NO_SESSION_ID'));
  };

  mylib.CheckSessionJob = CheckSessionJob;
}
module.exports = createCheckSessionJob;
