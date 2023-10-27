function createLocalEnvironment (execlib, environmentRegistry) {
  'use strict';
  var lib = execlib.lib,
    AllexEnvironment = environmentRegistry.get('allexbase');

  function AllexLocalEnvironment (options) {
    AllexEnvironment.call(this, options);
    this.state = 'established';
  }
  lib.inherit(AllexLocalEnvironment, AllexEnvironment);
  environmentRegistry.register('allexlocal', AllexLocalEnvironment);
}
module.exports = createLocalEnvironment;