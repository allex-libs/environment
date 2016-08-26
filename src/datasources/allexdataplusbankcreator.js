function createAllexDataPlusBankDataSource(execlib, AllexDataPlusLevelDB) {
  'use strict';

  var lib = execlib.lib,
    taskRegistry = execlib.execSuite.taskRegistry,
    q = lib.q;

  function AllexDataPlusBank (sinks, options) {
    if (!sinks.hasOwnProperty('bank')) {
      throw new lib.Error('NO_BANK_SINK_IN_SINKS');
    }

    options.valuefilter = this._valuefilter.bind(this);
    options.valuename = options.balancename || 'balance';

    AllexDataPlusLevelDB.call(this, {
      data : sinks.data,
      leveldb : sinks.bank
    },options);
  }
  lib.inherit(AllexDataPlusBank, AllexDataPlusLevelDB);

  AllexDataPlusBank.prototype._valuefilter = function (val) {
    return val[0];
  };

  return AllexDataPlusBank;
}

module.exports = createAllexDataPlusBankDataSource;
