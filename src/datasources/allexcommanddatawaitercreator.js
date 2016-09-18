function createAllexCommandDataWaiter(execlib, JSData) {
  'use strict';

  var lib = execlib.lib;

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

  return AllexCommandDataWaiter;
}

module.exports = createAllexCommandDataWaiter;
