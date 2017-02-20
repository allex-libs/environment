function createDataSourceRegistry (execlib) {
  'use strict';
  var BusyLogic = require('./busylogic')(execlib),
    DataSourceBase = require('./basecreator')(execlib),
    DataSourceSinkBase = require('./sinkbasecreator')(execlib, DataSourceBase),
    DataSourceTaskBase = require('./taskbasecreator')(execlib, DataSourceSinkBase),
    AllexState = require('./allexstatecreator')(execlib, DataSourceBase),
    AllexHash2Array = require('./allexhash2arraycreator')(execlib, AllexState),
    AllexDataQuery = require('./allexdataquerycreator')(execlib, DataSourceTaskBase, BusyLogic),
    AllexDataPlusLevelDB = require('./allexdataplusleveldbcreator')(execlib, DataSourceTaskBase, BusyLogic),
    AllexLevelDB = require('./allexleveldbcreator')(execlib, DataSourceTaskBase, BusyLogic),
    AllexDataPlusData = require('./allexdataplusdatacreator.js')(execlib, DataSourceBase, BusyLogic),
    JSData = require('./jsdatacreator')(execlib, DataSourceBase, BusyLogic),
    AllexCommandDataWaiter = require('./allexcommanddatawaitercreator')(execlib, JSData);

  return {
    AllexLevelDB : AllexLevelDB,
    AllexState: AllexState,
    AllexHash2Array: AllexHash2Array,
    AllexDataQuery: AllexDataQuery,
    AllexDataPlusLevelDB : AllexDataPlusLevelDB,
    AllexDataPlusData : AllexDataPlusData,
    JSData: JSData,
    AllexCommandDataWaiter: AllexCommandDataWaiter
  };
}

module.exports = createDataSourceRegistry;
