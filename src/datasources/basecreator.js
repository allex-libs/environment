function createDataSourceBase (execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib;

  function DataSourceBase(options) {
    this.target = null;
    this.filter = null;
  }

  DataSourceBase.prototype.destroy = function () {
    this.target = null;
    this.filter = null;
  };

  DataSourceBase.prototype.setTarget = function (target) {
    this.target = null;
    this.stop();
    if (!target) {
      return;
    }

    if (this.target && this.target != target) {
      throw new lib.Error('ALREADY_HAVE_TARGET', 'Already have a target');
    }
    this.target = target;
    this.start();
  };

  DataSourceBase.prototype.start = lib.dummyFunc;
  DataSourceBase.prototype.stop = lib.dummyFunc;


  DataSourceBase.prototype.setFilter = function (filter) {
    this.filter = filter;
  };

  dataSourceRegistry.register('.', DataSourceBase);
}

module.exports = createDataSourceBase;
