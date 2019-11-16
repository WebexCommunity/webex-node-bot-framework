'use strict';

var when = require('when');
var crypto = require('crypto');
var processEvent = require('./process-event');

/**
 * Processes a inbound Webex API webhook.
 * @function
 * @private
 * @param {Object} framework - The framework object this function applies to.
 * @returns {Function}
 * Function that can be used for Express and Express-like webserver routes.
 *
 */
function Webhook(framework) {

  return function (req, res) {

    // emit webhook event (mostly here for debugging...)
    framework.emit('webhook', req[framework.options.webhookRequestJSONLocation]);

    // if "res" is passed to function...
    if (typeof res !== 'undefined') {
      res.status(200);
      res.send('OK');
    }

    var body = req[framework.options.webhookRequestJSONLocation] || false;
    if (!body) {
      return when(true);
    }

    if (framework.options.webhookSecret) {
      // get webhook header to determine if security is enabled
      var sig = req.headers['x-spark-signature'] || false;
      if (!sig) {
        framework.debug('missing expected signature in webhook callback, ignoring...');
        return when(true);
      }

      //validate signature
      if (typeof framework.options.webhookSecret === 'string' && typeof sig === 'string') {
        var hmac = crypto.createHmac('sha1', framework.options.webhookSecret);
        var payload = JSON.stringify(body);
        hmac.update(payload);
        var digest = hmac.digest('hex');
        if (sig !== digest) {
          // invalid signature, ignore processing webhook
          framework.debug('invalid signature in webhook callback, ignoring...');
          return when(true);
        }
      }
    }

    // if (framework.options.webhookSecret && !(sig && framework.spark.webhookAuth(sig, body))) {
    //   // invalid signature, ignore processing webhook
    //   framework.debug('invalid signature in webhook callback, ignoring...');
    //   return when(true);
    // }

    return processEvent(framework, body);

  }; // end of return function...
}

module.exports = Webhook;
