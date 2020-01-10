function createRegistries (lib) {
  'use strict';

  var Map = lib.Map;

  function RegistryBase () {
    Map.call(this);
  }
  lib.inherit(RegistryBase, Map);
  RegistryBase.prototype.get = function (name) {
    var ret = Map.prototype.get.call(this, name);
    if (!lib.isFunction(ret)) {
      throw new Error(this.TypeName+' '+name+' is not registered');
    }
    return ret;
  };
  RegistryBase.prototype.register = function (name, ctor) {
    var typecheck, check;
    if (!lib.isFunction(ctor)) {
      throw new Error ('Cannot register a constructor under '+name+' if it is not a function');
    }
    try { check = this.get(name); } catch(ignore) {}
    if (check) {
      console.error(name, 'is already registered', check);
      throw new Error(this.TypeName+' '+name+' is already registered');
    }
    this.add(name, ctor);
  };

  function DataSourceRegistry () {
    RegistryBase.call(this);
  }
  lib.inherit(DataSourceRegistry, RegistryBase);
  DataSourceRegistry.prototype.TypeName = 'DataSource';

  function EnvironmentRegistry () {
    RegistryBase.call(this);
  }
  lib.inherit(EnvironmentRegistry, RegistryBase);
  EnvironmentRegistry.prototype.TypeName = 'Environment';

  return {
    DataSourceRegistry: DataSourceRegistry,
    EnvironmentRegistry: EnvironmentRegistry
  };
}

module.exports = createRegistries;
