function createEnvironmentBase (execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    Configurable = lib.Configurable;

  function EnvironmentBase (config) {
    Configurable.call(this, config);
    this.dataSources = new lib.Map();
    this.commands = new lib.Map();
  }
  Configurable.addMethods(EnvironmentBase);
  EnvironmentBase.prototype.destroy = function () {
    if (this.commands) {
      lib.containerDestroyAll(this.commands);
      this.commands.destroy();
    }
    this.commands = null;
    if (this.dataSources) {
      lib.containerDestroyAll(this.dataSources);
      this.dataSources.destroy();
    }
    this.dataSources = null;
    Configurable.prototype.destroy.call(this);
  };
  EnvironmentBase.prototype.onEstablished = function () {
    var ds = this.getConfigVal('datasources'),
      cs = this.getConfigVal('commands'),
      promises = [];
    if (lib.isArray(ds)) {
      promises = promises.concat(ds.map(this.toDataSource.bind(this)));
    }
    /*
    if (lib.isArray(cs)) {
      promises = promises.concat(cs.map(this.toCommand.bind(this)));
    }
    */
    return q.all(promises).then(
      this.fireEstablished.bind(this)
    );
  };
  EnvironmentBase.prototype.toDataSource = function (desc) {
    if (!desc.name) {
      throw new lib.JSONizingError('NO_DATASOURCE_NAME', desc, 'No name:');
    }
    if (!desc.type) {
      throw new lib.JSONizingError('NO_DATASOURCE_TYPE', desc, 'No type:');
    }
    return this.createDataSource(desc.type, desc.options).then(
      this.onDataSourceCreated.bind(this, desc)
    );
  };
  EnvironmentBase.prototype.onDataSourceCreated = function (desc, ds) {
    this.dataSources.add(desc.name, ds);
  };
  EnvironmentBase.prototype.toCommand = function (desc) {
    if (!desc.name) {
      throw new lib.JSONizingError('NO_COMMAND_NAME', desc, 'No name:');
    }
    this.dataSources.add(desc.name, this.createCommand(desc.options));
  };
  EnvironmentBase.prototype.fireEstablished = function () {
    console.log('should fire established');
    return q(this);
  };
  EnvironmentBase.prototype.DEFAULT_CONFIG = lib.dummyFunc;

  return EnvironmentBase;
}

module.exports = createEnvironmentBase;
