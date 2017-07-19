function createLib (execlib) {
  return execlib.loadDependencies('client', ['allex_leveldblib', 'allex_userrepresentationlib'], createEnvironmentFactory.bind(null, execlib));
}

function createEnvironmentFactory (execlib, leveldblib, UserRepresentation) {
  'use strict';
  var dataSourceRegistry = require('./datasources')(execlib),
    EnvironmentBase = require('./basecreator')(execlib, leveldblib),
    AllexEnvironment = require('./allexcreator')(execlib, dataSourceRegistry, EnvironmentBase),
    AllexRemoteEnvironment = require('./allexremotecreator')(execlib, dataSourceRegistry, AllexEnvironment, UserRepresentation);

  function createFromConstructor (ctor, options) {
    if (lib.isFunction (ctor)) return new ctor (options);
    var _glob = 'undefined' === typeof(global) ? window : global,
      c = _glob[ctor];
    if (!lib.isFunction (c)) throw new Error ('Custom environment ctor '+ctor+' is not a function in a global namespace');
    var ret = new c(options);

    if (!(ret instanceof EnvironmentBase)) throw new Error('Creating an environment which is not instance of EnvironmentBase is not allowed');

    return ret;
  }

  function environmentFactory (desc) {
    switch (desc.type) {
      case 'allexremote' : return new AllexRemoteEnvironment (desc.options);
      case 'fromctor' : return createFromConstructor(desc.options.ctor, desc.options.options);
      default : throw new Error('Environment type '+desc.type+' not supported');
    }
  }

  return environmentFactory;
}

module.exports = createLib;
