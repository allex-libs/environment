function createHash2ArrayMixin (execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib;


  function Hash2ArrayMixin (options) {
    this.columnnames = options.columnnames;
  }
  Hash2ArrayMixin.prototype.destroy = function () {
    this.columnnames = null;
  };
  Hash2ArrayMixin.prototype.packHash2Array = function (hash) {
    var ret = [], _r = ret;
    lib.traverseShallow(hash, packer.bind(null, this.columnnames, _r));
    _r = null;
    return ret;
  };
  Hash2ArrayMixin.addMethods = function (klass) {
    lib.inheritMethods(klass, Hash2ArrayMixin
      ,'packHash2Array'
    );
  };

  function packer (colnames, arry, thingy, pk) {
    var record = [pk];
    if (lib.isArray(colnames) && colnames.length) {
      colnames.reduce(recordpacker.bind(null, thingy), record);
    } else {
      record.push(thingy);
    }
    arry.push(record);
  }
  function recordpacker (obj, result, itemname) {
    if (obj && obj.hasOwnProperty && obj.hasOwnProperty(itemname)) {
      result.push(obj[itemname]);
    }
    return result;
  }

  dataSourceRegistry.register('hash2arraymixin', Hash2ArrayMixin);
}

module.exports = createHash2ArrayMixin;
