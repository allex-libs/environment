function createDataSourceRegistry (execlib, DataSourceRegistry) {
  'use strict';
  var ret = new DataSourceRegistry();
  require('./busylogic')(execlib, ret);
  require('./hash2arraymixincreator')(execlib, ret);
  require('./basecreator')(execlib, ret);
  require('./localhash2arraycreator')(execlib, ret);
  require('./jsdatacreator')(execlib, ret);
  require('./allexcommanddatawaitercreator')(execlib, ret);
  require('./sinkbasecreator')(execlib, ret);
  require('./taskbasecreator')(execlib, ret);
  require('./allexstatecreator')(execlib, ret);
  require('./allexhash2arraycreator')(execlib, ret);
  require('./allexdataquerycreator')(execlib, ret);
  require('./allexdataplusleveldbcreator')(execlib, ret);
  require('./allexleveldbcreator')(execlib, ret);
  require('./allexdataplusdatacreator.js')(execlib, ret);

  return ret;
}

module.exports = createDataSourceRegistry;
