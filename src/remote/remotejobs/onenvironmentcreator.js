function createJobOnEnvironment (lib, mylib) {
  'use strict';
  var q = lib.q,
    qlib = lib.qlib,
    JobOnDestroyableBase = qlib.JobOnDestroyableBase;

  function JobOnEnvironment (env, defer) {
    JobOnDestroyableBase.call(this, env, defer);
  }
  lib.inherit(JobOnEnvironment, JobOnDestroyableBase);
  JobOnEnvironment.prototype._destroyableOk = function () {
    return (this.destroyable && this.destroyable.jobs);
  };

  mylib.JobOnEnvironment = JobOnEnvironment;
}
module.exports = createJobOnEnvironment;
