function createEnvironmentBase (execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    Configurable = lib.Configurable,
    ChangeableListenable = lib.ChangeableListenable;

  function EnvironmentBase (config) {
    ChangeableListenable.call(this);
    Configurable.call(this, config);
    this.dataSources = new lib.DIContainer();
    this.commands = new lib.Map();
    this.state = null;
    this.error = null;
  }
  ChangeableListenable.addMethods(EnvironmentBase);
  lib.inherit(EnvironmentBase, ChangeableListenable);
  Configurable.addMethods(EnvironmentBase);
  EnvironmentBase.prototype.destroy = function () {
    this.error = null;
    this.state = null;
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
      return false;
    }
    if (state === 'established') {
      return this.onEstablished().then(
        this.onEstablishedDone.bind(this, state)
      );
    } else {
      this.onDeEstablished();
    }
    this.state = state;
    return true;
  };
  EnvironmentBase.prototype.onEstablishedDone = function (state) {
    this.state = state;
    return q(true);
  };
  EnvironmentBase.prototype.onEstablished = function () {
    var ds = this.getConfigVal('datasources'),
      cs = this.getConfigVal('commands'),
      promises = [];
    this.set('error', null);
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
    var ret;
    if (!desc.name) {
      throw new lib.JSONizingError('NO_DATASOURCE_NAME', desc, 'No name:');
    }
    if (!desc.type) {
      throw new lib.JSONizingError('NO_DATASOURCE_TYPE', desc, 'No type:');
    }
    if (!this.dataSources.busy(desc.name)) {
      ret = this.dataSources.waitFor(desc.name);
      this.createDataSource(desc.type, desc.options).then(
        this.onDataSourceCreated.bind(this, desc)
      );
    }
    return ret || this.dataSources.waitFor(desc.name);
  };
  EnvironmentBase.prototype.onDataSourceCreated = function (desc, ds) {
    this.dataSources.register(desc.name, ds);
    return q(ds);
  };
  EnvironmentBase.prototype.toCommand = function (desc) {
    if (!desc.name) {
      throw new lib.JSONizingError('NO_COMMAND_NAME', desc, 'No name:');
    }
    this.dataSources.add(desc.name, this.createCommand(desc.options));
  };
  function unregisterer(dss, ds, dsname) {
    dss.unregisterDestroyable(dsname);
  }
  EnvironmentBase.prototype.onDeEstablished = function () {
    var dss = this.dataSources;
    if (dss) {
      dss.traverse(unregisterer.bind(null, dss));
    }
  };
  EnvironmentBase.prototype.DEFAULT_CONFIG = lib.dummyFunc;

  return EnvironmentBase;
}

module.exports = createEnvironmentBase;
