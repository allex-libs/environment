lib.arryOperations = require('allex_arrayoperationslowlevellib')(
  lib.extend,
  lib.readPropertyFromDotDelimitedString,
  lib.isFunction,
  lib.Map,
  lib.AllexJSONizingError);

var desc = {
    type: 'allexremote',
    name: 'INDATA',
    options: {
      entrypoint: {
        //address: '192.168.1.111',
        address: 'fix.grodat.com',
        port: 8009 
      },
      datasources: [{
        name: 'fix_statii',
        type: 'allexhash2array',
        options: {
          sink: 'Fix',
          path: 'fix_statii'
        }
      },{
        name: 'name',
        type: 'allexstate',
        options: {
          sink: '.',
          path: 'profile_role'
        }
      }],
      commands: [
        {
          name: 'do_dispose',
          options : {
            sink : '.'
          }
        },
        {
          name : 'login',
          options : {
            //TODO
          }
        },
        {
          name: 'establishSession',
          options: {
            sink: 'Fix',
            name: 'establishFixSession'
          }
        }
      ]
    }
  };

describe('Testing the environments', function () {
  it ('Create lib', function () {
    this.timeout(1e42);
    return setGlobal('factory', require('../src/')(execlib));
  });
  it ('Remote connectivity', function (done) {
    this.timeout(1e42);
    var env = factory(desc);
    env.attachListener('state', function (){
      console.log('state changed', arguments);
    });
    qlib.promise2console(env.login({
      'username': 'indata',
      'password': '123'
    }), 'login').then(
    );
    /*
    env.go().then(function (env) {
      console.log('Remote environment', env);
      done();
      done = null;
    });
    */
  });
  /*
  it ('Remote data source', function (done) {
    var env = factory(desc);
    env.go().then(onEnvironment);
    function onEnvironment(env) {
      console.log(env.dataSources.get('fix_statii'));
      onName(env.dataSources.get('fix_statii'));
    }
    function onName(ds) {
      //done();
      //done = null;
    }
  });
  */
});
