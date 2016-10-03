function createEnvironmentBase (execlib, leveldblib) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    Configurable = lib.Configurable,
    ChangeableListenable = lib.ChangeableListenable;

  function InMemStorage () {
    this.map = new lib.Map();
  }
  InMemStorage.prototype.destroy = function () {
    if (this.map) {
      this.map.destroy();
    }
    this.map = null;
  };
  InMemStorage.prototype.put = function (name, val) {
    this.map.replace(name, val);
    return q(val);
  }
  InMemStorage.prototype.get = function (name) {
    return q(this.map.get(name));
  };

  function EnvironmentBase (config) {
    ChangeableListenable.call(this);
    Configurable.call(this, config);
    this.storages = new lib.DIContainer();
    this.dataSources = new lib.DIContainer();
    this.commands = new lib.Map();
    this.state = null;
    this.error = null;
    if (config && lib.isArray(config.storages)) {
      config.storages.forEach(this.createStorage.bind(this));
    }
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
      dcs = this.getConfigVal('datacommands'),
      promises = [];
    this.set('error', null);
    if (lib.isArray(ds)) {
      promises = promises.concat(ds.map(this.toDataSource.bind(this)));
    }
    if (lib.isArray(cs)) {
      promises = promises.concat(cs.map(this.toCommand.bind(this)));
    }
    if (lib.isArray(dcs)) {
      promises = promises.concat(dcs.map(this.toDataCommand.bind(this)));
    }
    return q.all(promises);
  };

  EnvironmentBase.prototype.isEstablished = function () { return this.state === 'established';}
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
    var oldc = this.commands.replace(desc.name, this.createCommand(desc.options));
    if (oldc) {
      oldc.destroy();
    }
    return q(true);
  };
  EnvironmentBase.prototype.toDataCommand = function (desc) {
    if (!desc.name) {
      throw new lib.JSONizingError('NO_COMMAND_NAME', desc, 'No name:');
    }
    return this.toDataSource({
      name: desc.name,
      type: 'commandwaiter',
      options: {}
    }).then(
      this.onDataSourceForDataCommand.bind(this, desc)
    );
  };
  EnvironmentBase.prototype.onDataSourceForDataCommand = function (desc, waiter) {
    desc.options = desc.options || {};
    desc.options.waiter = waiter;
    return this.toCommand(desc);
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
  EnvironmentBase.prototype.createStorage = function (storagename) {
    var s = this.storages.get(storagename), d;
    if (s) {
      return q(s);
    }
    d = q.defer();
    d.promise.then(this.onStorage.bind(this, storagename), this.onNoStorage.bind(this, storagename));
    new leveldblib.LevelDBHandler({
      starteddefer:d,
      maxretries:3,
      dbname: storagename,
      dbcreationoptions: {
        valueEncoding: 'json'
      }
    });
    return this.storages.waitFor(storagename);
  };
  EnvironmentBase.prototype.onStorage = function (storagename, storage) {
    this.storages.register(storagename, storage);
    return storage;
  };
  EnvironmentBase.prototype.onNoStorage = function (storagename, reason) {
    var storage = new InMemStorage();
    this.storages.register(storagename, storage);
    return storage;
  };
  EnvironmentBase.prototype.putToStorage = function (storagename, key, value) {
    return this.storages.waitFor(storagename).then(function (storage) {
      var ret = storage.put(key, value);
      key = null;
      value = null;
      return ret;
    });
  };
  EnvironmentBase.prototype.getFromStorage = function (storagename, key) {
    return this.storages.waitFor(storagename).then(function (storage) {
      var ret = storage.get(key);
      key = null;
      return ret;
    });
  };
  EnvironmentBase.prototype.getFromStorageSafe = function (storagename, key, deflt) {
    return this.storages.waitFor(storagename).then(function (storage) {
      var ret = storage.safeGet(key, deflt);
      key = null;
      deflt = null;
      return ret;
    });
  };
  EnvironmentBase.prototype.delFromStorage = function (storagename, key) {
    return this.storages.waitFor(storagename).then(function (storage) {
      var ret = storage.del(key);
      key = null;
      return ret;
    });
  };
  EnvironmentBase.prototype.DEFAULT_CONFIG = lib.dummyFunc;

  return EnvironmentBase;
}

module.exports = createEnvironmentBase;
