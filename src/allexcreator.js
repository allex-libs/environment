function createAllexEnvironment (execlib, environmentRegistry, CommandBase) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    EnvironmentBase = environmentRegistry.get('.');

  function LocalCommand (options) {
    if (!(options && lib.isFunction(options.func))) {
      throw new Error('options for the LocalCommand ctor must be a hash with the "func" property - that IsA Function');
    }
    CommandBase.call(this);
    this.func = options.func;
  }
  lib.inherit(LocalCommand, CommandBase);
  LocalCommand.prototype.destroy = function () {
    this.func = null;
  };
  LocalCommand.prototype.doExecute = function (args) {
    if (!lib.isFunction(this.func)) {
      throw new Error (this.ctor.name+' lost its func, cannot execute');
    }
    var funcret = this.func.apply(null, args);
    if (q.isThenable(funcret)) {
      return funcret;
    }
    return q(funcret);
  };
  
  function AllexEnvironment (options) {
    EnvironmentBase.call(this, options);
  }
  lib.inherit (AllexEnvironment, EnvironmentBase);
  AllexEnvironment.prototype.createDataSource = function (type, options) {
    var ctor = this.getDataSourceCtor(type);
    if (!options || !options.sink && !options.sinks) {
      return this.createSinkLessSource (type, options);
    }
    if (options && options.sinks) {
      if (!ctor.IsMultiSink) {
        throw new Error('DataSource type '+type+' is not of a MultiSink type');
      }
      return this.createMultiSinkDataSource (ctor, options);
    }
    if (options && options.sink) {
      if (!ctor.IsSingleSink) {
        throw new Error('DataSource type '+type+' is not of a SingleSink type');
      }
      return this.findSink(options.sink).then(
        this.onSinkForCreateDataSource.bind(this, ctor, options)
      );
    }
    console.error(options);
    throw new Error('Malformed options for type '+type);
  };

  AllexEnvironment.prototype.createSinkLessSource = function (type, options) {
    var ctor;
    switch (type) {
      case 'jsdata': 
        break;
      case 'localhash2array': 
        break;
      case 'commandwaiter':
        break;
      default:
        throw new lib.Error('DATASOURCE_TYPE_NOT_APPLICABLE_TO_ALLEX_ENVIRONMENT', 'DataSource type '+type+' is not supported by createSinkLessSource');
    }
    ctor = this.getDataSourceCtor(type);

    return q (new ctor(options));
  };

  AllexEnvironment.prototype.onSinkForCreateDataSource = function (ctor, options, sink) {
    return q(new ctor(sink, options));
  };

  AllexEnvironment.prototype.sinkfinder = function (promises, sinks, sinkname, sinkreference) {
    var d = q.defer(), Err = lib.Error;
    this.findSink(sinkname).then(function (sink) {
      if (!sink) {
        console.error('Sink for createMultiSinkDataSource referenced as', sinkreference,'and name', sinkname, 'was not found');
        d.reject(new Err('SINK_NOT_FOUND_FOR_MULTISINK_DATASOURCE', 'Sink for createMultiSinkDataSource referenced as '+sinkreference+' was not found'));
      } else {
        sinks[sinkreference] = sink;
        d.resolve(true);
      }
      Err = null;
      sinks = null;
      sinkreference = null;
      d = null;
    });
    promises.push(d.promise);
  }

  AllexEnvironment.prototype.createMultiSinkDataSource = function (ctor, options) {
    var promises = [], sinks = {}, _p = promises, _s = sinks;
    lib.traverseShallow(options.sinks, this.sinkfinder.bind(this, _p, _s));
    _p = null;
    _s = null;
    return q.all(promises).then(this.onSinksReady.bind(this, ctor, sinks, options));
  };

  AllexEnvironment.prototype.onSinksReady = function (ctor, sinks, options) {
    return q(new ctor(sinks, options));
  };

  AllexEnvironment.prototype.createCommand = function (options) {
    var ctor;
    switch (options.type) {
      case 'local':
        ctor = LocalCommand;
        break;
      default: 
        throw new lib.Error('NOT_IMPLEMENTED_YET', options.type+' is not an applicable Command type for AllexEnvironment');
    }
    return new ctor(options.options);
  };

  environmentRegistry.register('allexbase', AllexEnvironment);
}

module.exports = createAllexEnvironment;
