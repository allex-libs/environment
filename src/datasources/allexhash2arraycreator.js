function createAllexHash2ArrayDataSource (execlib, AllexState) {
  'use strict';

  var lib = execlib.lib;

  function AllexHash2Array(sink, options) {
    AllexState.call(this, sink, options);
    this.columnnames = options.columnnames;
  }
  lib.inherit(AllexHash2Array, AllexState);
  function recordpacker (obj, result, itemname) {
    if (obj && obj.hasOwnProperty && obj.hasOwnProperty(itemname)) {
      result.push(obj[itemname]);
    }
    return result;
  }

  function packer (colnames, arry, thingy, pk) {
    var record = [pk];
    if (lib.isArray(colnames) && colnames.length) {
      colnames.reduce(recordpacker.bind(null, thingy), record);
    } else {
      record.push(thingy);
    }
    arry.push(record);
  }
  AllexHash2Array.prototype.onStateData = function (data) {
    if (!this.target) {
      console.log('no target? too bad for', data);
      return;
    }
    var ret = [];
    lib.traverseShallow(data, packer.bind(null, this.columnnames, ret));
    this.target.set('data', ret);
  };

  return AllexHash2Array;
}

module.exports = createAllexHash2ArrayDataSource;
