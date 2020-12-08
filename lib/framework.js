'use strict';

var EventEmitter = require('events').EventEmitter;
EventEmitter.prototype._maxListeners = 0;
var validator = require('../lib/validator');
var sequence = require('when/sequence');
var moment = require('moment');
var HttpsProxyAgent = require('https-proxy-agent');
var url = require('url');
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
   * @property {string} [httpsProxy] - If specified the https proxy to route request to webex through.  Ie: "https://proxy.mycompany.com:8090"
   * @property {number}[maxStartupSpaces] - If specified, the maximum number of spaces with our bot that the framework will discover during startup.  
        If not specified the framework will attempt to discover all the spaces the framework's identity is in and "spawn" a bot object for all of
        them before emitting an "initiatialized" event.  For popular bots that belog to hundreds or thousands of spaces, this can result
        in long startup times. Setting this to a number (ie: 100) will limit the number of bots spawned before initialization.
        Bots that are driven by external events and rely on logic that checks if an appropriate bot object exists before sending a notification 
        should not modify the default.  Bots that are driven primarily by webex user commands to the bot may
        set this to 0 or any positive number to facilitate a faster startup.  After initialization new bot objects are created ("spawned")
        when the bot is added to a new space or, if the framework receives events in existing spaces that it did not discover during initialization.
        In the case of these "late discoveries", bots objects are spawned "just in time".  This behavior is similar to the way
        the webex teams clients work.  See the [Spawn Event docs](#"spawn") to discover how to handle the different types of spawn events.
   * @property {string} [messageFormat=text] - Default Webex message format to use with bot.say().
   * @property {object} [initBotStorageData={}] - Initial data for new bots to put into storage. 
   * @property {string} [id=random] - The id this instance of Framework uses.
   * @property {string} [webhookRequestJSONLocation=body] - The property under the Request to find the JSON contents.
   * @property {Boolean} [removeWebhooksOnStart=true] - If you wish to have the bot remove all account webhooks when starting. Ignored if webhookUrl is not set.
   * @property {Boolean} [removeDeviceRegistrationsOnStart=false] - If you use websockets and get "excessive device registrations" during iterative development, this will delete ALL device registrations.  Use with caution! Ignored if webhookUrl is set.
   * @property {string} [restrictedToEmailDomains] - Set to a comma seperated list of email domains the bot may interact with, ie "myco.com,myco2.com".  
        For more details see the [Membership-Rules README](./doc/membership-rules-readme.md)
   * @property {string} [guideEmails] - Set to a comma seperated list of Webex users emails who MUST be in a space in order for the bot to work, ie "user1@myco.com,user2@myco2.com".  
        For more details see the [Membership-Rules README](./doc/membership-rules-readme.md)
   * @property {string} [membershipRulesDisallowedResponse] - Message from bot when it detects it is in a space that does not conform to the membership rules 
        specified by the `restrictedToEmailDomains` and/or the `guideEmails` parameters.   Default messages is
        "Sorry, my use is not allowed for all the members in this space. Will ignore any new messages to me.".
        No message will be sent if this is set to an empty string.   
   * @property {string} [membershipRulesStateMessageResponse] - Message from bot when it is messaged in a space that does not conform to the membership rules
        specified by the `restrictedToEmailDomains` and/or the `guideEmails` parameters.   Default messages is
        "Sorry, because my use is not allowed for all the members in this space I am ignoring any input.".
        No message will be sent if this is set to an empty string.
   * @property {string} [membershipRulesAllowedResponse] - Message from bot when it detects that an the memberships of a space it is in have changed in
        in order to conform with the membership rules specified by the The default messages is "I am now allowed to interact with all the members in this space and will no longer ignore any input.".
        No message will be sent if this is set to an empty string.
   * 
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

  // define if Framework clears previous device registrations attached to token on start (if not defined, defaults to false)
  this.options.removeDeviceRegistrationsOnStart = typeof this.options.removeDeviceRegistrationsOnStart === 'boolean' ? this.options.removeWebhooksOnStart : false;
  
  // define default messageFormat used with bot.say (if not defined, defaults to 'text')
  if (typeof this.options.messageFormat === 'string' && _.includes(['text', 'markdown', 'html'], _.toLower(this.options.messageFormat))) {
    this.messageFormat = _.toLower(this.options.messageFormat);
  } else {
    this.messageFormat = 'text';
  }

  this.batchDelay = options.minTime * 2;
  this.lexicon = [];
  this.bots = [];
  this.inactiveBots = [];  // Only used with membership rules
  this.roomsSpawningNow = [];
  this.webex = {};
  this.webhook = {};
  this.cardsWebhook = {};

  // Check if we should set up any "default" storage data for newly discovered bots
  this.initBotStorageData = (typeof options.initBotStorageData === 'object') ? options.initBotStorageData : {};

  // Check how many spaces to discover upon startup
  if ((typeof options.maxStartupSpaces === 'number') && (options.maxStartupSpaces >= 0)) {
    this.maxStartupSpaces = options.maxStartupSpaces;
  } else if (options.hasOwnProperty('maxStartupSpaces')) {
    console.error(`Invalid configuration option for "maxStartupSpaces": "${options.maxStartupSpaces}". ` +
      `Ignoring and attempting to spawn all existing bots prior to initialization.`);
  }

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
  message = (moment().utc().format('YYYY-MM-DD HH:mm:ss') + ' Framework Log Event: ' + message);

  /**
   * Framework log event.
   *
   * Applications may implement a framework.on("log") handler to process
   * log messags from the framework, such as details about events that were
   * not sent due to mebership rules.  See [Membership-Rules README](./doc/membership-rules-readme.md)
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
 * Accessor for Webex SDK instance
 *
 * Access SDK functionality described in [SDK Reference](https://developer.webex.com/docs/sdks/browser#sdk-api-reference)
 * 
 * @function
 * @memberof Framework
 * @returns {object} - Framework's Webex SDK instance
 *
 * @example
 * let webex = framework.getWebexSDK();
 * webex.people.get(me)
 *   .then(person => {
 *     console.log('SDK instantiated by: ' + person.displayName);
 *   }).catch(e => {
 *     console.error('SDK failed to lookup framework user: ' + e.message);
 *   });
 */
Framework.prototype.getWebexSDK = function () {
  return this.webex;
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
        this.myEmit('stop');

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
    // Check if the membership rules params are set properly
    if (errMsg = this.checkMembershipRules()) {
      return when.reject(new Error(errMsg));
    }

    // init storage default storage driver if none was initizlied
    // prior to starting the framework
    if (!this.storageActive) {
      this.storageDriver(new MemStore())
        .catch((e) => console.error(`Memory storage adaptor initialization failed: ${e.message}`));
    }

    let config = {
      credentials: {
        access_token: this.options.token
      }
    };
    let proxyUrl = this.options.httpsProxy || null;
    if (proxyUrl) {
      console.log('proxyurl exists', proxyUrl);
      let httpsProxyAgent = new HttpsProxyAgent(url.parse(proxyUrl));
      config.defaultMercuryOptions = {
        agent: httpsProxyAgent
      };
    }
    this.webex = Webex.init(config);

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
          this.webex.webhooks.list()

            // process webhooks
            .then(webhooks => {

              // remove only webhooks this app created
              if (!this.options.removeWebhooksOnStart) {

                var webhooksToRemove = _.filter(webhooks.items, webhook => {
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
                return when.map(webhooks.items, webhook => this.webex.webhooks.remove(webhook));
              }
            })

            .then(() => {
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
                  console.error(`Error setting webhooks during initialization: ${err.message}`);
                  return when(this.webhook = false);
                });
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
        this.myEmit('start');
        this.active = true;
        return when(true);
      })

      // handle errors
      .catch(err => {
        return when.reject(err);
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
  if (this.maxStartupSpaces != 0) {
    var batchSize = 1000;  // max payload for list memberships
    if ((this.hasOwnProperty('maxStartupSpaces')) && (this.maxStartupSpaces < 1000)) {
      batchSize = this.maxStartupSpaces;
    }

    return this.webex.memberships.list({max: batchSize})
      .then((memberships) => {
        let self = this;
        var spawn_promises = [];

        return (async function f(page) {
          let memberships = page.items;
          if ((self.hasOwnProperty('maxStartupSpaces')) &&
            (spawn_promises.length + memberships.length > self.maxStartupSpaces)) {
            // remove any extras beyond what we need to reach maxStartupSpaces
            memberships.splice(
              self.maxStartupSpaces - spawn_promises.length,
              memberships.length);
          }
          // Build a call to spawn a bot for each membership...
          spawn_promises = spawn_promises.concat(_.map(memberships, m => {
            return () => self.spawn(m);
          }));

          if ((page.hasNext()) && (spawn_promises.length < self.maxStartupSpaces)) {
            // We got a paginated response and need to get another batch...
            return page.next().then(f);
          }

          // Process all the spawn requests
          return sequence(spawn_promises)
            .then(() => when(true))
            .catch(err => {
              self.debug(err.stack);
              return when(true);
            });
        }(memberships));
      })
      .then(() => {
        /**
         * Framework initialized event.
         *
         * @event initialized
         * @property {string} id - Framework UUID
         */
        this.myEmit('initialized');
        this.initialized = true;
        return when(true);
      });
  } else {
    this.myEmit('initialized');
    this.initialized = true;
    return when(true);
  }
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
      return this.webex.people.get(message.personId)
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

  return this.webex.people.get(triggerObject.personId)
    .then(person => {
      trigger.person = person;
      trigger.personId = person.id;
      return when(trigger);
    });
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
  return this.webex.people.list({email: personEmail})
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
 * Get bot object associated with roomId.
 * Returns null if no object exists
 * 
 * @function
 * @memberof Framework
 * @param {string} roomId - id of room to search for
 * @returns {object} - found bot object or null
 *
 * @example
 * let bot = framework.getBotByRoomId(roomId);
 * if (bot) {
 *   bot.say('Hi, I\'m the bot in this room!');
 * } else {
 *   console.log('Could not find bot for room ID: ' + roomId);
 * }
 */
Framework.prototype.getBotByRoomId = function (roomId) {
  return _.find(this.bots, bot => bot.room.id === roomId); 
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
  var bot = this.findBotObjectInRoom(room.id);
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
  var bot = this.findBotObjectInRoom(room.id);

  if (!bot) {
    // It is is possible that not all rooms we are in were discovered on startup
    // and that this room updateoccured in one of those rooms, do a 
    // "just in time" spawn, after validating that we have a memmbership in the space
    return this.webex.memberships.list(
      {
        roomId: room.id,
        personId: this.person.id
      })
      .then((memberships) => this.spawn(memberships.items[0]))
      // No point calling this recursively since we only emit events when the
      // new room object differs from the one in the bot object
      .catch((e) => {
        this.debug('onRoomUpdated() got a room change in a space where we have ' +
          `no bot.  Error doing late discovery: "${e.message}".  Room change ignored.`);
        return when(false);
      });
  } else {
    // bot exists in monitored room, lets see what changed
    let lockStatusChanged = (bot.room.isLocked != room.isLocked) ? true : false;
    let roomRenamed = (bot.room.title != room.title) ? true : false;
    //update bot
    bot.isGroup = (room.type === 'group');
    bot.isDirect = (room.type === 'direct');
    bot.lastActivity = moment().utc().format();
    bot.room = room;

    // emit event if lock status changed
    if (lockStatusChanged) {
      if (room.isLocked) {
        /**
         * Room Locked event.
         *
         * @event roomLocked
         * @property {object} bot - Bot Object
         * @property {object} room - Room Object
         * @property {string} id - Framework UUID
         */
        this.emitBoth('roomLocked', bot, room);
      } else {
        /**
         * Room Unocked event.
         *
         * @event roomUnocked
         * @property {object} bot - Bot Object
         * @property {object} room - Room Object
         * @property {string} id - Framework UUID
         */
        this.emitBoth('roomUnlocked', bot, room);
      }
    }

    // emit event if room was renamed
    if (roomRenamed) {
      /**
       * Room Renamed event.
       *
       * @event roomRenamed
       * @property {object} bot - Bot Object
       * @property {object} room - Room Object
       * @property {string} id - Framework UUID
       */
      this.emitBoth('roomRenamed', bot, room);
    }

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
  var bot = this.findBotObjectInRoom(membership.roomId);

  if (!bot) {
    if (this.initialized && membership.personId === this.person.id) {
      // if bot membership added to un-monitored room...
      return this.spawn(membership, actorId);
    } else {
      // It is is possible that not all rooms we are in were discovered on startup
      // and that this membership occured in one of those rooms, do a "just in time" spawn
      // First validate that we have a memmbership in the space
      return this.webex.memberships.list(
        {
          roomId: membership.roomId,
          personId: this.person.id
        })
        .then((memberships) => this.spawn(memberships.items[0]), actorId)
        .then((isBot) => {
          if (isBot) {
            // recursively call this method to process the message
            return this.onMembershipCreated(membership, actorId);
          } else {
            return when(false);
          }
        })
        .catch((e) => {
          this.debug('onMembershipCreated() got a membershp in a space where we have ' +
            `no bot.  Error doing late discovery: "${e.message}".  Membership ignored.`);
          return when(false);
        });
    }
  }

  // else if other membership added to monitored room...
  else {
    if (!(("membershipRules" in this) && 
      (!this.membershipRules.isNewMemberAllowed(bot, actorId, membership)))) {
      // new member does not violate membership rules
      bot.lastActivity = moment().utc().format();
    }
    /**
     * Member Enter Room event.
     *
     * @event memberEnters
     * @property {object} bot - Bot Object
     * @property {object} membership - Membership Object
     * @property {string} id - Framework UUID
     */
    this.emitBoth('memberEnters', bot, membership);
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
  var bot = this.findBotObjectInRoom(membership.roomId);

  if (!bot) {
    // It is is possible that not all rooms we are in were discovered on startup
    // and that this membership change occured in one of those rooms, do a 
    // "just in time" spawn, after validating that we have a memmbership in the space
    return this.webex.memberships.list(
      {
        roomId: membership.roomId,
        personId: this.person.id
      })
      .then((memberships) => this.spawn(memberships.items[0]))
      .then((isBot) => {
        if (isBot) {
          // recursively call this method to process the message
          return this.onMembershipUpdated(membership);
        } else {
          return when(false);
        }
      })
      .catch((e) => {
        this.debug('onMembershipUpdated() got a membershp change in a space where we have ' +
          `no bot.  Error doing late discovery: "${e.message}".  Membership change ignored.`);
        return when(false);
      });
  }

  bot.lastActivity = moment().utc().format();

  // if bot's membership updated in monitored room
  if (bot && membership.personId === bot.id) {
    let oldModeratorStatus = bot.isModerator;
    // update bot membership
    bot.membership = membership;
    bot.isModerator == membership.isModerator;

    // emit event Moderator
    if (bot.isModerator != oldModeratorStatus) {
      if (membership.isModerator) {
        /**
         * Bot Added as Room Moderator.
         *
         * @event botAddedAsModerator
         * @property {object} bot - Bot Object
         * @property {string} id - Framework UUID
         */
        this.emitBoth('botAddedAsModerator', bot);
      } else {
        /**
         * Bot Removed as Room Moderator.
         *
         * @event botRemovedAsModerator
         * @property {object} bot - Bot Object
         * @property {string} id - Framework UUID
         */
        this.emitBoth('botRemovedAsModerator', bot);
      }
    }
  }
  // else if other membership updated in monitored room
  else if (bot && this.initialized) {
    // A slight inefficiency here is that we notify about moderator
    // status on EVERY membership change even if something else changed
    // This rarely (never?) happens and seems worth the cost savings
    // of not maintaining the status of every member in the bot
    // as was done in the original node-flint framework

    if (membership.isModerator) {
      /**
       * Member Added as Moderator.
       *
       * @event memberAddedAsModerator
       * @property {object} bot - Bot Object
       * @property {object} membership - Membership Object
       * @property {string} id - Framework UUID
       */
      this.emitBoth('memberAddedAsModerator', bot, membership);
    } else {
      /**
       * Member Removed as Moderator.
       *
       * @event memberRemovedAsModerator
       * @property {object} bot - Bot Object
       * @property {object} membership - Membership Object
       * @property {string} id - Framework UUID
       */
      this.emitBoth('memberRemovedAsModerator', bot, membership);
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
  var bot = this.findBotObjectInRoom(membership.roomId);

  if (bot) {
    // if bot membership deleted in monitored room
    if (membership.personId === bot.person.id) {
      // despawn bot
      return this.despawn(bot.room.id, actorId)
        .then(() => when(true))
        .catch(() => when(false));
    } else {
      /**
       * Member Exits Room.
       *
       * @event memberExits
       * @property {object} bot - Bot Object
       * @property {object} membership - Membership Object
       * @property {string} id - Framework UUID
       */
      this.emitBoth('memberExits', bot, membership);

      // Check if this memember leaving changed membership rules status of bot
      //      if (!(("membershipRules" in this) && (!this.membershipRules.isAllowedAfterMemberLeaves(bot, membership)))) {
      if ("membershipRules" in this) {
        return this.membershipRules.isAllowedAfterMemberLeaves(bot, actorId, membership)
          .then(botIsActive => {
            if (botIsActive) {
              bot.lastActivity = moment().utc().format();
            }
            return when(true);
          });
      }
      return when(true);
    }

  } else {
    // It is is possible that not all rooms we are in were discovered on startup
    // and that this membership change occured in one of those rooms, do a 
    // "just in time" spawn unless if was our membership that was deleted
    if (membership.personId === this.person.id) {
      // Too late to spawn a space we got deleted from.  Ignore
      return when(false);
    } else {
      // validating that we have a memmbership in the space
      return this.webex.memberships.list(
        {
          roomId: membership.roomId,
          personId: this.person.id
        })
        .then((memberships) => this.spawn(memberships.items[0]))
        .then((isBot) => {
          if (isBot) {
            // recursively call this method to process the message
            return this.onMembershipDeleted(membership, actorId);
          } else {
            return when(false);
          }
        })
        .catch((e) => {
          this.debug('onMembershipUpdated() got a membershp change in a space where we have ' +
            `no bot.  Error doing late discovery: "${e.message}".  Membership change ignored.`);
          return when(false);
        });
    }
  }
};

/**
 * Process a new Message event.
 * 
 * This method is called internally by the Framework in response
 * to a message:created event in a space where our bot is a member
 *
 * @function
 * @memberof Framework
 * @private
 * @param {Object} message - Webex Team Message Object
 * @returns {Promise}
 */
Framework.prototype.onMessageCreated = function (message) {
  var bot = this.findBotObjectInRoom(message.roomId);

  // if bot found...
  if (bot) {
    bot.lastActivity = moment().utc().format();
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
        function runActions(matched, bot, trigger, framework) {
          const id = framework.id;
          const membershipRules = ("membershipRules" in framework) ? framework.membershipRules : null;
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
              if ((!membershipRules) || (membershipRules.shouldCallHears(lex, bot, trigger))) {
                lex.action(bot, trigger, id);
              }
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
              if ((!membershipRules) || (membershipRules.shouldCallHears(lex, bot, trigger))) {
                lex.action(bot, trigger, id);
              }
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
          this.emitBoth('mentioned', bot, trigger);
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
          this.emitBoth('message', bot, trigger);
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
          this.emitBoth('files', bot, trigger);
        }

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
                runActions(matched, bot, trigger, this);
                return when(trigger);
              } else {
                this.debug('"%s" was denied running command in room "%s" for account "%s"', trigger.personEmail, trigger.roomTitle, this.email);
                return when(false);
              }
            });
        }

        // else, if matched and no authorization configured, run command
        else if (matched) {
          runActions(matched, bot, trigger, this);
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
    // It is is possible that not all rooms we are in were discovered on startup
    // and that this message was sent in one of those rooms, do a "just in time" spawn
    // First validate that we have a memmbership in the space
    return this.webex.memberships.list(
      {
        roomId: message.roomId,
        personId: this.person.id
      })
      .then((memberships) => this.spawn(memberships.items[0]))
      .then((isBot) => {
        if (isBot) {
          // recursively call this method to process the message
          return this.onMessageCreated(message);
        } else {
          return when(false);
        }
      })
      .catch((e) => {
        this.debug('onMessageCreated() got a message in a space where we have ' +
          `no bot.  Error doing late discovery: "${e.message}".  Message ignored.`);
        return when(false);
      });
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
  var bot = this.findBotObjectInRoom(attachmentAction.roomId);
  if (bot) bot.lastActivity = moment().utc().format();

  // if bot found...
  if (bot) {
    return this.getTrigger('attachmentAction', attachmentAction)
      .then((trigger) => {
        this.myEmit('attachmentAction', bot, trigger);
      });
    // else, bot not found...
  } else {
    // It is is possible that not all rooms we are in were discovered on startup
    // and that this message was sent in one of those rooms, do a "just in time" spawn
    // First validate that we have a memmbership in the space
    return this.webex.memberships.list(
      {
        roomId: attachmentAction.roomId,
        personId: this.person.id
      })
      .then((memberships) => this.spawn(memberships.items[0]))
      .then((isBot) => {
        if (isBot) {
          // recursively call this method to process the message
          return this.onAttachmentActions(attachmentAction);
        } else {
          return when(false);
        }
      })
      .catch((e) => {
        this.debug('onAttachmentActions() got a message in a space where we have ' +
          `no bot.  Error doing late discovery: "${e.message}".  Message ignored.`);
        return when(false);
      });
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
  if ((typeof membership !== 'object') && (typeof membership.roomId !== 'string')) {
    this.debug('A bot for account "%s" could not spawn as membership room id not valid', this.email);
    return when(false);
  }
  let roomId = membership.roomId;

  // validate that we aren't in the process of spawning a bot for this space already
  if (this.roomsSpawningNow.indexOf(roomId) >= 0) {
    // Race condition while attempting to spawn room, let the previous spawn finish
    return when(false);
  }

  // validate bot is not already assigned to room
  var foundBot = this.findBotObjectInRoom(membership.roomId);
  if (foundBot) {
    this.debug(`framework.spawn() got a request to spawn in spaceId ${membership.roomId}.  Bot already has been spawned here. Ignorning.`);
    return when(false);
  }

  // create new bot
  var newBot = new Bot(this);
  // assign membership properties to bot object
  newBot.membership = membership;
  newBot.isModerator = membership.isModerator;

  // prevent any "late spawning" of this space while we are asyncronously building our bot object
  this.roomsSpawningNow.push(roomId);

  // Some conditions require the whole membership list
  // reuse it if we fetch it
  let memberships = null;

  // get room that bot is spawning in
  return this.webex.rooms.get(roomId)
    .then(room => {
      if (room.title == '') {
        room.title = 'Default title';
      }

      newBot.room = room;
      newBot.isDirect = (room.type === 'direct');
      newBot.isGroup = (room.type === 'group');
      newBot.isLocked = room.isLocked;

      if (newBot.room.teamId && ('string' === typeof newBot.room.teamId))
      {
        newBot.isTeam = true;
      }

      // if direct, set recipient
      if (newBot.isDirect) {
        let botId = this.person.id;
        return this.webex.memberships.list({roomId: roomId})
          .then((m) => {
            if (m.length > 1) {
              // remove bot membership from room memberships
              let otherMembers = _.reject(m.items, {personId: botId});
              // remaining membership is the other user in the space
              newBot.isDirectTo = otherMembers[0].personEmail;
              return when(newBot);
            } else {
              // The other user is no longer active we can't leave this space because of 1-1 rules
              // but we can avoid starting a bot here
              // Remove this space from "in spawning process" array
              this.roomsSpawningNow = _.remove(this.roomsSpawningNow, roomId);
              return when.reject(new Error(`Not spawning bot in 1-1 space where bot is the only remaining member.`));
            }
          });
      } else {
        return when(newBot);
      }
    })

    // Init the bot specific configuration in the storage adapter
    .then(() => newBot.initStorage(this))

    // Validate that the new bot meets membership rules
    .then(() => {
      if ("membershipRules" in this) {
        return this.membershipRules.onSpawn(newBot, memberships, actorId);
      } else {
        return when(true);
      }
    })

    // register and start bot
    .then((membershipRulesPassed) => {
      // Remove this space from "in spawning process" array
      this.roomsSpawningNow = _.remove(this.roomsSpawningNow, roomId);

      if (!membershipRulesPassed) {
        // New bot didn't meet membership rules, nothing left to do
        return when(true);
      }

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
       * @property {string} addedBy - ID of user who added bot to space if available.
       * 
       * Bots are typically spawned in one of three ways:
       * 1) When the framework first starts it can look for up to 
       *    options.maxStartupSpaces spaces that 
       *    our bot is already part of.  When discovered a new bot is spawned.
       *    No addedBy parameter will be passed in this case and the 
       *    `framework.initialized` variable will be false.
       * 2) After the framework has started if a user sends
       *    a message to a bot in an existing space that was not discovered during startup,
       *    a bot object is spawned for the "just in time" discovered space.  Developers
       *    should never assume that all possible spaces were discovered during 
       *    the framework's startup.
       *    No addedBy parameter will be passed in this case and the 
       *    framework.initialized variable will be true.
       * 3) After the framework has started, if a user adds our bot to a new space
       *    a membership:created event occurs which also spawns a bot.  The 
       *    framework will inlcude the addedBy parameter and framework.initialized
       *    will be true.   A best practice In these cases, is to include application
       *    logic for the bot to "introduce itself" and/or do something with the
       *    information about the user who created the bot's membership
       *    
       *
       * @example
       * // DM the user who added bot to a group space
       * framework.on('spawn', function(bot, flintId, addedById) {
       *     if (!addedById) {
       *      // don't say anything here or your bot's spaces will get
       *      // spammed every time your server is restarted
       *      framework.debug(`Framework spawned a bot object in existing
       *         space: ${bot.room.title}`);
       *   } else {
       *     if ((bot.room.type === 'group') && (addedById)) {
       *       // In this example we imagine our bot is only allowed in 1-1 spaces
       *       // our bot creates a 1-1 with the addedBy user, and leaves the group space
       *       bot.dm(addedById, `I see you added me to the the space "${bot.room.title}", ` +
       *         `but I am not allowed in group spaces.  ` +
       *         `We can talk here if you like.`).then(() => bot.exit());
       *     } else {
       *       bot.say(`Thanks for adding me to this space.  Here is what I can do...`);
       *     }
       *   }
       * });
       *
       */
      if (actorId) {
        this.myEmitWithActor('spawn', newBot, actorId);
      } else {
        this.myEmit('spawn', newBot);
      }

      return when(true);
    })

    // catch errors with spawn
    .catch(err => {
      console.error(`Failed spawning a bot in roomId: ${roomId}.  Error: ${err.message}`);
      // remove reference
      newBot = {};
      // Remove this space from "in spawning process" array
      this.roomsSpawningNow = _.remove(this.botsSpawningNow, roomId);

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
  var bot = this.findBotObjectInRoom(roomId);

  if (bot) {
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
          this.myEmitWithActor('despawn', bot, actorId);
        } else {
          this.myEmit('despawn', bot);
        }

        // shutdown bot
        bot.stop();

        // remove bot from framework
        this.bots = _.reject(this.bots, {'id': bot.id});

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
    this.lexicon.push({'id': id, 'phrase': phrase, 'action': action, 'helpText': helpText, 'preference': preference});
    return id;
  }

  else if (phrase instanceof RegExp && action) {
    this.lexicon.push({'id': id, 'phrase': phrase, 'action': action, 'helpText': helpText, 'preference': preference});
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
        return driver.initStorage.call(driver, id, framework.initBotStorageData);
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
      return driver.writeMetric.call(driver, this, appData, actor);
    };
  } else {
    // Create a no-op for this optional method
    Bot.prototype.writeMetric = function () {
      return when.reject(new Error(`Framework storage adaptor ` +
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

/**
 * Private function to check for memembership rules in config
 */
Framework.prototype.checkMembershipRules = function () {
  const options = this.options;
  this.restrictedDomains = '';
  // Check if there are any membership rules to consider
  if ((options.restrictedToEmailDomains) || (options.guideEmails)) {
    try {
      if (options.restrictedToEmailDomains) {
        this.restrictedDomains = options.restrictedToEmailDomains.split(/[ ,]+/);
        if (this.restrictedDomains.length) {
          for (let i = 0; i < this.restrictedDomains.length; i++) {
            let domain = this.restrictedDomains[i];
            if (!domain.match(/^((?!-))(xn--)?[a-z0-9][a-z0-9-_]{0,61}[a-z0-9]{0,1}\.(xn--)?([a-z0-9\-]{1,61}|[a-z0-9-]{1,30}\.[a-z]{2,})$/igm)) {
              throw new Error(`Invalid domain name: ${domain}`);
            }
            this.restrictedDomains[i] = _.toLower(domain);
          }
        } else {
          throw new Error('Cannot parse empty list of domains');
        }
      } if (options.guideEmails) {
        this.guideEmails = options.guideEmails.split(/[ ,]+/);
        if (this.guideEmails.length) {
          for (let i = 0; i < this.guideEmails.length; i++) {
            if (!validator.isEmail(this.guideEmails[i])) {
              throw new Error(`Invalid email "${this.guideEmails[i]}" in guideEmails parameter`);
            }
            this.guideEmails[i] = _.toLower(this.guideEmails[i]);
          }
        } else {
          throw new Error('Cannot parse empty list of emails');
        }
      }
      // Instantiate the membershipRules class which we'll use to evaluate
      // membership changes against our membership rules configuration
      this.membershipRules = require('./membership-rules')(this);

      if ((this.restrictedDomains) && (this.guideEmails)) {
        // Make sure guides fit within doman restriction rules
        this.guideEmails = this.guideEmails.filter(email => {
          if (this.membershipRules.isMemberAllowed({personEmail: email}, this.restrictedDomains)) {
            return true;
          } else {
            console.error(`Ignoring potential guide:"${email}", specified via the ` +
            `guideEmails configuration parameter because they do not meet the ` +
            `domain restriction rules specified via the restrictedToEmailDomains ` +
            `config parameter: "${options.restrictedToEmailDomains}"`);
          }  
        });
      }

      if ("membershipRulesDisallowedResponse" in options) {
        this.membershipRulesDisallowedResponse = options.membershipRulesDisallowedResponse;
      } else {
        this.membershipRulesDisallowedResponse = 'Sorry, my use is not allowed for all the members in this space. Will ignore any new messages to me.';
      }
      if ("membershipRulesStateMessageResponse" in options) {
        this.membershipRulesStateMessageResponse = options.membershipRulesStateMessageResponse;
      } else {
        this.membershipRulesStateMessageResponse = 'Sorry, because my use is not allowed for all the members in this space I am ignoring any input.';  
      }
      if ("membershipRulesAllowedResponse" in options) {
        this.membershipRulesAllowedResponse = options.membershipRulesAllowedResponse;
      } else {
        this.membershipRulesAllowedResponse = 'I am now allowed to interact with all the members in this space and will no longer ignore any input.';
      }
    } catch (e) {
      let msg = `Error: ${e.message}`;
      if (-1 !== e.message.indexOf("domain")) {
        msg += `\nUnable to initiatilize with config param restrictedToEmailDomains: "${options.restrictedToEmailDomains}"\n` +
        'Please set to a comma seperated list of valid email domains, ie: "mycompany.com,othercompany.com"';
      } else if (-1 !== e.message.indexOf("email")) {
        msg += `\nUnable to initiatilize with config param guideEmails: "${options.guideEmails}"\n` +
        'Please set to a comma seperated list of valid webex user email addresses, ie: "fred@mycompany.com, jane@othercompany.com"';
      }
      return (msg);
    }
  } else {
    if ("membershipRulesDisallowedResponse" in options) {
      console.error('Ignoring config param membershipRulesDisallowedResponse, ' +
        'which is only used if the restrictedToEmailDomains or guideEmails options are set.');
    }
    if ("membershipRulesStateMessageResponse" in options) {
      console.error('Ignoring config param membershipRulesStateMessageResponse, ' +
      'which is only used if the restrictedToEmailDomains or guideEmails options are set.');
    }
    if ("membershipRulesAllowedResponse" in options) {
      console.error('Ignoring config param membershipRulesAllowedResponse, ' +
      'which is only used if the restrictedToEmailDomains or guideEmails options are set.');
    }
  }
  // Empty msg means succes!
  return '';
};

/**
 * Private emit functions that check the membership rules
 * before emitting and event
 */
Framework.prototype.myEmit = function (event, ...args) {
  // membership rules don't apply to events not associated with a bot
  // but we keep this wrapper to generate the more helpful error 
  // when app handers generate exceptions...
  try {
    this.emit(event, ...args, this.id);
  } catch (e) {
    if (typeof event != 'string') {
      event = 'UNKNOWN';
    }
    console.error(`Framework.myEmit() error: "${e.message}" while emitting "${event}" event. ` +
      `This may have been caused by an uncaught exception in an application handler.`);
  }
};

Framework.prototype.myEmitWithActor = function (event, bot, actorId) {
  try {
    // TODO there may be some events (ie: log) that I want to always pass on
    if ("membershipRules" in this) {
      this.membershipRules.emitWithActor(event, bot, actorId);
    } else {
      this.emit(event, bot, this.id, actorId);
    }
  } catch (e) {
    if (typeof event != 'string') {
      event = 'UNKNOWN';
    }
    console.error(`Framework.myEmitWithActor() error: "${e.message}" while emitting "${event}" event. ` +
      `This may have been caused by an uncaught exception in an application handler.`);
  }
};

Framework.prototype.emitBoth = function (event, bot, ...args) {
  try {
    // TODO there may be some events (ie: log) that I want to always pass on
    if ("membershipRules" in this) {
      this.membershipRules.emitBoth(event, bot, ...args);
    } else {
      this.emit(event, bot, ...args, this.id);
      bot.emit(event, bot, ...args, bot.id);
    }
  } catch (e) {
    if (typeof event != 'string') {
      event = 'UNKNOWN';
    }
    console.error(`Framework.emitBoth() error: "${e.message}" while emitting "${event}" event. ` +
      `This may have been caused by an uncaught exception in an application handler.`);
  }
};

/**
 * Helper function to determine if a bot object already exists in a space
 *
 * @function
 * @memberof Framework
 * @private
 * @param {String} roomId - Id of room to lookup
 * @returns {object} - found bot object or null
 */
Framework.prototype.findBotObjectInRoom = function (roomId) {
  var bot = _.find(this.bots, bot => bot.room.id === roomId); 
  if ((!bot) & ("membershipRules" in this)) {
    bot = _.find(this.inactiveBots, bot => bot.room.id === roomId);
  }
  return (bot);
};



module.exports = Framework;

function cleanupListeners(framework) {
  // Cleanup webhooks or websockets
  if (framework.options.webhookUrl) {
    return framework.webex.webhooks.list()
      // get webhooks
      .then(webhooks => {

        // remove all webhooks on stop
        if (!framework.options.removeWebhooksOnStart) {
          var webhooksToRemove = _.filter(webhooks.items, webhook => {
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
          return when.map(webhooks.items, webhook => framework.webex.webhooks.remove(webhook))
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

