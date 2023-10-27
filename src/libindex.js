function createEnvironmentFactory (execlib, leveldblib, UserRepresentation) {
  'use strict';
  var lib = execlib.lib,
    CommandBase = require('./commandbasecreator')(lib),
    registries = require('./registrycreator')(lib),
    DataSourceRegistry = registries.DataSourceRegistry,
    EnvironmentRegistry = registries.EnvironmentRegistry,
    dataSourceRegistry = require('./datasources')(execlib, DataSourceRegistry),
    environmentRegistry = new EnvironmentRegistry();

  
  require('./basecreator')(execlib, leveldblib, dataSourceRegistry, environmentRegistry);
  require('./allexcreator')(execlib, environmentRegistry, CommandBase);
  require('./local')(execlib, environmentRegistry);
  require('./remote')(execlib, environmentRegistry, UserRepresentation, CommandBase);


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
    /*
    switch (desc.type) {
      case 'allexremote' : return new AllexRemoteEnvironment (desc.options);
      case 'fromctor' : return createFromConstructor(desc.options.ctor, desc.options.options);
      default : throw new Error('Environment type '+desc.type+' not supported');
    }
    */
    if (desc.type === 'fromctor') {
      return createFromConstructor(desc.options.ctor, desc.options.options);
    }

    return new (environmentRegistry.get(desc.type))(desc.options);
  }
  environmentFactory.dataSourceRegistry = dataSourceRegistry;
  environmentFactory.environmentRegistry = environmentRegistry;
  environmentFactory.CommandBase = CommandBase;

  return environmentFactory;
}

module.exports = createEnvironmentFactory;
