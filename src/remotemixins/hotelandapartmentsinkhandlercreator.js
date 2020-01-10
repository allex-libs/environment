function createHotelAndApartmentSinkHandlerMixin (lib) {
  'use strict';

  function HotelAndApartmentHandlerMixin () {
    this.hotelSinkDestroyedListener = null;
    this.hotelSink = null;
    this.apartmentSinkDestroyedListener = null;
    this.apartmentSink = null;
  }
  HotelAndApartmentHandlerMixin.prototype.destroy = function () {
    this.apartmentSink = null;
    this.purgeApartmentSinkDestroyedListener();
    this.hotelSink = null;
    this.purgeHotelSinkDestroyedListener();
  };
  HotelAndApartmentHandlerMixin.prototype.purgeHotelSinkDestroyedListener = function () {
    if (this.hotelSinkDestroyedListener) {
      this.hotelSinkDestroyedListener.destroy();
    }
    this.hotelSinkDestroyedListener = null;
  };
  HotelAndApartmentHandlerMixin.prototype.purgeApartmentSinkDestroyedListener = function () {
    if (this.apartmentSinkDestroyedListener) {
      this.apartmentSinkDestroyedListener.destroy();
    }
    this.apartmentSinkDestroyedListener = null;
  };
  HotelAndApartmentHandlerMixin.prototype.setHotelSink = function (hotelsink) {
    this.hotelSinkDestroyedListener = hotelsink.destroyed.attach(this.onHotelSinkDestroyed.bind(this));
    this.hotelSink = hotelsink;
  };
  HotelAndApartmentHandlerMixin.prototype.setApartmentSink = function (apartmentsink) {
    this.purgeApartmentSinkDestroyedListener();
    this.apartmentSinkDestroyedListener = apartmentsink.destroyed.attach(this.onApartmentSinkDestroyed.bind(this));
    this.apartmentSink = apartmentsink;
  };
  HotelAndApartmentHandlerMixin.prototype.onHotelSinkDestroyed = function () {
    this.hotelSink = null;
    this.purgeHotelSinkDestroyedListener();
  };
  HotelAndApartmentHandlerMixin.prototype.onApartmentSinkDestroyed = function () {
    this.apartmentSink = null;
    this.purgeApartmentSinkDestroyedListener();
    /* not needed, acquireUserServiceSink already connected this
    if (this.hotelSink) {
      this.hotelSink.destroy();
    }
    */
  };

  HotelAndApartmentHandlerMixin.addMethods = function (klass) {
    lib.inheritMethods(klass, HotelAndApartmentHandlerMixin
      ,'purgeHotelSinkDestroyedListener'
      ,'purgeApartmentSinkDestroyedListener'
      ,'setHotelSink'
      ,'setApartmentSink'
      ,'onHotelSinkDestroyed'
      ,'onApartmentSinkDestroyed'
    );
  }

  return HotelAndApartmentHandlerMixin;
}
module.exports = createHotelAndApartmentSinkHandlerMixin;
