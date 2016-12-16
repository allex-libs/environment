function createBusyLogicCreator (execlib) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q;

  function BusyLogic (datasource) {
    this.target = null;
    this.blocked = false;
    this.datasource = datasource;
    this._timer = null;
  }

  BusyLogic.prototype.destroy = function () {
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
    if (!this.target) throw new Error('No target and you want to emit data');
    if (this._timer) {
      lib.clearTimeout (this._timer);
      this._timer = null;
    }
    //console.log('will emit busy true on', this.datasource.cnt, Date.now(), this.datasource.data.length);
    this.target.set('busy', true);
    this._timer = lib.runNext (this._doActualDataEmit.bind(this), 500);
  };

  BusyLogic.prototype._doActualDataEmit = function () {
    this._timer = null;
    if (this.blocked) return;
    this.flush();
  };

  BusyLogic.prototype.flush = function () {
    var ds = this.datasource.copyData();
    this.target.set('data', ds);
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

  return BusyLogic;
}

module.exports = createBusyLogicCreator;
