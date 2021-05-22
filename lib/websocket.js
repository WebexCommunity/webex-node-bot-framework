'use strict';

var when = require('when');
//var Webex = require('webex'); 
var processEvent = require('./process-event'); 

/**
 * A class to register for webex teams messaging events to be delivered
 * via socket using the webex SDK
 * 
 * This class will register to listen to the events.  When an event
 * is received it will call the webhook handler with the event payload
 * 
 * This approach allows bot developers to deploy bots behind a firewall
 * without requiring a public IP address in order to receive webhooks
 * 
 * @function
 * @private
 * @param {Object} framework - The framework object this function applies to.
 * @param {Object} webhook - The webhook handler object for this instance
 * @returns {Object}
 *
 */
function Websocket(framework, webhook) {
  this.framework = framework;
  this.webhook = (webhook) ? webhook : {};
  // Todo make this more like the traditional framework "name"
  // B64 encoding of URL and bot name...
  this.name = 'webex sdk socket event';
  framework.webhook.name = this.name;
}

Websocket.prototype.init = function() {

  return deletePreviousDeviceRegistrationsIfConfigured(
    this.framework.options.removeDeviceRegistrationsOnStart, 
    this.framework.webex
  )
    .catch((resp) => {
      if (resp.statusCode != 404) {
        console.error(`Error cleaning up device previous registrations: ${resp.message}`);
      }
    })
    .finally(() => {
      // register for message, membership room and attachmentAction events
      let listenerPromises = [];
      listenerPromises.push(this.framework.webex.messages.listen());
      listenerPromises.push(this.framework.webex.memberships.listen());
      listenerPromises.push(this.framework.webex.rooms.listen());
      listenerPromises.push(this.framework.webex.attachmentActions.listen());

      return Promise.all(listenerPromises)
        .then(() => {
          this.framework.webex.attachmentActions.on('created', (event) => processEvent(this.framework, event, this.name));
          this.framework.webex.messages.on('created', (event) => processEvent(this.framework, event, this.name));
          this.framework.webex.messages.on('deleted', (event) => processEvent(this.framework, event, this.name));
          this.framework.webex.memberships.on('created', (event) => processEvent(this.framework, event, this.name));
          this.framework.webex.memberships.on('deleted', (event) => processEvent(this.framework, event, this.name));
          this.framework.webex.memberships.on('updated', (event) => processEvent(this.framework, event, this.name));
          this.framework.webex.rooms.on('created', (event) => processEvent(this.framework, event, this.name));
          this.framework.webex.rooms.on('updated', (event) => processEvent(this.framework, event, this.name));
          console.log('Listening for webex teams events...');
          return when(true);
        })
        .catch((err) => {
          console.error(`error listening for webex teams events: ${err}`);
          return Promise.reject(err);
        });
    });
};

Websocket.prototype.cleanup = function() {
  // deregister for message, membership and room events
  // this.framework.webex.messages.stopListening();
  // this.framework.webex.memberships.stopListening();
  // this.framework.webex.rooms.stopListening();

  // Alternate approach to reducing "excessive device warnings error"
  // This is what the stopListening functions are supposed to do...

  return this.framework.webex.internal.device.unregister()
    .then((val) => {
      this.framework.webex.messages.off('created');
      this.framework.webex.messages.off('deleted');
      this.framework.webex.memberships.off('created');
      this.framework.webex.memberships.off('deleted');
      this.framework.webex.memberships.off('updated');
      this.framework.webex.rooms.off('created');
      this.framework.webex.rooms.off('updated');
      console.log('Stopped listening for webex teams events...');
      return when(true);
    }).catch(e => console.error(`Failed cleaning up websocket connection: ${e.message}`));
};

function deletePreviousDeviceRegistrationsIfConfigured(doDelete, webex) {
  if (doDelete) {
    // Delete all previous websocket device registrations
    return deleteAllDevices(webex);
  } else {
    return when(true);
  }  
}

function deleteAllDevices(webex) {
  return webex.internal.services.waitForService({name: 'wdm'})
    .then((wdmUrl) => webex.request({method: 'DELETE', url: `${wdmUrl}/devices`}))
}

module.exports = Websocket;

