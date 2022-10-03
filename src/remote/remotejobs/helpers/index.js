function createJobHelpers (lib, outerlib) {
  'use strict';

  var mylib = {};

  function windowAllexSessionId () {
    var loc = window.location, params, sessionid;
    if (loc && loc.search) {
      params = new URLSearchParams(loc.search);
      return params.get('allexsessionid');
    }
  }

  mylib.windowAllexSessionId = windowAllexSessionId;

  outerlib.helpers = mylib;
}
module.exports = createJobHelpers;