function createEnvironmentBase (execlib, leveldblib, DataSourceRegistry, environmentRegistry) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    qlib = lib.qlib,
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
    this.jobs = new qlib.JobCollection();
    this.storages = new lib.DIContainer();
    this.dataSources = new lib.DIContainer();
    this.commands = new lib.DIContainer(); //lib.Map();
    this.state = null;
    this.error = null;
    this.operation = null;

    this.blockStorages = null;
    if (config) {
      if (lib.isString(config.blockStorages)) {
        this.blockStorages = blockStorages.split (',');
      }else{
        if (lib.isArray(config.blockStorages)){
          this.blockStorages = config.blockStorages;
        }
      }
      if (lib.isArray(config.storages)) {
        config.storages.forEach(this.createStorage.bind(this));
      }
    }
  }

  ChangeableListenable.addMethods(EnvironmentBase);
  lib.inherit(EnvironmentBase, ChangeableListenable);
  Configurable.addMethods(EnvironmentBase);
  EnvironmentBase.prototype.destroy = function () {
    this.blockStorages = null;
    this.operation = null;
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
    if (this.storages) {
      lib.containerDestroyAll(this.storages);
      this.storages.destroy();
    }
    this.storages = null;
    if (this.jobs) {
      this.jobs.destroy();
    }
    this.jobs = null;
    Configurable.prototype.destroy.call(this);
    ChangeableListenable.prototype.destroy.call(this);
  };

  EnvironmentBase.prototype.isStorageBlocked = function (storagename) {
    return this.blockStorages && this.blockStorages.indexOf(storagename) > -1;
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
  EnvironmentBase.prototype.addDataSources = function (dss) {
    if (!lib.isArray(dss)) {
      return q([]);
    }
    this.setConfigVal('datasources', (this.getConfigVal('datasources') || []).concat(dss), true);
    //if (this.state === 'established') {
      return q.all(dss.map(this.toDataSource.bind(this)));
    //}
    return q(true);
  };
  EnvironmentBase.prototype.addCommands = function (cs) {
    if (!lib.isArray(cs)) {
      return q([]);
    }
    this.setConfigVal('commands', (this.getConfigVal('commands') || []).concat(cs), true);
    //if (this.state === 'established') {
      return q.all(cs.map(this.toCommand.bind(this)));
    //}
    return q(true);
  };
  EnvironmentBase.prototype.addDataCommands = function (dcs) {
    if (!lib.isArray(dcs)) {
      return q([]);
    }
    this.setConfigVal('datacommands', (this.getConfigVal('datacommands') || []).concat(dcs), true);
    //if (this.state === 'established') {
      return q.all(dcs.map(this.toDataCommand.bind(this)));
    //}
    return q(true);
  };

  EnvironmentBase.prototype.isEstablished = function () { return this.state === 'established';}
  EnvironmentBase.prototype.toDataSource = function (desc) {
    if (!desc.name) {
      throw new lib.JSONizingError('NO_DATASOURCE_NAME', desc, 'No name:');
    }
    if (!desc.type) {
      throw new lib.JSONizingError('NO_DATASOURCE_TYPE', desc, 'No type:');
    }
    return this.dataSources.queueCreation(desc.name, this.createDataSource.bind(this, desc.type, desc.options, desc.name));
  };

  EnvironmentBase.prototype.onFailedToCreateDataSource = function (desc) {
    this.dataSources.register(desc.name, null);
    return q(null);
  };

  EnvironmentBase.prototype.onDataSourceCreated = function (desc, ds) {
    this.dataSources.register(desc.name, ds);
    return q(ds);
  };
  EnvironmentBase.prototype.toCommand = function (desc) {
    var opts, ret;
    if (!desc.name) {
      throw new lib.JSONizingError('NO_DATASOURCE_NAME', desc, 'No name:');
    }
    opts = desc.options;
    ret = this.commands.queueCreation(desc.name, this.createCommand.bind(this, opts));
    opts = null;
    return ret;
  };
  EnvironmentBase.prototype.toDataCommand = function (desc) {
    if (!desc.name) {
      throw new lib.JSONizingError('NO_COMMAND_NAME', desc, 'No name:');
    }
    return this.toDataSource({
      name: desc.name,
      type: 'commandwaiter',
      options: {data: desc.initialdata}
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
    var dss = this.dataSources, cmds = this.commands;
    if (dss) {
      dss.traverse(unregisterer.bind(null, dss));
    }
    if (cmds) {
      cmds.traverse(unregisterer.bind(null, cmds));
    }
    dss = null;
    cmds = null;
  };
  EnvironmentBase.prototype.getDataSourceCtor = function (name) { //throws
    return DataSourceRegistry.get(name);
  };
  EnvironmentBase.prototype.createStorage = function (storagename) {
    if (this.isStorageBlocked(storagename)) {
      ///TODO: check if this is correct ....
      return q.resolve (null);
    }
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
    if (this.isStorageBlocked(storagename)) {
      return q.resolve(null);
    }

    return this.storages.waitFor(storagename).then(function (storage) {
      var ret = storage.put(key, value);
      key = null;
      value = null;
      return ret;
    });
  };
  EnvironmentBase.prototype.getFromStorage = function (storagename, key) {
    if (this.isStorageBlocked(storagename)){
      return q.resolve(null);
    }

    return this.storages.waitFor(storagename).then(function (storage) {
      var ret = storage.get(key);
      key = null;
      return ret;
    });
  };
  EnvironmentBase.prototype.getFromStorageSafe = function (storagename, key, deflt) {
    if (this.isStorageBlocked(storagename)) {
      return q.resolve(null);
    }

    return this.storages.waitFor(storagename).then(function (storage) {
      var ret = storage.safeGet(key, deflt);
      key = null;
      deflt = null;
      return ret;
    });
  };
  EnvironmentBase.prototype.delFromStorage = function (storagename, key) {
    if (this.isStorageBlocked(storagename)) {
      return q.resolve(null);
    }

    return this.storages.waitFor(storagename).then(function (storage) {
      var ret = storage.del(key);
      key = null;
      return ret;
    });
  };
  EnvironmentBase.prototype.DEFAULT_CONFIG = lib.dummyFunc;

  environmentRegistry.register('.', EnvironmentBase);
}

module.exports = createEnvironmentBase;
