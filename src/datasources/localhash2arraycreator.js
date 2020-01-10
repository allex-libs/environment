function createLocalHash2Array (execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    Hash2ArrayMixin = dataSourceRegistry.get('hash2arraymixin'),
    DataSourceBase = dataSourceRegistry.get('.'),
    BusyLogic = dataSourceRegistry.get('busylogic');

  function LocalHash2Array (options) {
    DataSourceBase.call(this, options);
    Hash2ArrayMixin.call(this, options);
    this._bl = new BusyLogic(this);
    this.data = this.packHash2Array(options ? options.data : {});
  }
  lib.inherit(LocalHash2Array, DataSourceBase);
  Hash2ArrayMixin.addMethods(LocalHash2Array);
  LocalHash2Array.prototype.destroy = function () {
    if (this._bl) {
      this._bl.destroy();
    }
    this._bl = null;
    this.data = null;
    Hash2ArrayMixin.prototype.destroy.call(this);
    DataSourceBase.prototype.destroy.call(this);
  };
  LocalHash2Array.prototype.setTarget = function (target) {
    DataSourceBase.prototype.setTarget.call(this, target);
    this._bl.setTarget(target);
    this.setData();
  };

  LocalHash2Array.prototype.setData = function (data) {
    if (arguments.length) {
      this.data = this.packHash2Array(data);
    }
    if (!this.target) {
      return;
    }
    this._bl.emitData();
  };
  LocalHash2Array.prototype.copyData = function () {
    if (lib.isArray(this.data)) {
      return this.data.slice();
    }

    if (this.data) {
      throw new Error('data of an instance of '+this.constructor.name+' has to be an array');
    }

    return this.data;
  };

  dataSourceRegistry.register('localhash2array', LocalHash2Array);
}

module.exports = createLocalHash2Array;
