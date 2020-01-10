function createBusyLogicCreator (execlib, dataSourceRegistry) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    _initialperiod = 10;

  function BusyLogic (datasource, trigger_changed_instead_set) {
    this.target = null;
    this.blocked = false;
    this.datasource = datasource;
    this._timer = null;
    this._period = _initialperiod;
    this._newrecords = 0;
    this._timeouttimestamp = 0;
    this._trigger_changed_instead_set = trigger_changed_instead_set;
  }

  BusyLogic.prototype.destroy = function () {
    this._trigger_changed_instead_set = null;
    this.blocked = false;
    if (this._timer) {
      lib.clearTimeout (this._timer);
    }
    this._timer = null;
    this.target = null;
    this.datasource = null;
  };

  BusyLogic.prototype.setTarget = function (target) {
    if (this._timer) {
      lib.clearTimeout(this._timer);
    }
    this.target = target;
    if (this.target) this.emitData();
  };

  BusyLogic.prototype.emitData = function () {
    if (this.blocked) return;
    if (!this._period) return;
    if (!this.target) throw new Error('No target and you want to emit data');
    //console.log('will emit busy true on', this.datasource.cnt, Date.now(), this.datasource.data.length);
    //this.target.set('busy', false);
    this._newrecords++;
    if (!this._timer) {
      this.createTimer();
    }
    //console.log(Date.now());
  };

  BusyLogic.prototype.createTimer = function () {
    this._period *= 2;
    if (this._period > lib.intervals.Second) {
      this.flush();
    }
    this._newrecords = 0;
    this._timer = lib.runNext (this._timerProc.bind(this), this._period);
  };

  BusyLogic.prototype._timerProc = function () {
    this._timer = null;
    if (this.blocked) return;
    if (!this._newrecords) {
      this.flush();
    } else {
      this.createTimer();
    }
  };

  BusyLogic.prototype.flush = function () {
    var ds = this.datasource.copyData();
    this._period = _initialperiod;
    if (!this._trigger_changed_instead_set || this.target.get('data') !== ds){
      this.target.set('data', ds);
    }else{
      this.target.changed.fire ('data', ds);
    }
    //console.log('will emit busy false on', this.datasource.cnt, Date.now(), ds.length);
    this.target.set('busy', false);
  };

  BusyLogic.prototype.block = function () {
    //console.log('about to block datasource emit', this.datasource.cnt);
    this.blocked = true;
    this.target.set('busy', true);
  };

  BusyLogic.prototype.unblock = function () {
    this.blocked = false;
  };

  BusyLogic.prototype.unblockAndFlush = function () {
    this.unblock();
    this.emitData();
  };

  dataSourceRegistry.register('busylogic', BusyLogic);
}

module.exports = createBusyLogicCreator;
