'use strict';

var EventEmitter = require('events').EventEmitter;
EventEmitter.prototype._maxListeners = 0;
var sequence = require('when/sequence');
var moment = require('moment');
var Webex = require('webex');
var _debug = require('debug')('framework');
var util = require('util');
var when = require('when');
var path = require('path');
var _ = require('lodash');

var MemStore = require('../storage/memory');

var Bot = require('./bot');
var u = require('./utils');

/**
 * Creates an instance of the Framework.
 *
 * @constructor Framework
 * @param {Object} options - Configuration object containing Framework settings.
 * @property {string} id - Framework UUID
 * @property {boolean} active - Framework active state
 * @property {boolean} initialized - Framework fully initialized
 * @property {boolean} isBotAccount - Is Framework attached to Webex using a bot account?
 * @property {boolean} isUserAccount - Is Framework attached to Webex using a user account?
 * @property {object} person - Framework person object
 * @property {string} email - Framework email
 * @property {object} webex - The Webex JSSDK instance used by Framework
 *
 * @example
 * var options = {
 *   webhookUrl: 'http://myserver.com/framework',
 *   token: 'Tm90aGluZyB0byBzZWUgaGVyZS4uLiBNb3ZlIGFsb25nLi4u'
 * };
 * var framework = new Framework(options);
 */
function Framework(options) {
  EventEmitter.call(this);

  this.id = options.id || u.genUUID64();

  /**
   * Options Object
   *
   * @memberof Framework
   * @instance
   * @namespace options
   * @property {string} token - Webex Token.
   * @property {string} [webhookUrl] - URL that is used for Webex API to send callbacks.  If not set events are received via websocket
   * @property {string} [webhookSecret] - If specified, inbound webhooks are authorized before being processed. Ignored if webhookUrl is not set.
   * @property {string} [messageFormat=text] - Default Webex message format to use with bot.say().
   * @property {object} [initBotStorageData={}] - Initial data for new bots to put into storage. 
   * @property {string} [id=random] - The id this instance of Framework uses.
   * @property {string} [webhookRequestJSONLocation=body] - The property under the Request to find the JSON contents.
   * @property {Boolean} [removeWebhooksOnStart=true] - If you wish to have the bot remove all account webhooks when starting. Ignored if webhookUrl is not set.
   */
  this.options = options;

  this.active = false;
  this.initialized = false;
  this.storageActive = false;
  this.isBotAccount = false;
  this.isUserAccount = false;
  this.person = {};
  this.email;

  // define location in webhook request to find json values of incoming webhook.
  // note: this is typically 'request.body' but depending on express/restify configuration, it may be 'request.params'
  this.options.webhookRequestJSONLocation = this.options.webhookRequestJSONLocation || 'body';

  // define if Framework remove all webhooks attached to token on start (if not defined, defaults to true)
  this.options.removeWebhooksOnStart = typeof this.options.removeWebhooksOnStart === 'boolean' ? this.options.removeWebhooksOnStart : true;

  // define default messageFormat used with bot.say (if not defined, defaults to 'text')
  if (typeof this.options.messageFormat === 'string' && _.includes(['text', 'markdown', 'html'], _.toLower(this.options.messageFormat))) {
    this.messageFormat = _.toLower(this.options.messageFormat);
  } else {
    this.messageFormat = 'text';
  }

  this.batchDelay = options.minTime * 2;
  this.auditInterval;
  this.auditDelay = 300;
  this.auditCounter = 0;
  this.logs = [];
  this.logMax = 1000;
  this.lexicon = [];
  this.bots = [];
  this.webex = {};
  this.webhook = {};
  this.cardsWebhook = {};

  this.initBotStorageData = (typeof options.initBotStorageData === 'object') ? options.initBotStorageData : {};

  // register internal events
  this.on('error', err => {
    if (err) {
      console.err(err.stack);
    }
  });
  this.on('start', () => {
    require('./logs')(this);
    this.initialize();
  });
}
util.inherits(Framework, EventEmitter);

/**
 * Internal logger function.
 *
 * @function
 * @memberof Framework
 * @private
 * @param {String} message - Message to log
 * @returns {string} Formatted message
 */
Framework.prototype.log = function (message) {
  if (this.log.length > this.logMax) {
    this.log = this.log.slice(this.log.length - this.logMax);
  }
  message = (moment().utc().format('YYYY-MM-DD HH:mm:ss') + ' ' + message);
  this.logs.push(message);

  /**
   * Framework log event.
   *
   * @event log
   * @property {string} message - Log Message
   */
  this.emit('log', message);
  return message;
};

/**
 * Internal debug function.
 *
 * @function
 * @memberof Framework
 * @private
 * @param {String} message - Message to debug
 * @returns {null}
 */
Framework.prototype.debug = function (message) {
  message = util.format.apply(null, Array.prototype.slice.call(arguments));

  if (typeof this.debugger === 'function') {
    this.debugger(message, this.id);
  } else {
    _debug(message);
  }
};

/**
 * Tests, and then sets a new Webex Token.
 *
 * @function
 * @memberof Framework
 * @param {String} token - New Webex Token for Framework to use.
 * @returns {Promise.<String>}
 *
 * @example
 * framework.setWebexToken('Tm90aGluZyB0byBzZWUgaGVyZS4uLiBNb3ZlIGFsb25nLi4u')
 *   .then(function(token) {
 *      console.log('token updated to: ' + token);
 *   });
 */
Framework.prototype.setWebexToken = function (token) {
  return this.testWebexToken(token)
    .then(token => {
      this.options.token = token;
      return when(token);
    })
    .catch(() => {
      when.reject(new Error('could not change token, token not valid'));
    });
};

/**
 * Test a new Webex Token.
 *
 * @function
 * @memberof Framework
 * @private
 * @param {String} token - Test if Token is valid by attempting a simple Webex API Call.
 * @returns {Promise.<String>}
 *
 * @example
 * framework.testWebexToken('Tm90aGluZyB0byBzZWUgaGVyZS4uLiBNb3ZlIGFsb25nLi4u')
 *   .then(function() {
 *     console.log('token valid');
 *   })
 *   .catch(function(err) {
 *     console.log(err.message);
 *   });
 */
Framework.prototype.testWebexToken = function (token) {
  var testOptions = _.clone(this.options);
  testOptions.token = token;
  var testWebex = new Webex(testOptions);

  return testWebex.people.get('me')
    .then(() => {
      testWebex = {};
      return when(token);
    })
    .catch(() => {
      return when.reject(new Error('token not valid'));
    });
};

/**
 * Stop Framework.
 *
 * @function
 * @memberof Framework
 * @returns {Promise.<Boolean>}
 *
 * @example
 * framework.stop();
 */
Framework.prototype.stop = function () {

  // if not stopped...
  if (this.active) {

    return cleanupListeners(this)
      .then(() => {
        if (this.auditInterval) clearInterval(this.auditInterval);

        return when.map(this.bots, bot => {
          bot.stop();
          return when(true);
        });
      })

      .then(() => {
        this.bots = [];
        this.webex = {};
        this.webhook = {};
        this.cardsWebhook = {};
        this.active = false;
        this.initialized = false;
        /**
         * Framework stop event.
         *
         * @event stop
         * @property {string} id - Framework UUID
         */
        this.emit('stop', this.id);

        return when(true);
      });

  } else {
    return when(false);
  }
};

/**
 * Start Framework.
 *
 * @function
 * @memberof Framework
 * @returns {Promise.<Boolean>}
 *
 * @example
 * framework.start();
 */
Framework.prototype.start = function () {

  // if not started...
  if (!this.active) {
    // Check if any of the old, non-supported flint options are in place
    let errMsg;
    if (errMsg = optionsIncludeNonSupported(this.options)) {
      return when.reject(new Error(errMsg));
    }


    // init storage default storage driver if none was initizlied
    // prior to starting the framework
    if (!this.storageActive) {
      this.storageDriver(new MemStore())
        .catch((e) => console.error(`Memory storage adaptor initialization failed: ${e.message}`));
    }

    // init webex
    this.webex = new Webex({ credentials: this.options.token });

    // determine bot identity
    return this.webex.people.get('me')
      .then(person => {
        this.person = person;
        //this.person.email = _.toLower(person.emails[0]);
        this.email = this.getPersonEmail(person);
        //this.email = _.toLower(person.emails[0]);

        // check if account is bot or user account
        if (person.type === 'bot') {
          this.isBotAccount = true;
          this.isUserAccount = false;
        } else {
          this.isBotAccount = false;
          this.isUserAccount = true;
        }

        return when(person);
      })

      // Configure webhooks or websockets
      .then(() => {
        if (this.options.webhookUrl) {
          // get webhooks
          this.getWebhooks()

            // process webhooks
            .then(webhooks => {

              // remove only webhooks this app created
              if (!this.options.removeWebhooksOnStart) {

                var webhooksToRemove = _.filter(webhooks, webhook => {
                  return (webhook.name == u.base64encode(this.options.webhookUrl.split('/')[2] + ' ' + this.email));
                });

                if (webhooksToRemove instanceof Array && webhooksToRemove.length > 0) {
                  return when.map(webhooksToRemove, webhook => this.webex.webhooks.remove(webhook));
                } else {
                  return when(true);
                }
              }

              // else, remove all webhooks on start
              else {
                return when.map(webhooks, webhook => this.webex.webhooks.remove(webhook));
              }
            })

            .then(() => {
              if (this.options.webhookUrl) {
                // Create the webex teams "firehose" webhook for all events
                let newWebhook = {
                  resource: 'all',
                  event: 'all',
                  targetUrl: this.options.webhookUrl,
                  name: u.base64encode(this.options.webhookUrl.split('/')[2] + ' ' + this.email)
                };
                if (this.options.webhookSecret) {
                  newWebhook.secret = this.options.webhookSecret;
                }
                this.webex.webhooks.create(newWebhook)
                  .then(webhook => {
                    // Create a webhook for attachmentActions which happen when a user hits a "Submit"
                    // button in a card we posted.   This is not included in the "firehose" webhook
                    this.webhook = webhook;
                    newWebhook.resource = 'attachmentActions';
                    newWebhook.event = 'created';
                    return this.webex.webhooks.create(newWebhook);
                  })
                  .then(webhook => {
                    this.cardsWebhook = webhook;
                    return when(webhook);
                  })
                  .catch((err) => {
                    this.webhook = false;
                    return when(false);
                  });
              } else {
                this.webhook = false;
                return when(false);
              }
            });
        } else {
          // There was no webhookUrl specified so we will use websockets instead
          let Websocket = require('./websocket');
          this.websocket = new Websocket(this);
          return this.websocket.init();
        }
      })

      // start
      .then(() => {
        /**
         * Framework start event.
         *
         * @event start
         * @property {string} id - Framework UUID
         */
        this.emit('start', this.id);
        this.active = true;
        return when(true);
      })

      // what happens if we don't
      // setup auditor
      // .then(() => {
      //   this.auditInterval = setInterval(() => {
      //     this.auditBots();
      //   }, 1000);
      //   return when(true);
      // })

      // handle errors
      .catch(err => {
        throw err;
      });
  } else {
    return when(false);
  }
};

/**
 * Initialize Framework.
 *
 * @function
 * @memberof Framework
 * @private
 * @returns {Promise.<Boolean>}
 *
 * @example
 * framework.initialize();
 */
Framework.prototype.initialize = function () {
  // spawn bots in existing rooms at startup
  return this.webex.memberships.list()
    .then(memberships => {

      // create batch
      var batch = _.map(memberships.items, m => {
        return () => this.spawn(m);
      });

      // run batch
      return sequence(batch)
        .then(() => when(true))
        .catch(err => {
          this.debug(err.stack);
          return when(true);
        });
    })

    .then(() => {
      /**
       * Framework initialized event.
       *
       * @event initialized
       * @property {string} id - Framework UUID
       */
      this.emit('initialized', this.id);
      this.initialized = true;
      return when(true);
    });

};

/**
 * Restart Framework.
 *
 * @function
 * @memberof Framework
 * @returns {Promise.<Boolean>}
 *
 * @example
 * framework.restart();
 */
Framework.prototype.restart = function () {
  return this.stop()
    .then(stopped => {
      if (stopped) {
        return this.start();
      } else {
        return when(false);
      }
    });
};

/**
 * Audit bot objects to verify they are in sync with the Webex API.
 *
 * @function
 * @memberof Framework
 * @private
 * @returns {Promise.<Bot>}
 *
 * @example
 * framework.auditBots();
 */
// TODO this seems expensive, do we need to do it
Framework.prototype.auditBots = function () {
  // only run if Framework has initialized
  if (!this.initialized) {
    return when(true);
  }

  // increment counter
  this.auditCounter++;

  // reset counter when counter exceeds max
  if (this.auditCounter > this.auditDelay) {
    this.auditCounter = 0;
  }

  // update framework.person
  if (this.auditCounter === 0) {
    this.getPerson(this.person.id)
      .then(person => {
        this.person = person;
      })
      .catch(err => this.debug(err.stack));
  }

  // remove duplicate bots
  if (this.auditCounter % 5 === 0) {
    var uniqBots = _.uniqBy(this.bots, bot => bot.room.id);
    var botsToRemove = _.differenceBy(this.bots, uniqBots, 'id');
    _.forEach(botsToRemove, bot => this.despawn(bot.room.id).catch(() => true));
  }

  // check for zombies
  if (this.auditCounter === (this.auditDelay - 1)) {
    this.getRooms()
      .then(rooms => {
        var roomsToAdd = _.differenceBy(rooms, _.map(this.bots, bot => bot.room), 'id');
        _.forEach(roomsToAdd, room => this.spawn(room.id));
      })
      .catch(() => {
        return when(true);
      });
  }

  // exit rooms where bot is only member
  if (this.auditCounter === (this.auditDelay - 1)) {
    _.forEach(this.bots, bot => {
      if (bot.memberships.length === 0 && bot.isGroup && !bot.room.teamId) {
        bot.exit();
      }
    });
  }

  return when.map(this.bots, bot => {
    // if auditDelay < bot auditTrigger, reset bot audit trigger
    if (this.auditDelay <= bot.auditTrigger) {
      bot.auditTrigger = Math.floor((Math.random() * this.auditDelay)) + 1;
    }

    // if bot.auditTrigger matches current count inside auditDelay range
    if (this.initialized && bot.auditTrigger === this.auditCounter) {

      // room
      var room = () => this.getRoom(bot.room.id)
        .then(room => {
          // Fix the occassional old room with missing title
          if (typeof room.title === 'undefined' || room.title.trim() === '') {
            room.title = 'Default title';
          }
          return this.onRoomUpdated(room);
        })
        .catch(err => {
          this.debug(err.stack);
          return when(true);
        });

      // membership
      var membership = () => this.getMembership(bot.membership.id)
        .then(membership => this.onMembershipUpdated(membership))
        .catch(err => {
          this.debug(err.stack);
          return when(true);
        });

      // memberships
      var memberships = () => this.getMemberships(bot.room.id)
        .then(memberships => when.map(memberships, membership => this.onMembershipUpdated(membership)))

        .catch(err => {
          this.debug(err.stack);
          return when(true);
        });

      return sequence([room, membership, memberships]);
    }

    else {
      return when(true);
    }
  });
};

/**
 * Parse a message object.
 * Take a native webex message object and add additional info about the sender to it
 *
 * @function
 * @memberof Framework
 * @private
 * @param {Object} message - Message Object
 * @returns {Promise.<Message>}
 */
Framework.prototype.parseMessage = function (message) {

  // not convinced this is necessary
  // message.created = moment(message.created).utc().toDate();
  // message.personEmail = _.toLower(message.personEmail);

  // parse message text
  if (message.text) {

    // capture raw message
    message.raw = message.text;

    // trim leading whitespace
    message.text = message.text.trim();

    // replace carriage returns / new lines with a space
    message.text = message.text.replace(/[\n\r]+/g, ' ');

    // remove all consecutive white space characters
    message.text = message.text.replace(/\s\s+/g, ' ');
  }

  return when(true)
    .then(() => {
      // Get info about the sender of the message that a bot might want
      return this.getPerson(message.personId)
        .then(person => {
          message.personUsername = person.username;
          message.personEmail = person.email;
          message.personDisplayName = person.displayName;
          message.personDomain = person.domain;
          message.personAvatar = person.avatar || false;
          return when(message);
        })
        .catch(() => {
          message.personDisplayName = message.personEmail;
          message.personDomain = 'unknown';
          return when(message);
        });
    })
    .catch(() => {
      return when(message);
    });
};

/**
 * Parse a File from Message.
 *
 * @function
 * @memberof Framework
 * @private
 * @param {Object} message - Previously parsed Message Object
 * @returns {Promise.<Message>}
 */
Framework.prototype.parseFile = function (message) {

  //TODO figure out how/if Webex SDK handles this
  when.reject(new Error('framework.ParseFile not yet supported'));

  // // parse message files
  // if (message.files && message.files instanceof Array) {
  //   var parsedMessage = _.clone(message);

  //   return when.map(parsedMessage.files, url => this.webex.contentByUrl(url))
  //     .then(files => {
  //       _.forEach(files, file => {
  //         file.personId = parsedMessage.personId;
  //         file.personEmail = parsedMessage.personEmail;
  //         file.personDisplayName = parsedMessage.personDisplayName;
  //         file.personAvatar = parsedMessage.personAvatar;
  //         file.personDomain = parsedMessage.personDomain;
  //         file.created = parsedMessage.created;
  //       });
  //       parsedMessage.files = files;
  //       return when(parsedMessage);
  //     })
  //     .catch(() => {
  //       return when(message);
  //     });
  // } else {
  //   return when(message);
  // }
};

/**
 * Creates Trigger Object from a message or attachmentAction
 *
 * @function
 * @memberof Framework
 * @private
 * @param {Object} message - Enhanced message object (with additional sender info)
// * @param {Webhook} messageData - Webhook object from message created webhook
 * @returns {Promise.<Trigger>}
 */
Framework.prototype.getTrigger = function (type, triggerObject) {

  /**
   * Trigger Object
   *
   * @namespace Trigger
   * @property {string} type - type of trigger - message or attachmentAction
   * @property {string} id - Message or attachentAction ID
   * @property {object} message - message that caused this trigger (if type is 'message')
   * @property {(string|regex)} phrase - Matched lexicon phrase if any
   * @property {array} args - Filtered array of words in message text.
   * @property {object} attachmentAction - attachmentAction that caused this trigger (if type is 'attachmentAction')
   * @property {object} person - Person object associated with user that sent the message or action
   * @property {string} personId - ID of person
   */
  var trigger = {};

  trigger.type = type;
  if (type === 'message') {
    let message = triggerObject;
    // Message Info
    trigger.id = message.id;
    // parse message text
    if (message.text) {
      // cleanup the top level trigger.text
      // trim leading whitespace
      trigger.text = message.text.trim();
      // replace carriage returns / new lines with a space
      trigger.text = trigger.text.replace(/[\n\r]+/g, ' ');
      // remove all consecutive white space characters
      trigger.text = trigger.text.replace(/\s\s+/g, ' ');
    }
    trigger.args = trigger.text ? trigger.text.split(' ') : [];
    trigger.message = message;
  } else if (type === 'attachmentAction') {
    trigger.id = triggerObject.id;
    trigger.attachmentAction = triggerObject;
  } else {
    when.reject(new Error(`Invalid trigger type: ${type}`));
  }

  return this.getPerson(triggerObject.personId)
    .then(person => {
      trigger.person = person;
      trigger.personId = person.id;
      return when(trigger);
    });
};

// This is the orginal getTrigger.  Keeping it for reference
// /**
//  * Creates Trigger Object from an attachmentAction.
//  *
//  * @function
//  * @memberof Framework
//  * @private
//  * @param {Object} attachmentAction - Enhanced message object (with additional sender info)
//  * @returns {Promise.<Trigger>}
//  */
// Framework.prototype.getTrigger = function (attachmentAction) {
//   //Framework.prototype.getTrigger = function (messageId) {

//   // Why is this happening again when all of this info was already collected
//   // return this.getMessage(messageId)
//   //   .then(message => {

//   // Message Info
//   trigger.id = message.id;
//   // parse message text
//   if (message.text) {
//     // cleanup the top level trigger.text
//     // trim leading whitespace
//     trigger.text = message.text.trim();
//     // replace carriage returns / new lines with a space
//     trigger.text = trigger.text.replace(/[\n\r]+/g, ' ');
//     // remove all consecutive white space characters
//     trigger.text = trigger.text.replace(/\s\s+/g, ' ');
//   }
//   trigger.args = trigger.text ? trigger.text.split(' ') : [];
//   trigger.message = message;
//   // trigger.text = message.text || false;
//   // trigger.raw = message.raw || false;
//   // trigger.html = message.html || false;
//   // trigger.markdown = message.markdown || false;
//   // trigger.mentionedPeople = message.mentionedPeople || false;
//   // trigger.created = message.created;

//   // Sender Info
//   // trigger.personId = message.personId;
//   // trigger.personEmail = message.personEmail;
//   // trigger.personUsername = message.personUsername;
//   // trigger.personDomain = message.personDomain;
//   // trigger.personDisplayName = message.personDisplayName;
//   // trigger.personAvatar = message.personAvatar;

//   // Isn't this available in the bot?  Why get it for every message
//   // var room = this.getRoom(message.roomId)
//   //   .then(room => {
//   //     // Room Info
//   //     trigger.roomId = room.id;
//   //     trigger.roomTitle = room.title;
//   //     trigger.roomType = room.type;
//   //     trigger.roomIsLocked = room.isLocked;

//   //     return when(true);
//   //   });

//   var author = this.getPerson(message.personId)
//     .then(person => {
//       trigger.person = person;
//       trigger.personId = person.id;
//       trigger.personEmail = this.getPersonEmail(person);
//       trigger.personUsername = this.getPersonUsername(person);
//       trigger.personDomain = this.getPersonDomain(person);
//       return when(true);
//     });
//   // This gets done in the parseMessage call already
//   // var person = this.getPerson(message.personEmail)
//   //   .then(person => {

//   //     trigger.personId = person.id;
//   //     trigger.personEmail = person.email;
//   //     trigger.personUsername = person.username;
//   //     trigger.personDomain = person.domain;
//   //     trigger.personDisplayName = person.displayName;
//   //     trigger.personAvatar = person.avatar;
//   //     return when(true);
//   //   });


//   // This can probably be simpliefied webex.memberships.get(roomId, personId)
//   var membership = this.getMemberships(message.roomId)
//     .then(memberships => _.find(memberships, { 'personId': message.personId }))
//     .then(membership => {

//       trigger.personMembership = membership;

//       return when(true);
//     });

//   // TODO figure out if this is needed
//   // var files = this.parseFile(message)
//   //   .then(message => {
//   //     trigger.files = message.files || false;
//   //     return when(true);
//   //   });

//   return when.all([author, membership])
//     //return when.all([room, person, membership, files])
//     .then(() => when(trigger));
//   //});
// };

/**
 * Get Rooms
 *
 * @function
 * @memberof Framework
 * @private
 * @returns {Promise.<Array>}
 */
Framework.prototype.getRooms = function () {
  return this.webex.rooms.list()
    .then(rooms => when(rooms.items));
  // Not convinced this is necessary
  // .then(rooms => {
  //   return when.map(rooms, room => {
  //     room.lastActivity = moment(room.lastActivity).utc().toDate();
  //     room.created = moment(room.created).utc().toDate();
  //     room.added = moment().utc().toDate();
  //     return when(room);
  //   });
  // });
};

/**
 * Get Room Object By ID
 *
 * @function
 * @memberof Framework
 * @private
 * @param {String} roomId - Room ID from Webex API.
 * @returns {Promise.<Room>}
 */
Framework.prototype.getRoom = function (roomId) {
  return this.webex.rooms.get(roomId)
    .then(room => when(room));
  // Not convinced this is necessary
  // .then(room => {
  //     room.lastActivity = moment(room.lastActivity).utc().toDate();
  //     room.created = moment(room.created).utc().toDate();
  //     room.added = moment().utc().toDate();

  //     return when(room);
  //   });
};

/**
 * Get Teams
 *
 * @function
 * @memberof Framework
 * @private
 * @returns {Promise.<Array>}
 */
Framework.prototype.getTeams = function () {
  return this.webex.teams.list()
    .then(teams => when(teams.items));
  // Not convinced this is necessary
  // .then(teams => {
  //   return when.map(teams, team => {
  //     team.created = moment(team.created).utc().toDate();
  //     return when(team);
  //   });
  // });
};

/**
 * Get Team Object By ID
 *
 * @function
 * @memberof Framework
 * @private
 * @param {String} teamId - Team ID from Webex API.
 * @returns {Promise.<Team>}
 */
Framework.prototype.getTeam = function (teamId) {
  return this.webex.teams.get(teamId)
    .then(team => when(team));
  // Not convinced this is necessary
  // .then(team => {
  //   team.created = moment(team.created).utc().toDate();
  //   return when(team);
  // });
};

/**
 * Get Team Rooms
 *
 * @function
 * @memberof Framework
 * @private
 * @param {String} teamId - Room ID from webex API
 * @returns {Promise.<Array>}
 */
Framework.prototype.getTeamRooms = function (teamId) {
  return this.webex.rooms.list({ teamId: teamId })
    .then(rooms => when(rooms.items));
  // Not convinced this is necessary
  // .then(rooms => {
  //   return when.map(rooms, room => {
  //     room.lastActivity = moment(room.lastActivity).utc().toDate();
  //     room.created = moment(room.created).utc().toDate();
  //     return when(room);
  //   });
  // });
};

/**
 * Get Person Object By Id
 *
 * @function
 * @memberof Framework
 * @private
 * @param {String} personId- PersonId of Webex Account
 * @returns {Promise.<Person>}
 */
Framework.prototype.getPerson = function (personId) {
  return this.webex.people.get(personId);
  // .then(person => {
  //   // Why is this neeeded?
  //   // person.created = moment(person.created).utc().toDate();
  //   // person.emails = _.forEach(person.emails, email => _.toLower(email));
  //   person.email = person.emails[0];
  //   //person.email = _.toLower(person.emails[0]);
  //   person.username = _.split(_.toLower(person.email), '@', 2)[0];
  //   //person.username = _.split(person.email, '@', 2)[0];
  //   person.domain = _.split(_.toLower(person.email), '@', 2)[1];
  //   //person.domain = _.split(person.email, '@', 2)[1];
  //   person.avatar = person.avatar || '';
  //   return when(person);
  // });
};

/**
 * Get Person Object By Email
 *
 * @function
 * @memberof Framework
 * @private
 * @param {String} personEmail - Person Email of Webex Account
 * @returns {Promise.<Person>}
 */
Framework.prototype.getPersonByEmail = function (personEmail) {
  return this.webex.people.list({ email: personEmail })
    .then(people => {
      let personList = people.items;
      let numPeople = personList.length;
      if (numPeople === 1) {
        person = personList[0];
        // // Why is this neeeded? 
        // // person.created = moment(person.created).utc().toDate();
        // // person.emails = _.forEach(person.emails, email => _.toLower(email));
        // person.email = person.emails[0];
        // //person.email = _.toLower(person.emails[0]);
        // person.username = _.split(_.toLower(person.email), '@', 2)[0];
        // //person.username = _.split(person.email, '@', 2)[0];
        // person.domain = _.split(_.toLower(person.email), '@', 2)[1];
        // //person.domain = _.split(person.email, '@', 2)[1];
        // person.avatar = person.avatar || '';
        return when(person);
      } else if (numPeople === 0) {
        when.reject(new Error(`No user found with email: ${personEmail}`));
      } else {
        when.reject(new Error(`Unexpectedly found ${numPeople} with email: ${personEmail}`));
      }
    });
};

/**
 * Get Person Email
 *
 * @function
 * @memberof Framework
 * @private
 * @param {Ojbect} person- Webex Person Object
 * @returns {string}
 */
Framework.prototype.getPersonEmail = function (person) {
  if (person.emails.length >= 1) {
    return person.emails[0];
  } else {
    return '';
  }
};

/**
 * Get Person Username
 *
 * @function
 * @memberof Framework
 * @private
 * @param {Ojbect} person- Webex Person Object
 * @returns {string}
 */
Framework.prototype.getPersonUsername = function (person) {
  if (person.emails.length >= 1) {
    return _.split((person.emails[0]), '@', 2)[0];
  } else {
    return '';
  }
};

/**
 * Get Person Domain
 *
 * @function
 * @memberof Framework
 * @private
 * @param {Ojbect} person- Webex Person Object
 * @returns {string}
 */
Framework.prototype.getPersonDomain = function (person) {
  if (person.emails.length >= 1) {
    return _.split(person.emails[0], '@', 2)[1];
  } else {
    return '';
  }
};


/**
 * Get Message Object by ID
 *
 * @function
 * @memberof Framework
 * @param {String} messageId - Message ID from Webex API.
 * @returns {Promise.<Message>}
 */
Framework.prototype.getMessage = function (messageId) {
  return this.webex.messages.get(messageId);
  //    .then(message => this.parseMessage(message));
};

/**
 * Get Files from Message Object by ID
 *
 * @function
 * @memberof Framework
 * @param {String} messageId - Message ID from Webex API.
 * @returns {Promise.<Array>}
 */
Framework.prototype.getFiles = function (messageId) {
  //TODO figure out how/if Webex SDK handles this
  when.reject(new Error('framework.getFiles not yet supported'));

  // return this.webex.messageGet(messageId)
  //   .then(message => this.parseMessage(message))
  //   .then(message => this.parseFile(message))
  //   .then(message => {
  //     if (typeof message.files !== undefined && message.files instanceof Array) {
  //       return when(message.files);
  //     } else {
  //       return when.reject(new Error('no files found in message'));
  //     }
  //   });
};

/**
 * Get Membership Object by ID
 *
 * @function
 * @memberof Framework
 * @private
 * @param {String} membershipId - Membership ID from Webex API.
 * @returns {Promise.<Membership>}
 */
Framework.prototype.getMembership = function (membershipId) {
  return this.webex.memberships.get(membershipId)
    .then(membership => when(membership));
  // Not convinced this is necessary
  // .then(membership => {
  //   membership.created = moment(membership.created).utc().toDate();
  //   membership.personEmail = _.toLower(membership.personEmail);
  //   membership.email = membership.personEmail;

  //   return when(membership);
  // });
};

/**
 * Get Memberships by Room ID
 *
 * @function
 * @memberof Framework
 * @private
 * @param {String} [roomId] - Room ID from Webex API.
 * @returns {Promise.<Array>}
 * Promise fulfilled with Array of updated Membership objects.
 */
Framework.prototype.getMemberships = function (roomId) {
  if (!roomId) {
    return this.webex.memberships.list()
      .then(memberships => {
        let membershipList = memberships.items;
        return when.map(membershipList, membership => {
          // Not convinced this is necessary
          // membership.created = moment(membership.created).utc().toDate();
          membership.personEmail = _.toLower(membership.personEmail);
          membership.email = membership.personEmail;

          return when(membership);
        });
      });
  }

  else {
    return this.webex.memberships.list({ roomId: roomId })
      .then(memberships => {
        let membershipList = memberships.items;
        return when.map(membershipList, membership => {
          // Not convinced this is necessary
          // membership.created = moment(membership.created).utc().toDate();
          membership.personEmail = _.toLower(membership.personEmail);
          membership.email = membership.personEmail;

          return when(membership);
        });
      });
  }
};

/**
 * Get Team Membership Object by ID
 *
 * @function
 * @memberof Framework
 * @private
 * @param {String} teamMembershipId - Team Membership ID from Webex API.
 * @returns {Promise.<TeamMembership>}
 */
Framework.prototype.getTeamMembership = function (teamMembershipId) {

  return this.webex.teamMembership.get(teamMembershipId)
    .then(memberships => when(memberships));
  // Not convinced this is necessary
  // .then(membership => {
  //     membership.created = moment(membership.created).utc().toDate();
  //     membership.personEmail = _.toLower(membership.personEmail);
  //     membership.email = membership.personEmail;

  //     return when(membership);
  //   });
};

/**
 * Get Memberships by Team ID
 *
 * @function
 * @memberof Framework
 * @private
 * @param {String} teamId - Team ID from Webex API.
 * @returns {Promise.<Array>}
 */
Framework.prototype.getTeamMemberships = function (teamId) {
  if (teamId) {
    return this.webex.teamMemberships.list({ teamId: teamId })
      .then(memberships => {
        membershipList = memberships.items;
        return when.map(membershipList, teamMembership => {
          teamMembership.created = moment(teamMembership.created).utc().format();
          teamMembership.personEmail = _.toLower(teamMembership.personEmail);
          teamMembership.email = teamMembership.personEmail;

          return when(teamMembership);
        });
      });
  }

  else {
    return when.reject(new Error('missing teamId parameter'));
  }
};

/**
 * Get Webhook Object by ID
 *
 * @function
 * @memberof Framework
 * @private
 * @param {String} webhookId - Webhook ID from Webex API.
 * @returns {Promise.<Webhook>}
 */
Framework.prototype.getWebhook = function (webhookId) {
  return this.webex.webhooks.get(webhookId)
    .then(webhook => {
      webhook.created = moment(webhook.created).utc().format();
      if (typeof webhook.filter === 'string') {
        if (webhook.filter.split('=')[0] === 'roomId') {
          webhook.roomId = webhook.filter.split('=')[1];
        }
      }

      return when(webhook);
    });
};

/**
 * Get Webhooks
 *
 * @function
 * @memberof Framework
 * @private
 * @returns {Promise.<Array>}
 */
Framework.prototype.getWebhooks = function () {
  return this.webex.webhooks.list()
    .then(webhooks => {
      _.forEach(webhooks.items, webhook => {
        webhook.created = moment(webhook.created).utc().format();
        if (typeof webhook.filter === 'string') {
          if (webhook.filter.split('=')[0] === 'roomId') {
            webhook.roomId = webhook.filter.split('=')[1];
          }
        }
      });
      return when(webhooks.items);
    });
};

/**
 * Get Attachement Action by ID
 *
 * @function
 * @memberof Framework
 * @param {String} attachmentActionId - attachmentActionID from Webex API.
 * @returns {Promise.<AttachmentAction>}
 */
Framework.prototype.getAttachmentAction = function (attachmentActionId) {
  return this.webex.attachmentActions.get(attachmentActionId);
};


/**
 * Process a Room create event.
 *
 * @function
 * @memberof Framework
 * @private
 * @returns {Promise}
 */
Framework.prototype.onRoomCreated = function (room) {
  var bot = _.find(this.bots, bot => bot.room.id === room.id);
  if (bot) {
    bot.room = room;
    bot.lastActivity = moment().utc().format();
  }
  return when(true);
};

/**
 * Process a Room update event.
 *
 * @function
 * @memberof Framework
 * @private
 * @returns {Promise}
 */
Framework.prototype.onRoomUpdated = function (room) {
  var bot = _.find(this.bots, bot => bot.room.id === room.id);
  if (bot) bot.lastActivity = moment().utc().format();

  // if bot exists in monitored room...
  if (bot) {
    //update bot
    bot.isGroup = (room.type === 'group');
    bot.isDirect = (room.type === 'direct');

    // emit event locked
    if (bot.room.isLocked != room.isLocked) {
      if (room.isLocked) {
        /**
         * Room Locked event.
         *
         * @event roomLocked
         * @property {object} bot - Bot Object
         * @property {string} id - Framework UUID
         */
        this.emit('roomLocked', bot, this.id);
        bot.emit('roomLocked', bot, bot.id);

        return when(true);
      } else {
        /**
         * Room Unocked event.
         *
         * @event roomUnocked
         * @property {object} bot - Bot Object
         * @property {string} id - Framework UUID
         */
        this.emit('roomUnlocked', bot, this.id);
        bot.emit('roomUnlocked', bot, bot.id);
        return when(true);
      }
    }
    bot.room = room;

    // else bot does not exist in monitored room
  } else {
    return when(true);
  }
};

/**
 * Process a new Membership event.
 *
 * @function
 * @memberof Framework
 * @private
 * @param {Object} membership - Webex Team Membership Object
 * @param {String} actorId - Webex Team Membership Created event actorId
 * @returns {Promise}
 */
Framework.prototype.onMembershipCreated = function (membership, actorId) {
  var bot = _.find(this.bots, bot => bot.room.id === membership.roomId);
  if (bot) bot.lastActivity = moment().utc().format();

  // if bot membership added to un-monitored room...
  if (!bot && this.initialized && membership.personEmail === this.email) {
    // spawn bot
    return this.spawn(membership, actorId);
  }

  // else if other membership added to monitored room...
  else if (bot) {

    // No longer trying to maintain space memberships in bot object
    // add new membership to bot.memberships
    // bot.memberships.push(membership);

    // return this.getPerson(membership.personId)
    //   .then(person => {

    /**
     * Member Enter Room event.
     *
     * @event memberEnters
     * @property {object} bot - Bot Object
     * @property {object} membership - Membership Object
     * @property {string} id - Framework UUID
     */
    this.emit('memberEnters', bot, membership, this.id);
    bot.emit('memberEnters', bot, membership, bot.id);
    return when(true);
    //    });
  }

  // else, bot not found and membership added for other user
  else {
    return when(true);
  }
};

/**
 * Process a updated Membership event.
 *
 * @function
 * @memberof Framework
 * @private
 * @param {Object} membership - Webex Membership Object
 * @returns {Promise}
 */
Framework.prototype.onMembershipUpdated = function (membership) {
  var bot = _.find(this.bots, bot => bot.room.id === membership.roomId);
  if (bot) bot.lastActivity = moment().utc().format();

  // if membership updated in monitored room
  if (bot && membership.personId === bot.id) {
    // update bot membership
    bot.membership = membership;

    // emit event Moderator
    if (bot.isModerator != membership.isModerator) {
      if (membership.isModerator) {
        /**
         * Bot Added as Room Moderator.
         *
         * @event botAddedAsModerator
         * @property {object} bot - Bot Object
         * @property {string} id - Framework UUID
         */
        this.emit('botAddedAsModerator', bot, this.id);
        bot.emit('botAddedAsModerator', bot, bot.id);
      } else {
        /**
         * Bot Removed as Room Moderator.
         *
         * @event botRemovedAsModerator
         * @property {object} bot - Bot Object
         * @property {string} id - Framework UUID
         */
        this.emit('botRemovedAsModerator', bot, this.id);
        bot.emit('botRemovedAsModerator', bot, bot.id);
      }
      // Track the new membership status
      bot.isModerator = membership.isModerator;
    }
  }
  // else if other membership updated in monitored room
  else if (bot && this.initialized) {
    // A slight inefficiency here is that we notify about moderator
    // status on EVERY membership change even if something else changed
    // This rarely (never?) happens and seems worth tht cost savings
    // of not maintaining the status of every member in the bot
    // as was done in the original node-flint framework

    // no longer trying to maintain space memberships in bot
    // update bot room membership
    // bot.memberships = _.map(bot.memberships, m => {
    //   // if membership ...
    //   if (m.id === membership.id) {

    //     // get person
    //     if (m.isModerator != membership.isModerator) {
    //       this.getPerson(membership.personId)
    //         .then(person => {
    // emit event added Moderator
    if (membership.isModerator) {
      /**
       * Member Added as Moderator.
       *
       * @event memberAddedAsModerator
       * @property {object} bot - Bot Object
       * @property {object} membership - Membership Object
       * @property {string} id - Framework UUID
       */
      this.emit('memberAddedAsModerator', bot, membership, this.id);
      bot.emit('memberAddedAsModerator', bot, membership, bot.id);
    } else {
      /**
       * Member Removed as Moderator.
       *
       * @event memberRemovedAsModerator
       * @property {object} bot - Bot Object
       * @property {object} membership - Membership Object
       * @property {string} id - Framework UUID
       */
      this.emit('memberRemovedAsModerator', bot, membership, this.id);
      bot.emit('memberRemovedAsModerator', bot, membership, bot.id);
    }
  }
  return when(true);
};

/**
 * Process a deleted Membership event.
 *
 * @function
 * @memberof Framework
 * @private
 *
 * @param {Object} membership - Webex Membership Object
 * @param {String} actorId - Webex Team Membership Deleted event actorId
 * @returns {Promise}
 */
Framework.prototype.onMembershipDeleted = function (membership, actorId) {
  var bot = _.find(this.bots, bot => bot.room.id === membership.roomId);

  // if bot membership deleted in monitored room
  if (bot && membership.personId === bot.person.id) {
    // despawn bot
    return this.despawn(bot.room.id, actorId)
      .then(() => when(true))
      .catch(() => when(false));
  }

  // else if other membership deleted in monitored room...
  else if (bot) {
    // No longer maintaining memberships in bot object
    // remove bot room membership
    // bot.memberships = _.reject(bot.memberships, { 'id': membership.id });

    // return this.getPerson(membership.personId)
    //   .then(person => {

    /**
     * Meber Exits Room.
     *
     * @event memberExits
     * @property {object} bot - Bot Object
     * @property {object} membership - Membership Object
     * @property {string} id - Framework UUID
     */
    this.emit('memberExits', bot, membership, this.id);
    bot.emit('memberExits', bot, membership, bot.id);

    return when(true);
    // });
  }

  // else, bot not found and membership deleted for other user
  else {
    return when(true);
  }
};

/**
 * Process a new Message event.
 *
 * @function
 * @memberof Framework
 * @private
 * @param {Object} tembership - Webex Team Membership Object
 * @returns {Promise}
 */
Framework.prototype.onMessageCreated = function (message) {
  var bot = _.find(this.bots, bot => bot.room.id === message.roomId);
  if (bot) bot.lastActivity = moment().utc().format();

  // if bot found...
  if (bot) {
    // check if message is from bot...
    // using the bot's ID instead of the email guarantees this will work
    // even if the bot's name changes (eg: mybot@sparkbot.io -> mybot@webex.bot)
    if (message.personId === bot.person.id) {
      // ignore messages from bot
      return when(false);
    }

    return this.getTrigger('message', message)
      //return this.getTrigger(message.id)
      .then(trigger => {

        // function to run the action
        function runActions(matched, bot, trigger, id) {
          // process preference logic
          if (matched.length > 1) {
            matched = _.sortBy(matched, match => match.preference);
            var prefLow = matched[0].preference;
            var prefHigh = matched[matched.length - 1].preference;

            if (prefLow !== prefHigh) {
              matched = _.filter(matched, match => (match.preference === prefLow));
            }
          }

          _.forEach(matched, lex => {
            // for regex
            if (lex.phrase instanceof RegExp && typeof lex.action === 'function') {
              // define trigger.args, trigger.phrase
              trigger.args = trigger.text.split(' ');
              trigger.phrase = lex.phrase;

              // run action
              lex.action(bot, trigger, id);
              return true;
            }

            // for string
            else if (typeof lex.phrase === 'string' && typeof lex.action === 'function') {
              // find index of match
              var args = _.toLower(trigger.text).split(' ');
              var indexOfMatch = args.indexOf(lex.phrase) !== -1 ? args.indexOf(lex.phrase) : 0;

              // define trigger.args, trigger.phrase
              trigger.args = trigger.text.split(' ');
              trigger.args = trigger.args.slice(indexOfMatch, trigger.args.length);
              trigger.phrase = lex.phrase;

              // run action
              lex.action(bot, trigger, id);
              return true;
            }

            // for nothing...
            else {
              return false;
            }
          });
        }

        // if mentioned
        if (trigger.message.mentionedPeople && _.includes(trigger.message.mentionedPeople, this.person.id)) {

          trigger.args = trigger.text.split(' ');

          /**
           * Bot Mentioned.
           *
           * @event mentioned
           * @property {object} bot - Bot Object
           * @property {object} trigger - Trigger Object
           * @property {string} id - Framework UUID
           */
          this.emit('mentioned', bot, trigger, this.id);
          bot.emit('mentioned', bot, trigger, bot.id);
        }

        // emit message event
        if (trigger.text) {

          /**
           * Message Recieved.
           *
           * @event message
           * @property {object} bot - Bot Object
           * @property {object} trigger - Trigger Object
           * @property {string} id - Framework UUID
           */
          this.emit('message', bot, trigger, this.id);
          bot.emit('message', bot, trigger, bot.id);
        }

        // emit file event
        // TODO go back and look at this, not handling files yet
        if (trigger.message.files) {

          /**
           * File Recieved.
           *
           * @event files
           * @property {object} bot - Bot Object
           * @property {trigger} trigger - Trigger Object
           * @property {string} id - Framework UUID
           */
          this.emit('files', bot, trigger, this.id);
          bot.emit('files', bot, trigger, bot.id);
        }

        // check if message is from bot...
        // using the bot's ID instead of the email guarantees this will work
        // even if the bot's name changes (eg: mybot@sparkbot.io -> mybot@webex.bot)
        // No longer needed?   I think this check happens much earlier now..
        // if (trigger.personId === bot.person.id) {
        //   // ignore messages from bot
        //   return when(false);
        // }

        // if trigger text present...
        if (trigger.text) {

          // return matched lexicon entry
          var matched = _.filter(this.lexicon, lex => {

            // if lex.phrase is regex
            if (lex.phrase && lex.phrase instanceof RegExp && lex.phrase.test(trigger.text)) {
              return true;
            }

            // if lex.phrase is string and this is NOT a bot account
            else if (!this.isBotAccount && lex.phrase && typeof lex.phrase === 'string' && lex.phrase === _.toLower(trigger.text).split(' ')[0]) {
              return true;
            }

            // if lex.phrase is string and this is a bot account
            else if (this.isBotAccount && lex.phrase && typeof lex.phrase === 'string') {
              var regexPhrase = new RegExp('(^| )' + lex.phrase.replace(/([\.\^\$\*\+\?\(\)\[\{\\\|])/g, '\\$1') + '($| )', 'i');
              return (regexPhrase.test(trigger.text));
            }

            // else, no valid match
            else return false;
          });
        }

        // else trigger.text not present...
        else {
          return when(false);
        }

        // if matched
        if (matched && typeof this.authorize === 'function') {
          // if authorization function exists...
          return when(this.authorize(bot, trigger, this.id))
            .then(authorized => {

              //if authorized
              if (authorized) {
                runActions(matched, bot, trigger, this.id);
                return when(trigger);
              } else {
                this.debug('"%s" was denied running command in room "%s" for account "%s"', trigger.personEmail, trigger.roomTitle, this.email);
                return when(false);
              }
            });
        }

        // else, if matched and no authorization configured, run command
        else if (matched) {
          runActions(matched, bot, trigger, this.id);
          return when(trigger);
        }

        // else, do nothing...
        else {
          return when(false);
        }
      });
  }

  // else, bot not found...
  else {
    return when(false);
  }
};

/**
 * Process a new attachment action event.
 *
 * @function
 * @memberof Framework
 * @private
 * @param {Object} attachmentAction - Webex attachentAction  Object
 * @returns {Promise}
 */
Framework.prototype.onAttachmentActions = function (attachmentAction) {
  var bot = _.find(this.bots, bot => bot.room.id === attachmentAction.roomId);
  if (bot) bot.lastActivity = moment().utc().format();

  // if bot found...
  if (bot) {
    return this.getTrigger('attachmentAction', attachmentAction)
      .then((trigger) => {
        this.emit('attachmentAction', bot, trigger, this.id);
      });
    // else, bot not found...
  } else {
    return when(false);
  }
};

/**
 * Spawns a bot in a Webex Teams Space.
 * 
 * @function
 * @memberof Framework
 * @private
 * @param {Object} Membership of bot in room
 * @param {String} [actorId] actorId associated with a membership:created event if available
 * @returns {Promise.<Boolean>}
 * 
 */
Framework.prototype.spawn = function (membership, actorId) {

  // if active...
  if (!this.active) {
    return when(false);
  }

  // validate params
  if ((typeof memberships !== 'object') && (typeof membership.roomId !== 'string')) {
    this.debug('A bot for acount "%s" could not spawn as membership room id not valid', this.email);
    return when(false);
  }
  let roomId = membership.roomId;

  // validate bot is not already assigned to room
  var foundBot = _.find(this.bots, bot => (bot.room.id === roomId));
  if (foundBot) {
    this.debug('A bot for acount "%s" could not spawn as bot already exists in room', this.email);
    return when(false);
  }

  // create new bot
  var newBot = new Bot(this);
  // assign membership properties to bot object
  newBot.membership = membership;
  newBot.isModerator = membership.isModerator;

  // get room that bot is spawning in
  return this.getRoom(roomId)
    .then(room => {
      if (room.title == '') {
        room.title = 'Default title';
      }

      newBot.room = room;
      newBot.isDirect = (room.type === 'direct');
      newBot.isGroup = (room.type === 'group');
      newBot.isLocked = room.isLocked;

      return when(room);
    })

    // No longer storing this in the bot
    // get team
    // .then(room => {
    //   // if team
    //   if (typeof room.teamId !== 'undefined') {
    //     return this.getTeam(room.teamId)
    //       .then(team => {
    //         newBot.team = team;
    //         newBot.isTeam = true;
    //         return when(room);
    //       })
    //       .catch(err => {
    //         newBot.team = {};
    //         newBot.isTeam = false;
    //         return when(room);
    //       });
    //   } else {
    //     newBot.isTeam = false;
    //     newBot.team = {};
    //     return when(room);
    //   }
    // })
    .then((room) => {
      // if direct, set recipient
      if (newBot.isDirect) {
        return this.getMemberships(room.id)
          .then((memberships) => {
            // remove bot membership from room memberships
            memberships = _.reject(memberships, { 'personId': this.person.id });
            // remaining membership is the other user in the space
            newBot.isDirectTo = memberships[0].personEmail;
            return when(newBot);
          });
      } else {
        return when(newBot);
      }
    })
    //   })

    // Init the bot specific configuration in the storage adapter
    .then(() => newBot.initStorage(this))
    .catch((e) => {
      console.error(`framework storage driver initStorage failed: "${e.message}. ` +
        `New bot for space "${newBot.room.title}" may not have initial storage data!`);
      return when(true);
    })

    // No longer maintaining all memberships, just the one belonging to the bot
    // // get memberships of room
    // // TODO  This seems really expensive.   Can we just get rid of it?
    // // One optimization might be to just get my own memembership
    // .then(room => this.getMemberships(room.id))
    // .then(memberships => {

    //   // get bot membership from room memberships
    //   var botMembership = _.find(memberships, { 'personId': this.person.id });

    //   // remove bot membership from room memberships
    //   memberships = _.reject(memberships, { 'personId': this.person.id });

    //   // assign room memberships to bot
    //   newBot.memberships = memberships;

    //   // assign membership properties to bot object
    //   newBot.membership = embership;
    //   newBot.isModerator = membership.isModerator;
    //   newBot.isMonitor = membership.isMonitor;

    //   // if direct, set recipient
    //   if (newBot.isDirect) {
    //     newBot.isDirectTo = memberships[0].personEmail;
    //   }

    //   return when(memberships);
    // })

    // register and start bot
    .then(() => {

      // start bot
      newBot.start();

      // add bot to array of bots
      this.bots.push(newBot);

      /**
       * Bot Spawned.
       *
       * @event spawn
       * @property {object} bot - Bot Object
       * @property {string} id - Framework UUID
       * @property {string} addedBy - ID of user who added bot to space if available
       * 
       * Bots are typically spawned in one of two ways
       * 1) When the framework first starts it looks for spaces that 
       *    our bot is already part of.  When discovered a new bot is spawned
       * 2) After the framework has started, if a user adds our bot to a space
       *    a membership:created event occurs which also spawns a bot
       * 
       * In the latter case, we pass the actorId associated with the membership:created
       * event.  This allows bots to do something with info about the user who
       * added them when they are first spawned.
       *
       * @example
       * // DM the user who added bot to a group space
       * framework.on('spawn', function(bot, flintId, addedBy) {
       *   if (!framework.initialized) {
       *      // don't say anything here or your bot's spaces will get
       *      // spammed every time your server is restarted
       *      framework.debug(`While starting up our bot was found '+
       *        in a space called: ${bot.room.title}`);
       *   } else {
       *     if ((bot.room.type === 'group') && (addedBy)) {
       *       bot.dm(addedBy, 'I see you added me to the the space '  + bot.room.title + ',
       *         but I'm not allowed in group spaces.  We can talk here if you like.');
       *       bot.exit();
       * });
       *
       */
      if (actorId) {
        this.emit('spawn', newBot, this.id, actorId);
      } else {
        this.emit('spawn', newBot, this.id);
      }

      return when(true);
    })

    // insert delay
    // Not convinced this is necessary
    //.delay(this.webex.minTime)

    // catch errors with spawn
    .catch(err => {
      console.error(`Failed spawning a bot in roomId: ${roomId}.  Error: ${err.message}`);
      // remove reference
      newBot = {};

      return when(false);
    });
};

/**
 * Despawns a bot in a Webex Teams Space.
 *
 * @function
 * @memberof Framework
 * @private
 * @param {String} Room ID - The ID for a Webex Teams Space.
 * @param {String} actorId - Webex Team Membership Created event actorId
 * @returns {Promise.<Bot>}
 */
Framework.prototype.despawn = function (roomId, actorId) {
  var bot = _.find(this.bots, bot => (bot.room.id === roomId));

  if (bot) {
    // shutdown bot
    bot.stop();

    // remove objects assigned to memory store for this bot
    return this.forgetByRoomId(bot.room.id)
      .then(() => {
        /**
         * Bot Despawned.
         *
         * @event despawn
         * @property {object} bot - Bot Object
         * @property {string} id - Framework UUID
         * @property {string} id - ID of user who removed the bot (if available)
         */
        if (actorId) {
          this.emit('despawn', bot, this.id, actorId);
        } else {
          this.emit('despawn', bot, this.id);
        }

        // remove bot from framework
        this.bots = _.reject(this.bots, { 'id': bot.id });

        return when(true);
      });
  } else {
    return when.reject(new Error('despawn failed to find bot in room'));
  }
};

/**
 * Add action to be performed when bot hears a phrase.
 *
 * @function
 * @memberof Framework
 * @param {Regex|String} phrase - The phrase as either a regex or string. If
 * regex, matches on entire message.If string, matches on first word.
 * @param {Function} action - The function to execute when phrase is matched.
 * Function is executed with 2 variables. Trigger and Bot. The Trigger Object
 * contains information about the person who entered a message that matched the
 * phrase. The Bot Object is an instance of the Bot Class as it relates to the
 * room the message was heard.
 * @param {String} [helpText] - The string of text that describes how this
 * command operates.
 * @param {Number} [preference=0] - Specifies preference of phrase action when
 * overlapping phrases are matched. On multiple matches with same preference,
 * all matched actions are excuted. On multiple matches with difference
 * preference values, only the lower preferenced matched action(s) are executed.
 * @returns {String}
 *
 * @example
 * // using a string to match first word and defines help text
 * framework.hears('/say', function(bot, trigger, id) {
 *   bot.say(trigger.args.slice(1, trigger.arges.length - 1));
 * }, '/say <greeting> - Responds with a greeting');
 *
 * @example
 * // using regex to match across entire message
 * framework.hears(/(^| )beer( |.|$)/i, function(bot, trigger, id) {
 *   bot.say('Enjoy a beer, %s! 🍻', trigger.person.displayName);
 * });
 */
Framework.prototype.hears = function (phrase, action, helpText, preference) {
  var id = u.genUUID64();

  // parse function args
  var args = Array.prototype.slice.call(arguments);
  phrase = args.length > 0 && (typeof args[0] === 'string' || args[0] instanceof RegExp) ? args.shift() : null;
  action = args.length > 0 && typeof args[0] === 'function' ? args.shift() : null;
  helpText = args.length > 0 && typeof args[0] === 'string' ? args.shift() : null;
  preference = args.length > 0 && typeof args[0] === 'number' ? args.shift() : 0;

  if (typeof phrase === 'string' && action) {
    phrase = _.toLower(phrase);
    this.lexicon.push({ 'id': id, 'phrase': phrase, 'action': action, 'helpText': helpText, 'preference': preference });
    return id;
  }

  else if (phrase instanceof RegExp && action) {
    this.lexicon.push({ 'id': id, 'phrase': phrase, 'action': action, 'helpText': helpText, 'preference': preference });
    return id;
  }

  else {
    throw new Error('Invalid framework.hears() syntax');
  }
};

/**
 * Remove a "framework.hears()" entry.
 *
 * @function
 * @memberof Framework
 * @param {String} id - The "hears" ID.
 * @returns {null}
 *
 * @example
 * // using a string to match first word and defines help text
 * var hearsHello = framework.hears('/framework', function(bot, trigger, id) {
 *   bot.say('Hello %s!', trigger.person.displayName);
 * });
 * framework.clearHears(hearsHello);
 */
Framework.prototype.clearHears = function (hearsId) {
  this.lexicon = _.reject(this.lexicon, lex => (lex.id === hearsId));
};

/**
 * Display help for registered Framework Commands.
 *
 * @function
 * @param {String} [header=Usage:] - String to use in header before displaying help message.
 * @param {String} [footer=Powered by Webex Node Bot Framework - https://github.com/webex/webex-node-bot-framework] - String to use in footer before displaying help message.
 * @returns {String}
 *
 * @example
 * framework.hears('/help', function(bot, trigger, id) {
 *   bot.say(framework.showHelp());
 * });
 */
Framework.prototype.showHelp = function (header, footer) {
  header = header ? header : 'Usage:';
  footer = footer ? footer : 'Powered by Webex Node Bot Framework - https://github.com/webex/webex-node-bot-framework';

  var helpText = '';

  _.forEach(this.lexicon, lex => {
    if (lex.helpText) {
      helpText = helpText + '* ' + lex.helpText + '\n';
    }
  });

  helpText = header + '\n\n' + helpText + '\n' + footer + '\n\n';

  return helpText;
};

/**
 * Attaches authorizer function.
 *
 * @function
 * @memberof Framework
 * @param {Function} Action - The function to execute when phrase is matched
 * to authenticate a user.  The function is passed the bot, trigger, and id and
 * expects a return value of true or false.
 * @returns {Boolean}
 *
 * @example
 * function myAuthorizer(bot, trigger, id) {
 *   if(trigger.personEmail === 'john@test.com') {
 *     return true;
 *   }
 *   else if(trigger.personDomain === 'test.com') {
 *     return true;
 *   }
 *   else {
 *     return false;
 *   }
 * }
 * framework.setAuthorizer(myAuthorizer);
 */
Framework.prototype.setAuthorizer = function (fn) {
  if (typeof fn === 'function') {
    this.authorize = when.lift(fn);
    return true;
  } else {
    this.authorize = null;
    return false;
  }
};
Framework.prototype.authorize = null;

/**
 * Removes authorizer function.
 *
 * @function
 * @memberof Framework
 * @returns {null}
 *
 * @example
 * framework.clearAuthorizer();
 */
Framework.prototype.clearAuthorizer = function () {
  this.authorize = null;
};

/**
 * Defines storage backend.
 *
 * @function
 * @memberof Framework
 * @param {Function} Driver - The storage driver.
 * @returns {Promise.<Boolean>} - True if driver loaded succesfully
 *
 * @example
 * // define memory store (default if not specified)
 * framework.storageDriver(new MemStore());
 */
Framework.prototype.storageDriver = function (driver) {

  // validate storage module initStorage() method
  if (typeof driver.getName === 'function') {
    this.storageDriverName = driver.getName();
  } else {
    this.storageDriverName = '';
  }

  // validate storage module initStorage() method
  if (typeof driver.initStorage === 'function') {
    Bot.prototype.initStorage = function (framework) {
      if ((typeof this.room && 'object') && (typeof this.room.id === 'string')) {
        var id = this.room.id;
        return driver.initStorage.call(driver, id, framework.initialized, framework.initBotStorageData);
      } else {
        return when.reject(new Error('bot.initStorage() called when bot does not have a valid room object'));
      }
    };
  } else {
    return when.reject(new Error('storage module missing initStorage() function'));
  }


  // validate storage module store() method
  if (typeof driver.store === 'function') {
    Bot.prototype.store = function (key, value) {
      if (this.active) {
        var id = this.room.id;
        return driver.store.call(driver, id, key, value);
      } else {
        return when(value);
      }
    };
  } else {
    return when.reject(new Error('storage module missing store() function'));
  }

  // validate storage module recall() method
  if (typeof driver.recall === 'function') {
    Bot.prototype.recall = function (key) {
      if (this.active) {
        var id = this.room.id;
        return driver.recall.call(driver, id, key);
      } else {
        return when(value);
      }
    };
  } else {
    return when.reject(new Error('storage module missing recall() function'));
  }

  // validate storage module forget() method
  if (typeof driver.forget === 'function') {
    Bot.prototype.forget = function (key) {
      if (this.active) {
        var id = this.room.id;
        return driver.forget.call(driver, id, key);
      } else {
        return when(value);
      }
    };

    Framework.prototype.forgetByRoomId = function (roomId) {
      return driver.forget.call(driver, roomId)
        .catch(() => {
          // ignore errors when called by forgetByRoomId
          return when(true);
        });
    };
  } else {
    return when.reject(new Error('storage module missing forget() function'));
  }

  // validate or implement storage module writeMetric() method
  if (typeof driver.writeMetric === 'function') {
    Bot.prototype.writeMetric = function (appData, actor) {
      if (this.active) {
        return driver.writeMetric.call(driver, this, appData, actor);
      } else {
        return when(value);
      }
    };
  } else {
    // Create a no-op for this optional method
    Bot.prototype.writeMetric = function () {
      return when.reject(new Error(`Framework storage adaptor `+
        `${this.framework.storageDriverName} does not support writeMetric() method`));
    };
  }

  // storage defined
  return when(this.storageActive = true);
};

/**
 * Remove objects from memory store associated to a roomId.
 *
 * @function
 * @private
 * @param {String} roomId
 * @returns {Boolean}
 */
Framework.prototype.forgetByRoomId = null;

/**
 * Load a Plugin from a external file.
 * @function
 * @memberof Framework
 * @param {String} path - Load a plugin at given path.
 * @returns {Boolean}
 *
 * @example
 * framework.use('events.js');
 *
 * @example
 * // events.js
 * module.exports = function(framework) {
 *   framework.on('spawn', function(bot) {
 *     console.log('new bot spawned in room: %s', bot.myroom.title);
 *   });
 *   framework.on('despawn', function(bot) {
 *     console.log('bot despawned in room: %s', bot.myroom.title);
 *   });
 *   framework.on('messageCreated', function(message, bot) {
 *     console.log('"%s" said "%s" in room "%s"', message.personEmail, message.text, bot.myroom.title);
 *   });
 * };
 */
Framework.prototype.use = function (pluginPath) {
  if (path.parse(pluginPath).ext === '.js') {
    try {
      require(pluginPath)(this);
      this.debug('Loading framework plugin at "%s"', pluginPath);
      return true;
    }

    catch (err) {
      this.debug('Could not load framework plugin at "%s"', pluginPath);
      return false;
    }
  }
};

module.exports = Framework;

function cleanupListeners(framework) {
  // Cleanup webhooks or websockets
  if (framework.options.webhookUrl) {
    return framework.getWebhooks()
      // get webhooks
      .then(webhooks => {

        // remove all webhooks on stop
        if (!framework.options.removeWebhooksOnStart) {
          var webhooksToRemove = _.filter(webhooks, webhook => {
            return (webhook.name == u.base64encode(framework.options.webhookUrl.split('/')[2] + ' ' + framework.email));
          });

          if (webhooksToRemove instanceof Array && webhooksToRemove.length > 0) {
            return when.map(webhooksToRemove, webhook => framework.webex.webhooks.remove(webhook))
              .then(() => when(true))
              .catch(() => when(true));
          } else {
            return when(true);
          }
        }

        // else, only remove webhooks this app created
        else {
          return when.map(webhooks, webhook => framework.webex.webhooks.remove(webhook))
            .then(() => when(true))
            .catch(() => when(true));
        }

      });
  } else {
    return framework.websocket.cleanup()
      .then(() => {
        delete framework.websocket;
        return when(true);
      });
  }
}

function optionsIncludeNonSupported(options) {
  if (typeof options != 'object') {
    return 'Framework must be instantiated with an object that contains options';
  }
  if (!('token' in options)) {
    return 'Framework options missing required attribute: token';
  }
  if ('maxPageItems' in options) {
    return 'Framework instantiated with non supported option: maxPageItems';
  }
  if ('maxConcurrent' in options) {
    return 'Framework instantiated with non supported option: maxConcurrent';
  }
  if ('minTime' in options) {
    return 'Framework instantiated with non supported option: minTime';
  }
  if ('requeueMinTime' in options) {
    return 'Framework instantiated with non supported option: requeueMinTime';
  }
  if ('requeueMaxRetry' in options) {
    return 'Framework instantiated with non supported option: requeueMaxRetry';
  }
  if ('requeueCodes' in options) {
    return 'Framework instantiated with non supported option: requeueCodes';
  }
  if ('queueSize' in options) {
    return 'Framework instantiated with non supported option: queueSize';
  }
  if ('requeueSize' in options) {
    return 'Framework instantiated with non supported option: requeueSize';
  }
  return '';
}
