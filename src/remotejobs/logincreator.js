function createLoginJob (lib, mixins, mylib) {
  'use strict';

  var q = lib.q,
    qlib = lib.qlib,
    JobOnEnvironment = mylib.JobOnEnvironment,
    HotelAndApartmentHandlerMixin = mixins.HotelAndApartmentHandlerMixin;

  function LoginJob (env, remotestoragename, protocolsecurer, heartbeat, credentials, entrypointmethod, defer) {
    JobOnEnvironment.call(this, env, defer);
    HotelAndApartmentHandlerMixin.call(this);
    this.sinksreported = false;
    this.remotestoragename = remotestoragename;
    this.protocolsecurer = protocolsecurer;
    this.heartbeat = heartbeat;
    this.credentials = credentials;
    this.entrypointmethod = entrypointmethod;
    this.letmeinresponse = null;
  }
  lib.inherit(LoginJob, JobOnEnvironment);
  HotelAndApartmentHandlerMixin.addMethods(LoginJob);
  LoginJob.prototype.destroy = function () {
    var sr = this.sinksreported,
      hs = this.hotelSink,
      as = this.apartmentSink;
    this.letmeinresponse = null;
    this.entrypointmethod = null;
    this.credentials = null;
    this.heartbeat = null;
    this.protocolsecurer = null;
    this.remotestoragename = null;
    this.sinksreported = null;
    HotelAndApartmentHandlerMixin.prototype.destroy.call(this);
    JobOnEnvironment.prototype.destroy.call(this);
    if (!sr) {
      if (hs) {
        hs.destroy();
      }
      if (as) {
        as.destroy();
      }
    }
  };
  LoginJob.prototype.go = function () {
    var ok = this.okToGo();
    if (!ok.ok) {
      return ok.val;
    }
    if (this.destroyable.apartmentSink && this.destroyable.apartmentSink.destroyed) {
      this.resolve(true);
    } else {
      this.doDaLetMeIn();
    }
    return ok.val;
  };
  LoginJob.prototype.doDaLetMeIn = function () {
    this.letmeinresponse = null;
    HotelAndApartmentHandlerMixin.prototype.destroy.call(this);
    (new mylib.LetMeInJob(
      this.destroyable,
      this.protocolsecurer,
      this.heartbeat,
      this.credentials,
      this.entrypointmethod
    )).go().then(
      this.onLetMeInResponse.bind(this),
      this.onLetMeInRequestFail.bind(this)
    );
  };
  LoginJob.prototype.onLetMeInResponse = function (response) {
    if (!this.okToProceed()) {
      return;
    }
    if (!response) {
      this.destroyable.giveUp(this.credentials, this);
      return;
    }
    if (response) {
      if (response.error) {
        console.log('response.error', response.error);
        if (response.error==='NO_TARGETS_YET' || response.error==='NO_DB_YET') {
          lib.runNext(this.doDaLetMeIn.bind(this), this.heartbeat*10);
          //this.reject(response.error);
          return;
        }
      }
      if (response.secondphase) {
        this.destroyable.secondphasesessionid = response.secondphase;
        this.destroyable.delFromStorage(remoteStorageName, 'sessionid').then (
          this.resolve.bind(this, this.destroyable.set('state', 'secondphase')) //yes, 'state' is set immediately
        );
        return;
      }
      if (!(response.ipaddress && response.port && response.session)) {
        this.destroyable.giveUp(this.credentials, this);
        return;
      }
      this.letmeinresponse = response;
      this.acquireSinkOnHotel();
      return;
    }
    this.destroyable.giveUp(this.credentials, this);
  };
  LoginJob.prototype.onLetMeInRequestFail = function (reason) {
    if (!this.okToProceed()) {
      return;
    }
    lib.runNext(this.doDaLetMeIn.bind(this), this.heartbeat*10);
    /*
    if (reason && 'STALE_LET_ME_IN_REQUEST' === reason.code) {
      this.doDaLetMeIn();
      return;
    }
    this.destroyable.set('error', reason);
    this.destroyable.giveUp(this.credentials, this);
    */
  };
  LoginJob.prototype.acquireSinkOnHotel = function () {
    if (!this.okToProceed()) {
      return;
    }
    (new mylib.AcquireSinkOnHotelJob(this.destroyable, this.protocolsecurer, this.letmeinresponse)).go().then(
      this.onHotelSink.bind(this),
      this.onHotelSinkFail.bind(this)
    );
  };
  LoginJob.prototype.onHotelSink = function (hotelsink) {
    if (!this.okToProceed()) {
      if (hotelsink) {
        hotelsink.destroy();
      }
      return;
    }
    this.purgeHotelSinkDestroyedListener();
    if (!(hotelsink && hotelsink.destroyed)) {
      this.acquireSinkOnHotel();
      return;
    }
    HotelAndApartmentHandlerMixin.prototype.setHotelSink.call(this, hotelsink);
    this.acquireApartmentServiceSink();
  };
  LoginJob.prototype.onHotelSinkFail = function (reason) {
    this.doDaLetMeIn();
  };
  LoginJob.prototype.onHotelSinkDestroyed = function () {
    HotelAndApartmentHandlerMixin.prototype.onHotelSinkDestroyed.call(this);
    this.acquireSinkOnHotel();
  };
  LoginJob.prototype.acquireApartmentServiceSink = function () {
    if (!this.okToProceed()) {
      return;
    }
    (new mylib.AcquireUserSinkJob(this.destroyable, this.hotelSink)).go().then(
      this.onApartmentSink.bind(this),
      this.onApartmentSinkFail.bind(this)
    );
  };
  LoginJob.prototype.onApartmentSink = function (usersink) {
    if (!this.okToProceed()) {
      if (usersink) {
        usersink.destroy();
      }
      return;
    }
    if (!(usersink && usersink.destroyed)) {
      this.acquireApartmentServiceSink();
      return;
    }
    HotelAndApartmentHandlerMixin.prototype.setApartmentSink.call(this, usersink);
    this.destroyable.putToStorage(this.remotestoragename, 'sessionid', {sessionid: this.letmeinresponse.session, token: lib.uid()}).then(
      this.onSessionSaved.bind(this),
      this.onSessionSaveFailed.bind(this)
    );
  };
  LoginJob.prototype.onApartmentSinkFail = function (reason) {
    this.acquireApartmentServiceSink();
  };
  LoginJob.prototype.onSessionSaved = function (ok) {
    if (!this.okToProceed()) {
      return;
    }
    this.destroyable.sessionid = this.letmeinresponse.session;
    this.destroyable.setApartmentSink(this.apartmentSink);
    this.sinksreported = true;
    this.resolve(true);
  };
  LoginJob.prototype.onSessionSaveFailed = function (reason) {
    if (!this.okToProceed()) {
      return;
    }
  };

  mylib.LoginJob = LoginJob;
}
module.exports = createLoginJob;
