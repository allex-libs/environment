function createLevelDBProxy (execlib) {
  'use strict';

  var lib = execlib.lib,
    HookCollection = lib.HookCollection;

  function Emitter (sink, channel, destroyed_listener) {
    this.hc = new HookCollection ();
    this.destroyed_listener = destroyed_listener;
    this.records = [];
    sink.consumeChannel(channel, this._onLeveldbdata.bind(this));

  }

  Emitter.prototype.destroy = function () {
    if (this.destroyed_listener) {
      this.destroyed_listener.destroy();
    }
    this.destroyed_listener = null;
    this.hc.destroy();
    this.hc = null;
    this.records = null;
  };

  Emitter.prototype._onLeveldbdata = function (record) {
    this.records.push (record);
    this.hc.fire(record);
  };

  Emitter.prototype.hook = function (cb) {
    this.hc.attach (cb);
  };

  Emitter.prototype.dump = function (cb) {
    for (var i = 0; i < this.records.length; i++) {
      cb(this.records[i]);
    }
  };

  function LevelDBChannelProxy () {
    this.map = new lib.Map ();
  }

  LevelDBChannelProxy.prototype.destroy = function () {
    this.map.destroy();
    this.map = null;
  };

  LevelDBChannelProxy.prototype.getEmiitterID = function (sink_name, channel) {
    return channel+'@@'+sink_name;
  };

  LevelDBChannelProxy.prototype.consumeChannel = function (name, sink, channel, cb) {
    var emitter = this.map.get(this.getEmiitterID(name, channel));
    if (!emitter) {
      emitter = new Emitter (sink, channel, sink.destroyed.attach(this._onSinkDestroyed.bind(this, name, channel)));
      this.map.add(this.getEmiitterID (name, channel), emitter);
    }else{
      emitter.dump(cb);
    }
    emitter.hook(cb);
  };

  LevelDBChannelProxy.prototype._onSinkDestroyed = function (name, channel) {
    var el = this.map.remove (this.getEmiitterID(name, channel));
    if (el) el.destroy();
  };

  return new LevelDBChannelProxy();
}

module.exports = createLevelDBProxy;
