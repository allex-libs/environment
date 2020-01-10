function createAllexHash2ArrayDataSource (execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    Hash2ArrayMixin = dataSourceRegistry.get('hash2arraymixin'),
    AllexState = dataSourceRegistry.get('allexstate');

  function AllexHash2Array(sink, options) {
    AllexState.call(this, sink, options);
    Hash2ArrayMixin.call(this, options);
  }
  lib.inherit(AllexHash2Array, AllexState);
  AllexHash2Array.prototype.destroy = function () {
    Hash2ArrayMixin.prototype.destroy.call(this);
    AllexState.prototype.destroy.call(this);
  };
  Hash2ArrayMixin.addMethods(AllexHash2Array);
  AllexHash2Array.IsSingleSink = true;

  AllexHash2Array.prototype.onStateData = function (data) {
    if (!this.target) {
      console.log('no target? too bad for', data);
      return;
    }
    this.target.set('data', this.packHash2Array(data));
  };

  dataSourceRegistry.register('allexhash2array', AllexHash2Array);
}

module.exports = createAllexHash2ArrayDataSource;
