function createDataSourceRegistry (execlib) {
  'use strict';
  var DataSourceBase = require('./basecreator')(execlib),
    AllexState = require('./allexstatecreator')(execlib, DataSourceBase),
    AllexHash2Array = require('./allexhash2arraycreator')(execlib, AllexState),
    AllexDataQuery = require('./allexdataquerycreator')(execlib, DataSourceBase),
    JSArray = require('./jsarraycreator')(execlib, DataSourceBase);

  return {
    AllexState: AllexState,
    AllexHash2Array: AllexHash2Array,
    AllexDataQuery: AllexDataQuery,
    JSArray : JSArray
  };
}

module.exports = createDataSourceRegistry;
