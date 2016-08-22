function createDataSourceBase (execlib) {
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
    if (this.target) {
      throw new lib.Error('ALREADY_HAVE_TARGET', 'Already have a target');
    }
    this.target = target;
  };

  DataSourceBase.prototype.setFilter = function (filter) {
    this.filter = filter;
  };

  return DataSourceBase;
}

module.exports = createDataSourceBase;
