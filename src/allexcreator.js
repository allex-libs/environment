function createAllexEnvironment (execlib, dataSourceRegistry, EnvironmentBase) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q;
  
  function AllexEnvironment (options) {
    EnvironmentBase.call(this, options);
  }
  lib.inherit (AllexEnvironment, EnvironmentBase);
  AllexEnvironment.prototype.createDataSource = function (type, options) {
    if (!options.sink) {
      return this.createSinkLessSource (type, options);
    }
    return this.findSink(options.sink).then(
      this.onSinkForCreateDataSource.bind(this, type, options)
    );
  };

  AllexEnvironment.prototype.createSinkLessSource = function (type, options) {
    var ctor;
    switch (type) {
      case 'jsarray': {
        ctor = dataSourceRegistry.JSArray;
        break;
      }
      default:
        throw new lib.Error('DATASOURCE_TYPE_NOT_APPLICABLE_TO_ALLEX_ENVIRONMENT', type);
    }

    return q (new ctor(options));
  };

  AllexEnvironment.prototype.onSinkForCreateDataSource = function (type, options, sink) {
    var ctor;
    switch (type) {
      case 'allexstate':
        ctor = dataSourceRegistry.AllexState;
        break;
      case 'allexhash2array':
        ctor = dataSourceRegistry.AllexHash2Array;
        break;
      case 'allexdataquery':
        ctor = dataSourceRegistry.AllexDataQuery;
        break;
      default:
        throw new lib.Error('DATASOURCE_TYPE_NOT_APPLICABLE_TO_ALLEX_ENVIRONMENT', type);
    }
    return q(new ctor(sink, options));
  };
  AllexEnvironment.prototype.createCommand = function (options) {
    throw new lib.Error('NOT_IMPLEMENTED_YET', 'Base AllexEnvironment still has to come up with methods to implement sink calls');
    console.log('command options', options);
  };

  return AllexEnvironment;
}

module.exports = createAllexEnvironment;
