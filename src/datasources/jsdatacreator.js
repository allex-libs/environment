function createJSDataDataSource(execlib, DataSourceBase) {
  'use strict';

  var lib = execlib.lib;

  function JSData (options) {
    DataSourceBase.call(this, options);
    this.data = options ? options.data : null;
  }
  lib.inherit (JSData, DataSourceBase);
  JSData.prototype.destroy = function () {
    this.data = null;
    DataSourceBase.prototype.destroy.call(this);
  };

  JSData.prototype.setTarget = function (target) {
    DataSourceBase.prototype.setTarget.call(this, target);
    this.setData();
  };

  JSData.prototype.setData = function () {
    if (!this.target) {
      return;
    }
    if (lib.isArray(this.data)) {
      this.target.set('data', this.data.slice());
      return;
    }

    if (this.data instanceof Object){
      this.target.set('data', lib.extend({}, this.data));
      return;
    }
    this.target.set('data', this.data);
  };

  return JSData;
}

module.exports = createJSDataDataSource;
