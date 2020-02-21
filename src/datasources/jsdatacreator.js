function createJSDataDataSource(execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    qlib = lib.qlib,
    DataSourceBase = dataSourceRegistry.get('.'),
    BusyLogic = dataSourceRegistry.get('busylogic'),
    jobs = require('./persistablejobs')(lib);

  function JSData (options) {
    DataSourceBase.call(this, options);
    this._bl = new BusyLogic(this);
    this.persist = options.persist;
    this.data = null; //options ? options.data : null;
    this.envStorage = options ? options.env_storage : null;
    this.jobs = new qlib.JobCollection();
    this._fetchInitialData(options ? options.data : null);
  }
  lib.inherit (JSData, DataSourceBase);
  JSData.prototype.destroy = function () {
    if (this.jobs) {
      this.jobs.destroy();
    }
    this.jobs = null;
    this.envStorage = null;
    this.data = null;
    this.persist = null;
    if (this._bl) {
      this._bl.destroy();
    }
    this._bl = null;
    DataSourceBase.prototype.destroy.call(this);
  };

  JSData.prototype.setTarget = function (target) {
    DataSourceBase.prototype.setTarget.call(this, target);
    this._bl.setTarget(target);
    this.setData();
  };

  JSData.prototype.setData = function (data) {
    if (this.data === data) {
      return;
    }
    this.jobs.run('.', new jobs.SetDataJob(this, data));
  };

  JSData.prototype.copyData = function () {
    if (lib.isArray(this.data)) {
      return this.data.slice();
    }

    if (this.data instanceof Object){
      return lib.extend(lib.isArray(this.data) ? [] : {}, this.data);
    }

    return this.data;
  };

  JSData.prototype.processFetchedData = function (data) {
    return data;
  };

  JSData.prototype._fetchInitialData = function (dflt) {
    return this.jobs.run('.', new jobs.FetchInitialDataJob(this, dflt));
  };


  dataSourceRegistry.register('jsdata', JSData);
}

module.exports = createJSDataDataSource;
