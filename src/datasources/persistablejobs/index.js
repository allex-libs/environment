function createPersistableJobs (lib) {
  'use strict';

  var mylib = {};
  var q = lib.q,
    qlib = lib.qlib,
    JobOnDestroyableBase = qlib.JobOnDestroyableBase;

  function JobOnPersistable (persistable, defer) {
    JobOnDestroyableBase.call(this, persistable, defer);
  }
  lib.inherit(JobOnPersistable, JobOnDestroyableBase);
  JobOnPersistable.prototype._destroyableOk = function () {
    if (!this.destroyable) {
      return false;
    }
    if (!this.destroyable._bl) {
      return false;
    }
    return true;
  };

  function FetchInitialDataJob (persistable, deflt, defer) {
    JobOnPersistable.call(this, persistable, defer);
    this.deflt = deflt;
  }
  lib.inherit(FetchInitialDataJob, JobOnPersistable);
  FetchInitialDataJob.prototype.destroy = function () {
    this.deflt = null;
    JobOnPersistable.prototype.destroy.call(this);
  };
  FetchInitialDataJob.prototype.go = function () {
    var ok = this.okToGo();
    if (!ok.ok) {
      return ok.val;
    }
    this.fetchResult().then(
      this.onFetchResult.bind(this),
      this.reject.bind(this)
    );
    return ok.val;
  };
  FetchInitialDataJob.prototype.onFetchResult = function (res) {
    if (!this.okToProceed()) {
      return;
    }
    qlib.thenAny(this.destroyable.processFetchedData(res),
      this.onFetchedDataProcessed.bind(this),
      this.reject.bind(this)
    );
  };
  FetchInitialDataJob.prototype.onFetchedDataProcessed = function (data) {
    if (!this.okToProceed()) {
      return;
    }
    qlib.promise2defer(
      (new mylib.SetDataJob(this.destroyable, data)).go(),
      this
    );
  };
  FetchInitialDataJob.prototype.fetchResult = function () {
    if (!this.destroyable.persist) {
      return q(this.deflt);
    }
    if (!this.destroyable.envStorage) {
      return q(this.deflt);
    }
    if (!lib.isFunction(this.destroyable.envStorage.get)) {
      return q(this.deflt);
    }
    return this.destroyable.envStorage.get(this.deflt);
  };

  mylib.FetchInitialDataJob = FetchInitialDataJob;


  function SetDataJob (persistable, data, defer) {
    JobOnPersistable.call(this, persistable, defer);
    this.data = data;
  }
  lib.inherit(SetDataJob, JobOnPersistable);
  SetDataJob.prototype.destroy = function () {
    this.data = null;
    JobOnPersistable.prototype.destroy.call(this);
  };
  SetDataJob.prototype.go = function () {
    var ok = this.okToGo();
    if (!ok.ok) {
      return ok.val;
    }
    if (lib.isUndef(this.data)) {
      if (this.destroyable.target) {
        this.destroyable._bl.emitData();
      }
      lib.runNext(this.resolve.bind(this, this.data));
      return ok.val;
    }
    this.maybePersistData().then(
      this.setDataAfterMaybePersist.bind(this),
      this.reject.bind(this)
    );
    return ok.val;
  };
  SetDataJob.prototype.maybePersistData = function () {
    if (!this.destroyable.persist) {
      return q(this.data);
    }
    if (!this.destroyable.envStorage) {
      return q(this.data);
    }
    if (!lib.isFunction(this.destroyable.envStorage.put)) {
      return q(this.data);
    }
    return this.destroyable.envStorage.put(this.data).then(
      qlib.returner(this.data)
    );
  };

  SetDataJob.prototype.setDataAfterMaybePersist = function (data) {
    if (!this.okToProceed()) {
      return;
    }
    this.destroyable.data = data;
    if (this.destroyable.target) {
      this.destroyable._bl.emitData();
    }
    this.resolve(this.data);
  };

  mylib.SetDataJob = SetDataJob;

  return mylib;
}
module.exports = createPersistableJobs;
