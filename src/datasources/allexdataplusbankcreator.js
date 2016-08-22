function createAllexDataPlusBankDataSource(execlib, DataSourceTaskBase) {
  'use strict';

  var lib = execlib.lib,
    taskRegistry = execlib.execSuite.taskRegistry,
    q = lib.q;

  function AllexDataPlusBank (sinks, options) {
    if (!sinks.hasOwnProperty('data')) {
      throw new lib.Error('NO_DATA_SINK_IN_SINKS');
    }
    if (!sinks.hasOwnProperty('bank')) {
      throw new lib.Error('NO_BANK_SINK_IN_SINKS');
    }
    if (!options.hasOwnProperty('primarykey')) {
      throw new lib.Error('NO_PRIMARYKEY_IN_OPTIONS');
    }
    DataSourceTaskBase.call(this,sinks.data, options);
    this.banksink = sinks.bank;
    this.pk = options.primarykey;
    this.balancename = options.balancename || 'balance';
    this.data = [];
    this.accounts = new lib.Map();
  }
  lib.inherit(AllexDataPlusBank, DataSourceTaskBase);
  AllexDataPlusBank.prototype.destroy = function () {
    if (this.accounts) {
      this.accounts.destroy();
    }
    this.accounts = null;
    this.data = null;
    this.balancename = null;
    this.pk = null;
    this.banksink = null;
    DataSourceTaskBase.prototype.destroy.call(this);
  };
  AllexDataPlusBank.prototype._doStartTask = function (tasksink) {
    var fire_er = this.fire.bind(this);
    this.task = taskRegistry.run('materializeQuery', {
      sink: tasksink,
      data: this.data,
      onInitiated: fire_er,
      onNewRecord: fire_er,
      onDelete: fire_er,
      onUpdate: fire_er,
      continuous: true
    });
    return this.banksink.waitForSink().then(
      this.onBankSink.bind(this)
    );
  };
  AllexDataPlusBank.prototype.onBankSink = function (banksink) {
    banksink.consumeChannel('b', this.onBalance.bind(this));
    banksink.sessionCall('hook', {scan: true, accounts: ['***']});
    return q.resolve(true);
  };
  AllexDataPlusBank.prototype.fire = function () {
    this.accounts.traverse(this.accounter.bind(this));
    this.target.set('data', this.data.slice());
  };
  AllexDataPlusBank.prototype.onBalance = function (userbalancearry) {
    this.accounts.replace(userbalancearry[0], userbalancearry[1]);
    this.accounter(userbalancearry[1], userbalancearry[0]);
    this.target.set('data', this.data.slice());
  };
  AllexDataPlusBank.prototype.accounter = function (balance, pk) {
    var data = this.data, dl = data.length, i, d;
    for (i=0; i<dl; i++) {
      d = data[i];
      if (d[this.pk] === pk) {
        d[this.balancename] = balance;
        return;
      }
    }
  };

  return AllexDataPlusBank;
}

module.exports = createAllexDataPlusBankDataSource;
