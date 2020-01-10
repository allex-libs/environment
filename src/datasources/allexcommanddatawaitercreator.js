function createAllexCommandDataWaiter(execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    JSData = dataSourceRegistry.get('jsdata');

  function AllexCommandDataWaiter (options) {
    options.data = [];
    JSData.call(this, options);
  }
  lib.inherit(AllexCommandDataWaiter, JSData);
  AllexCommandDataWaiter.prototype.appendRecord = function (record) {
    if (!lib.isArray(this.data)) {
      throw new lib.Error('DATA_NOT_AN_ARRAY');
    }
    this.data.push(record);
    this.setData();
  };

  dataSourceRegistry.register('commandwaiter', AllexCommandDataWaiter);
}

module.exports = createAllexCommandDataWaiter;
