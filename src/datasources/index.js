function createDataSourceRegistry (execlib) {
  'use strict';
  var DataSourceBase = require('./basecreator')(execlib),
    AllexState = require('./allexstatecreator')(execlib, DataSourceBase),
    AllexHash2Array = require('./allexhash2arraycreator')(execlib, AllexState);

  return {
    AllexState: AllexState,
    AllexHash2Array: AllexHash2Array
  };
}

module.exports = createDataSourceRegistry;
