function createMixins (lib) {
  'use strict';

  return {
    HotelAndApartmentHandlerMixin: require('./hotelandapartmentsinkhandlercreator')(lib)
  };
}
module.exports = createMixins;
