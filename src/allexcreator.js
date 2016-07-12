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
      throw new lib.JSONizingError('NO_SINK_DESCRIPTION', options, 'No sink description:');
    }
    return this.findSink(options.sink).then(
      this.onSinkForCreateDataSource.bind(this, type, options)
    );
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
  };

  return AllexEnvironment;
}

module.exports = createAllexEnvironment;
