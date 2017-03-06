function createUserRepresentation(execlib) {
  'use strict';
  var lib = execlib.lib,
    q = lib.q,
    execSuite = execlib.execSuite,
    taskRegistry = execSuite.taskRegistry,
    ADS = execSuite.ADS;

  function SinkActivationMonitor(defer){
    this.defer = defer;
    this.subinits = [];
    this.subdefers = [];
    this.sinksToWait = new lib.Map();
  }
  SinkActivationMonitor.prototype.destroy = function () {
    if (this.defer) {
      this.defer.resolve(null); //won't hurt if defer was already resolved/rejected
    }
    this.sinksToWait.destroy();
    this.sinksToWait = null;
    this.subdefers = null;
    this.subinits = null;
    this.defer = null;
  };
  SinkActivationMonitor.prototype.setup = function (subinit, name) {
    this.subinits.push(subinit);
    if (name) {
      this.sinksToWait.add(name, true);
    }
  };
  SinkActivationMonitor.prototype.resolve = function (result) {
    if (!this.defer) {
      return;
    }
    this.defer.resolve(result);
    this.destroy();
  };
  SinkActivationMonitor.prototype.reject = function (reason) {
    this.defer.reject(reason);
    this.destroy();
  };
  SinkActivationMonitor.prototype.run = function (sinkstate) {
    if(this.subinits.length){
      taskRegistry.run('acquireSubSinks',{
        state: sinkstate,
        subinits: this.subinits
      });
    }
    if (this.sinksToWait.count < 1) {
      this.resolve(0);
    }
  };
  SinkActivationMonitor.prototype.add = function (name, subsinkdefer) {
    if (this.sinksToWait.get(name)) {
      this.subdefers.push(subsinkdefer);
    }
    if(this.sinksToWait.count === this.subdefers.length){
      q.allSettled(this.subdefers).done(
        this.resolve.bind(this),
        this.reject.bind(this)
      );
    }
  };

  function StateEventConsumer (consumers, cb) {
    this.consumers = consumers;
    this.activatorreference = null;
    this.deactivatorreference = null;
    this.setterreference = null;
    this.rawsetterreference = null;
    if ('function' === typeof cb) {
      this.rawsetterreference = this.consumers.rawsetterhandlers.add(cb);
    }
  }
  StateEventConsumer.prototype.destroy = function () {
    if (!this.consumers) {
      return;
    }
    if (this.activatorreference) {
      this.consumers.activatorhandlers.removeOne(this.activatorreference);
    }
    this.activatorreference = null;
    if (this.deactivatorreference) {
      this.consumers.deactivatorhandlers.removeOne(this.deactivatorreference);
    }
    this.deactivatorreference = null;
    if (this.setterreference) {
      this.consumers.setterhandlers.removeOne(this.setterreference);
    }
    this.setterreference = null;
    if (this.rawsetterreference) {
      this.consumers.rawsetterhandlers.removeOne(this.rawsetterreference);
    }
    this.rawsetterreference = null;
  };

  function StateEventConsumers(stateeventconsumers, path) {
    lib.Destroyable.call(this);
    this.sec = stateeventconsumers;
    this.path = path;
    this.ads = null;
    this.activatorhandlers = new lib.SortedList();
    this.deactivatorhandlers = new lib.SortedList();
    this.setterhandlers = new lib.SortedList();
    this.rawsetterhandlers = new lib.SortedList();
    this.createADS();
  }
  lib.inherit(StateEventConsumers, lib.Destroyable);
  StateEventConsumers.prototype.__cleanUp = function () {
    if (!this.sec) {
      return;
    }
    if (!this.sec.consumers) {
      return;
    }
    this.sec.consumers.remove(this.path);
    lib.containerDestroyAll(this.activatorhandlers);
    this.activatorhandlers.destroy();
    this.activatorhandlers = null;
    lib.containerDestroyAll(this.deactivatorhandlers);
    this.deactivatorhandlers.destroy();
    this.deactivatorhandlers = null;
    lib.containerDestroyAll(this.setterhandlers);
    this.setterhandlers.destroy();
    this.setterhandlers = null;
    lib.containerDestroyAll(this.rawsetterhandlers);
    this.rawsetterhandlers.destroy();
    this.rawsetterhandlers = null;
    this.ads = null;
    this.path = null;
    this.sec = null;
    lib.Destroyable.prototype.__cleanUp.call(this);
  };
  StateEventConsumers.prototype.createADS = function () {
    if (this.ads) {
      this.ads.destroyed = null;
      this.ads.destroy();
    }
    this.ads = this.extendTo(ADS.listenToScalar([this.path], {
      activator: this._activated.bind(this),
      deactivator: this._deactivated.bind(this),
      setter: this._set.bind(this),
      rawsetter: this._setRaw.bind(this)
    }));
  };
  StateEventConsumers.prototype.add = function (cb) {
    return new StateEventConsumer(this, cb);
  };
  StateEventConsumers.prototype._activated = function () {
  };
  StateEventConsumers.prototype._deactivated = function () {
  };
  StateEventConsumers.prototype._set = function () {
  };
  StateEventConsumers.prototype._setRaw = function () {
    var args = arguments;
    this.rawsetterhandlers.traverse(function(cb){
      cb.apply(null,args);
    });
    args = null;
  };

  function StateEventConsumersListener(stateeventconsumerpack, listenerhash) {
    this.secp = stateeventconsumerpack;
    this.listeners = [];
    lib.traverseShallow(listenerhash, this.addConsumer.bind(this));
  }
  StateEventConsumersListener.prototype.destroy = function () {
    lib.arryDestroyAll(this.listeners);
    this.listeners = null;
  };
  StateEventConsumersListener.prototype.addConsumer = function (cb, path) {
    if (path.charAt(0) === '/'){
      path = path.substring(1);
    }
    var consumer = this.secp.consumers.get(path);
    if (!consumer) {
      consumer = new StateEventConsumers(this, path);
      this.secp.consumers.add(path, consumer);
      //secp allready attachedTo
      if(this.secp.sink && this.secp.sink.state){
        this.secp.sink.state.setSink(consumer.ads);
      }
    }
    this.listeners.push(consumer.add(cb));
  };

  function StateEventConsumerPack(listenerhash) {
    this.sink = null;
    this.consumers = new lib.Map();
    this.addConsumers(listenerhash);
  }
  StateEventConsumerPack.prototype.destroy = function () {
    if (!this.consumers) {
      return;
    }
    lib.containerDestroyAll(this.consumers);
    this.consumers.destroy();
    this.consumers = null;
    this.sink = null;
  };
  StateEventConsumerPack.prototype.addConsumers = function (listenerhash) {
    return new StateEventConsumersListener(this, listenerhash);
  };
  StateEventConsumerPack.prototype.attachTo = function (sink) {
    this.sink = sink;
    this.consumers.traverse(function(listeners, path){
      listeners.createADS();
      sink.state.setSink(listeners.ads);
    });
    sink = null;
  };

  function delSerializer(path, state, delitems, item, itemname) {
    state.data.add(itemname, item);
    delitems.push({
      p: path.concat(itemname),
      o: 'sr',
      d: item
    });
  }
  function DataPurger(state) {
    this.state = new execSuite.Collection();//new execSuite.StateSource();
    this._state = state;
    var path = []; 
    this.delitems = [];
    this._state.traverse(delSerializer.bind(null, path, this.state, this.delitems));
    if (this.delitems.length !== this._state.count) {
      throw new lib.Error('DELITEMS_CORRUPT', this.delitems.length+' !== '+this._state.count);
    }
    path = null;
  }
  DataPurger.prototype.destroy = function () {
    this.delitems = null;
    this._state = null;
    this.state.destroy();
    this.state = null;
  };
  DataPurger.prototype.run = function () {
    //console.log('running delitems', this.delitems);
    this.delitems.forEach(this.runItem.bind(this));
    if (this._state.count>0) {
      //console.log('_state is still not empty');
      throw new lib.Error('_STATE_STILL_NOT_EMPTY', this._state.count+' items in _state still exist');
    }
    lib.destroyASAP(this);
  };
  DataPurger.prototype.runItem = function (delitem) {
    this._state.remove(delitem.p[0]);
    this.state.handleStreamItem(delitem);
  };

  function SinkRepresentation(eventhandlers){
    this.sink = null;
    this.sinkDestroyedListener = null;
    this.state = new lib.ListenableMap();
    this.subsinks = {};
    this.stateEvents = new StateEventConsumerPack();
    this.eventHandlers = eventhandlers;
    this.connectEventHandlers(eventhandlers);
    this.sinkWaiters = new lib.DeferFifo();
  }
  SinkRepresentation.prototype.destroy = function () {
    //TODO: all the destroys need to be called here
    if (this.sinkWaiters) {
      this.sinkWaiters.destroy();
    }
    this.sinkWaiters = null;
    this.eventHandlers = null;
    if (this.stateEvents) {
      this.stateEvents.destroy();
    }
    this.stateEvents = null;
    this.subsinks = null;
    //console.log('destroying state');
    this.state.destroy();
    this.state = null;
    this.purgeSinkDestroyedListener();
    this.sink = null;
  };
  SinkRepresentation.prototype.waitForSink = function () {
    if (this.sink) {
      return q(this.sink);
    }
    if (this.sinkWaiters) {
      return this.sinkWaiters.defer();
    }
    return q(true);
  };
  function subSinkRepresentationPurger (subsink) {
    subsink.purge();
  }
  SinkRepresentation.prototype.purge = function () {
    //console.log('purging');
    lib.traverseShallow(this.subsinks,subSinkRepresentationPurger);
    //this.subsinks = {}; //this looks like a baad idea...
    this.purgeState();
  };
  SinkRepresentation.prototype.purgeState = function () {
    var dp = new DataPurger(this.state);
    this.stateEvents.attachTo(dp);
    dp.run();
    //delitems.forEach(this.onStream.bind(this));
  };
  SinkRepresentation.prototype.connectEventHandlers = function (eventhandlers) {
    if (!eventhandlers) {
      return;
    }
    try {
    if (eventhandlers.state) {
      this.stateEvents.addConsumers(eventhandlers.state);
    }
    } catch(e) {
      console.error(e.stack);
      console.error(e);
    }
  };
  SinkRepresentation.prototype.monitorDataForGui = function (cb) {
    console.error('monitorDataForGui has no implementation for now');
    return null;
  };
  function setter(map, cb, cbname) {
    var mapval;
    if (!map) {
      return;
    }
    mapval = map.get(cbname);
    if(lib.defined(mapval)){
      cb(mapval);
    }
  }
  SinkRepresentation.prototype.monitorStateForGui = function (listenerhash) {
    /*
    listenerhash: {
      statepath1: cb1,
      statepath2: [cb2, cb3]
    }
    */
    if (!this.state) {
      return;
    }
    lib.traverseShallow(listenerhash, setter.bind(null, this.state));
    return this.stateEvents.addConsumers(listenerhash);
  };

  function sinkInfoAppender(sink, subsinkinfoextras, sinkinfo) {
    if (sinkinfo) {
      if (sinkinfo.length===1) {
        if (!sink.localSinkNames) {
          sink.localSinkNames = [];
        }
        if (sink.localSinkNames.indexOf(sinkinfo[0])<0){
          sink.localSinkNames.push(sinkinfo[0]);
        }
      } else {
        subsinkinfoextras.push(sinkinfo);
      }
    }
  }

  SinkRepresentation.prototype.setSink = function (sink, sinkinfoextras) {
    var d,
      subsinkinfoextras;
    if (!this.stateEvents) {
      return q(0);
    }
    if (this.sink) {
      this.purge();
    }
    d = q.defer();
    if (!sink) {
      //console.log('no sink in setSink');
      this.sink = 0; //intentionally
      d.resolve(0);
    } else {
      this.sink = sink;
      this.purgeSinkDestroyedListener();
      this.sinkDestroyedListener = sink.destroyed.attach(this.onSinkDown.bind(this));
      subsinkinfoextras = [];
      //console.log('at the beginning', sink.localSinkNames, '+', sinkinfoextras);
      if (sinkinfoextras) {
        sinkinfoextras.forEach(sinkInfoAppender.bind(null, sink, subsinkinfoextras));
      }
      //console.log('finally', sink.localSinkNames);
      this.handleSinkInfo(d, sink, subsinkinfoextras);
      this.stateEvents.attachTo(sink);
      if(sink.recordDescriptor){
        //taskRegistry.run('materializeQuery',this.produceDataMaterializationPropertyHash(sink));
      }
      this.sinkWaiters.resolve(sink);
    }
    subsinkinfoextras = null;
    sink = null;
    return d.promise;
  };
  SinkRepresentation.prototype.onSinkDown = function () {
    this.purgeSinkDestroyedListener();
    this.stateEvents.sink = null;
  };
  SinkRepresentation.prototype.purgeSinkDestroyedListener = function () {
    if (this.sinkDestroyedListener) {
      this.sinkDestroyedListener.destroy();
    }
    this.sinkDestroyedListener = null;
  };
  SinkRepresentation.prototype.handleSinkInfo = function (defer, sink, subsinkinfoextras) {
    if (!sink) {
      defer.resolve(0);
      return;
    }
    var sinkstate = taskRegistry.run('materializeState',{
        sink: sink,
        data: this.state
        }),
        activationobj;
    activationobj = new SinkActivationMonitor(defer);
    if (sink.remoteSinkNames) {
      //console.log('remote sink names', sink.remoteSinkNames);
      sink.remoteSinkNames.forEach(this.subSinkInfo2SubInit.bind(this, false, activationobj, subsinkinfoextras));
    }
    if (sink.localSinkNames) {
      sink.localSinkNames.forEach(this.subSinkInfo2SubInit.bind(this, true, activationobj, subsinkinfoextras));
    } else if (subsinkinfoextras && subsinkinfoextras.length) {
      console.log('No localSinkNames on',sink.modulename,'but still have to do subsinkinfoextras',subsinkinfoextras);
    }
    activationobj.run(sinkstate);
  };
  function subSinkInfoExtraHandler(subsinkinfoextras, esubsinkinfo) {
    if (esubsinkinfo[0] === ssname) {
      subsubsinkinfoextras.push(esubsinkinfo.slice(1));
    }
  }
  SinkRepresentation.prototype.subSinkInfo2SubInit = function (sswaitable, activationobj, subsinkinfoextras, ss) {
    var ssname = sinkNameName(ss.name),
      subsink,
      subsubsinkinfoextras = [];
    if (!ssname) {
      throw new lib.Error('NO_SUBSINK_NAME');
    }
    subsink = this.subsinks[ssname]; 
    if (subsinkinfoextras) {
      subsinkinfoextras.forEach(subSinkInfoExtraHandler.bind(null, subsinkinfoextras));
    }
    //console.log(subsinkinfoextras, '+', ssname, '=>', subsubsinkinfoextras);
    if (!subsink) {
      //console.log('new subsink SinkRepresentation',ssname,this.sink.localSinkNames, this.sink.remoteSinkNames);
      subsink = new SinkRepresentation(this.subSinkEventHandlers(ssname));
      this.subsinks[ssname] = subsink;
    }
    activationobj.setup({
        name: ssname,
        identity: this.subIdentity(ssname),
        cb: this.subSinkActivated.bind(this, activationobj, ssname, subsink, subsubsinkinfoextras)
      },sswaitable ? ssname : null);
    /*
    if (sswaitable) {
      //console.log('will wait for', ssname);
      activationobj.subinits.push({
        name: ssname,
        identity: {name: 'user', role: 'user'},
        cb: this.subSinkActivated.bind(this, activationobj, subsink, subsubsinkinfoextras)
      });
    }
    */
    subsubsinkinfoextras = null;
    ssname = null;
  };
  SinkRepresentation.prototype.subSinkActivated = function (activationobj, ssname, subsink, subsubsinkinfoextras, subsubsink) {
    var ssp = subsink.setSink(subsubsink, subsubsinkinfoextras);
    if (activationobj && activationobj.defer && subsubsink) {
      activationobj.add(ssname, ssp);
    }
  };
  SinkRepresentation.prototype.subSinkEventHandlers = function (subsinkname) {
    if (!this.eventHandlers) {
      return;
    }
    if (!this.eventHandlers.sub) {
      return;
    }
    return this.eventHandlers.sub[subsinkname];
  };
  var _defaultIdentity = {name: 'user', role: 'user'};
  function sinkInfo2Identity(si) {
    var ret = {
      role: si.role || 'user',
      name: si.username || 'user'
    };
    return ret;
  }
  function sinkNameName (sn) {
    if (lib.isArray(sn)) {
      return sn[sn.length-1];
    } else if (lib.isString(sn)) {
      return sn;
    }
  }
  function namefinder(findobj, si) {
    var srcname;
    if (!si) {
      return;
    }
    srcname = sinkNameName(si.name);
    if (!srcname) {
      return;
    }
    if (findobj.name === srcname) {
      findobj.found = si;
      return true;
    }
  }
  function findSinkInfo(sis, name) {
    var und, findobj = {name: name, found: und};
    if(sis.some(namefinder.bind(null, findobj))){
      return findobj.found;
    }
  }
  SinkRepresentation.prototype.subIdentity = function (subsinkname) {
    var si = findSinkInfo(this.sink.localSinkNames, subsinkname);
    if (si) {
      return sinkInfo2Identity(si);
    }
    si = findSinkInfo(this.sink.remoteSinkNames, subsinkname);
    if (si) {
      return sinkInfo2Identity(si);
    }
    return {name: 'user', role: 'user'};
  };

  function UserSinkRepresentation(eventhandlers){
    SinkRepresentation.call(this, eventhandlers);
  }
  lib.inherit(UserSinkRepresentation, SinkRepresentation);

  return UserSinkRepresentation;
}

module.exports = createUserRepresentation;
