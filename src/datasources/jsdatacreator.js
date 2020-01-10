function createJSDataDataSource(execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    DataSourceBase = dataSourceRegistry.get('.'),
    BusyLogic = dataSourceRegistry.get('busylogic');

  function JSData (options) {
    DataSourceBase.call(this, options);
    this._bl = new BusyLogic(this);
    this.data = options ? options.data : null;
  }
  lib.inherit (JSData, DataSourceBase);
  JSData.prototype.destroy = function () {
    if (this._bl) {
      this._bl.destroy();
    }
    this._bl = null;
    this.data = null;
    DataSourceBase.prototype.destroy.call(this);
  };

  JSData.prototype.setTarget = function (target) {
    DataSourceBase.prototype.setTarget.call(this, target);
    this._bl.setTarget(target);
    this.setData();
  };

  JSData.prototype.setData = function (data) {
    if (arguments.length) {
      this.data = data;
    }
    if (!this.target) {
      return;
    }
    this._bl.emitData();
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

  dataSourceRegistry.register('jsdata', JSData);
}

module.exports = createJSDataDataSource;
