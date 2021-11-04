function createAcquireUserSinkJob (execlib, mylib) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    qlib = lib.qlib,
    JobOnEnvironment = mylib.JobOnEnvironment;

  function AcquireUserSinkJob (env, hotelsink, defer) {
    JobOnEnvironment.call(this, env, defer);
    this.hotelsink = hotelsink;
    this.task = null;
  }
  lib.inherit(AcquireUserSinkJob, JobOnEnvironment);
  AcquireUserSinkJob.prototype.destroy = function () {
    if (this.task) {
      this.task.destroy();
    }
    this.task = null;
    this.hotelsink = null;
    JobOnEnvironment.prototype.destroy.call(this);
  };
  AcquireUserSinkJob.prototype.go = function () {
    var ok = this.okToGo();
    if (!ok.ok) {
      return ok.val;
    }
    this.doDaAcquire();
    return ok.val;
  };
  AcquireUserSinkJob.prototype.doDaAcquire = function () {
    if (!this.okToProceed()) {
      return;
    }
    if (this.task) {
      this.task.destroy();
    }
    //will not report errors
    this.task = execlib.execSuite.taskRegistry.run('acquireUserServiceSink', {
      sink: this.hotelsink,
      cb: this.resolve.bind(this)
    });
  };

  mylib.AcquireUserSinkJob = AcquireUserSinkJob;
}
module.exports = createAcquireUserSinkJob;
