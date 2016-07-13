function createEnvironmentBase (execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    Configurable = lib.Configurable,
    ChangeableListenable = lib.ChangeableListenable;

  function EnvironmentBase (config) {
    ChangeableListenable.call(this);
    Configurable.call(this, config);
    this.dataSources = new lib.Map();
    this.commands = new lib.Map();
    this.state = null;
  }
  ChangeableListenable.addMethods(EnvironmentBase);
  lib.inherit(EnvironmentBase, ChangeableListenable);
  Configurable.addMethods(EnvironmentBase);
  EnvironmentBase.prototype.destroy = function () {
    if (this.established) {
      this.established.destroy();
    }
    this.established = null;
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
    ChangeableListenable.prototype.destroy.call(this);
  };
  EnvironmentBase.prototype.set_state = function (state) {
    if (this.state === state) {
      return;
    }
    if (state === 'established') {
      this.onEstablished();
    }
    this.state = state;
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
    return q.all(promises);
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
  EnvironmentBase.prototype.DEFAULT_CONFIG = lib.dummyFunc;

  return EnvironmentBase;
}

module.exports = createEnvironmentBase;
