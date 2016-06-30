function createAllexHash2ArrayDataSource (execlib, AllexState) {
  'use strict';

  var lib = execlib.lib;

  function AllexHash2Array(sink, name) {
    AllexState.call(this, sink, name);
  }
  lib.inherit(AllexHash2Array, AllexState);

  return AllexHash2Array;
}

module.exports = createAllexHash2ArrayDataSource;
