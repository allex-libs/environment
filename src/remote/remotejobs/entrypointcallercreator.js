function createEntryPointCallerJob (lib, mylib) {
  'use strict';

  var q = lib.q,
    qlib = lib.qlib,
    JobOnEnvironment = mylib.JobOnEnvironment;

  function EntryPointCallerJob (env, protocolsecurer, credentials, entrypointmethod, defer) {
    JobOnEnvironment.call(this, env, defer);
    this.protocolsecurer = protocolsecurer;
    this.credentials = credentials;
    this.entrypointmethod = entrypointmethod;
  }
  lib.inherit(EntryPointCallerJob, JobOnEnvironment);
  EntryPointCallerJob.prototype.destroy = function () {
    this.entrypointmethod = null;
    this.credentials = null;
    this.protocolsecurer = null;
    JobOnEnvironment.prototype.destroy.call(this);
  };

  EntryPointCallerJob.prototype.doTheCall = function (callobj) {
    var url = this.protocolsecurer('http')+'://'+this.destroyable.address+':'+this.destroyable.port+'/'+ (this.entrypointmethod || 'letMeIn');
    lib.request(url, {
      parameters: this.credentials,
      onComplete: this.onEntryPointResponse.bind(this),
      onError: this.reject.bind(this)
    });
  };
  EntryPointCallerJob.prototype.parseAndResolve = function (response) {
    try {
      this.resolve(JSON.parse(response));
    } catch (e) {
      console.error('problem with', response);
      console.error(e);
      this.reject(e);
    }
  };

  EntryPointCallerJob.prototype.onEntryPointResponse = function (response) {
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

  mylib.EntryPointCallerJob = EntryPointCallerJob;
}
module.exports = createEntryPointCallerJob;