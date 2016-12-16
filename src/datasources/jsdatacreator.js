function createJSDataDataSource(execlib, DataSourceBase, BusyLogic) {
  'use strict';

  var lib = execlib.lib;

  function JSData (options) {
    DataSourceBase.call(this, options);
    this._bl = new BusyLogic(this);
    this.data = options ? options.data : null;
  }
  lib.inherit (JSData, DataSourceBase);
  JSData.prototype.destroy = function () {
    this._bl.destroy();
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
      return lib.extend({}, this.data);
    }

    return this.data;
  };

  return JSData;
}

module.exports = createJSDataDataSource;
