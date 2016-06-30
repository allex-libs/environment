var expect = require('chai').expect,
  execlib = require('allex'),
  factory = require('../src/')(execlib),
  desc = {
    type: 'allexremote',
    name: 'INDATA',
    options: {
      entrypoint: {
        address: '192.168.1.111',
        port: 8008,
        identity: {
          'username': 'indata',
          'password': '123'
        } 
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
  it ('Remote connectivity', function (done) {
    var env = factory(desc);
    env.go().then(function (env) {
      console.log('Remote environment', env);
      done();
      done = null;
    });
  });
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
});
