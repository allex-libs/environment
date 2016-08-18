function createJSArrayDataSource(execlib, DataSourceBase) {
  'use strict';

  var lib = execlib.lib;

  function JSArray (options) {
    DataSourceBase.call(this, options);
    this.data = options.data;
  }
  lib.inherit (JSArray, DataSourceBase);
  JSArray.prototype.destroy = function () {
    this.data = null;
    DataSourceBase.prototype.destroy.call(this);
  };

  JSArray.prototype.setTarget = function (target) {
    DataSourceBase.prototype.setTarget.call(this, target);
    this.target.set('data', this.data.slice());
  };

  return JSArray;
}

module.exports = createJSArrayDataSource;
