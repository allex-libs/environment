function createDataSourceBase (execlib) {
  'use strict';

  var lib = execlib.lib;

  function DataSourceBase(options) {
    this.target = null;
  }
  DataSourceBase.prototype.destroy = function () {
    this.target = null;
  };
  DataSourceBase.prototype.setTarget = function (target) {
    if (this.target) {
      throw new lib.Error('ALREADY_HAVE_TARGET', 'Already have a target');
    }
    this.target = target;
  };

  return DataSourceBase;
}

module.exports = createDataSourceBase;
