function createDataSourceRegistry (execlib) {
  'use strict';
  var DataSourceBase = require('./basecreator')(execlib),
    DataSourceTaskBase = require('./taskbasecreator')(execlib, DataSourceBase),
    AllexState = require('./allexstatecreator')(execlib, DataSourceBase),
    AllexHash2Array = require('./allexhash2arraycreator')(execlib, AllexState),
    AllexDataQuery = require('./allexdataquerycreator')(execlib, DataSourceTaskBase),
    AllexDataPlusBank = require('./allexdataplusbankcreator')(execlib, DataSourceTaskBase),
    JSArray = require('./jsarraycreator')(execlib, DataSourceBase);

  return {
    AllexState: AllexState,
    AllexHash2Array: AllexHash2Array,
    AllexDataQuery: AllexDataQuery,
    AllexDataPlusBank: AllexDataPlusBank,
    JSArray : JSArray
  };
}

module.exports = createDataSourceRegistry;
