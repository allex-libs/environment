function createRemoteJobs (execlib, mixins) {
  'use strict';

  var ret = {};
  require('./helpers')(execlib.lib, ret);
  require('./onenvironmentcreator')(execlib.lib, ret);
  require('./entrypointcallercreator')(execlib.lib, ret);
  require('./clonesessioncreator')(execlib.lib, ret);
  require('./checksessioncreator')(execlib.lib, ret);
  require('./letmeincreator')(execlib, ret);
  require('./logincreator')(execlib.lib, mixins, ret);
  require('./acquiresinkonhotelcreator')(execlib, ret);
  require('./acquireusersinkcreator')(execlib, ret);

  return ret;
}
module.exports = createRemoteJobs;
