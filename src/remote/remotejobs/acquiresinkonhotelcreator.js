function createAcquireSinkOnHotelJob (execlib, mylib) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    qlib = lib.qlib,
    JobOnEnvironment = mylib.JobOnEnvironment;

  function AcquireSinkOnHotelJob (env, protocolsecurer, params, defer) {
    JobOnEnvironment.call(this, env, defer);
    this.protocolsecurer = protocolsecurer;
    this.params = params;
    this.task = null;
  }
  lib.inherit(AcquireSinkOnHotelJob, JobOnEnvironment);
  AcquireSinkOnHotelJob.prototype.destroy = function () {
    if (this.task) {
      this.task.destroy();
    }
    this.task = null;
    this.params = null;
    this.protocolsecurer = null;
    JobOnEnvironment.prototype.destroy.call(this);
  };
  AcquireSinkOnHotelJob.prototype.go = function () {
    var ok = this.okToGo();
    if (!ok.ok) {
      return ok.val;
    }
    this.doDaAcquire();
    return ok.val;
  };
  AcquireSinkOnHotelJob.prototype.doDaAcquire = function () {
    var protocol = this.protocolsecurer('http');
    if (this.task) {
      this.task.destroy();
    }

    this.task = execlib.execSuite.taskRegistry.run('acquireSink', {
      connectionString: protocol+'://'+this.params.ipaddress+':'+this.params.port,
      session: this.params.session,
      onSink: this.resolve.bind(this),
      onCannotConnect : this.reject.bind(this),
      onConnectionLost: this.reject.bind(this),
      singleshot: true
    });
  };

  mylib.AcquireSinkOnHotelJob = AcquireSinkOnHotelJob;
}
module.exports = createAcquireSinkOnHotelJob;
