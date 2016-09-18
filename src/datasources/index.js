function createDataSourceRegistry (execlib) {
  'use strict';
  var DataSourceBase = require('./basecreator')(execlib),
    DataSourceTaskBase = require('./taskbasecreator')(execlib, DataSourceBase),
    AllexState = require('./allexstatecreator')(execlib, DataSourceBase),
    AllexHash2Array = require('./allexhash2arraycreator')(execlib, AllexState),
    AllexDataQuery = require('./allexdataquerycreator')(execlib, DataSourceTaskBase),
    AllexDataPlusLevelDB = require('./allexdataplusleveldbcreator')(execlib, DataSourceTaskBase),
    AllexDataPlusBank = require('./allexdataplusbankcreator')(execlib, AllexDataPlusLevelDB),
    JSData = require('./jsdatacreator')(execlib, DataSourceBase),
    AllexCommandDataWaiter = require('./allexcommanddatawaitercreator')(execlib, JSData);

  return {
    AllexState: AllexState,
    AllexHash2Array: AllexHash2Array,
    AllexDataQuery: AllexDataQuery,
    AllexDataPlusLevelDB : AllexDataPlusLevelDB,
    AllexDataPlusBank: AllexDataPlusBank,
    JSData: JSData,
    AllexCommandDataWaiter: AllexCommandDataWaiter
  };
}

module.exports = createDataSourceRegistry;
