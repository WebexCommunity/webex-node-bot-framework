'use strict';

var EventEmitter = require('events').EventEmitter;
var validator = require('../lib/validator');
var sequence = require('when/sequence');
var Stream = require("stream");
var moment = require('moment');
var _debug = require('debug')('bot');
var util = require('util');
var when = require('when');
var poll = require('when/poll');
var _ = require('lodash');

var u = require('./utils');

// format makrdown type
function markdownFormat(str) {
  // if string...
  if (str && typeof str === 'string') {

    // process characters that do not render visibly in markdown
    str = str.replace(/\<(?!@)/g, '&lt;');
    str = str.split('').reverse().join('').replace(/\>(?!.*@\<)/g, ';tg&').split('').reverse().join('');

    return str;
  }

  // else return empty
  else {
    return '';
  }
}

// format html type (place holder for now, does nothing)
function htmlFormat(str) {
  return str;
}

/**
 * Creates a Bot instance that is then attached to a Webex Team Room.
 *
 * @constructor
 * @param {Object} framework - The framework object this Bot spawns under.
 * @param {Object} options - The options of the framework object this Bot spawns under.
 * @param {Object} webex - The webex sdk of the framework object this Bot spawns under.
 * @property {string} id - Bot UUID
 * @property {boolean} active - Bot active state
 * @property {object} person - Bot's Webex  Person Object
 * @property {string} email - Bot email
 * @property {object} room - Bot's Webex Room object
 * @property {object} membership - Bot's Webex Membership object
 * @property {boolean} isLocked - If bot is locked
 * @property {boolean} isModerator - If bot is a moderator
 * @property {boolean} isGroup - If bot is in Group Room
 * @property {boolean} isDirect - If bot is in 1:1/Direct Room
 * @property {string} isDirectTo - Recipient Email if bot is in 1:1/Direct Room
 * @property {date} lastActivity - Last bot activity
 */
function Bot(framework) {
  EventEmitter.call(this);

  this.id = u.genUUID64();

  this.framework = framework;
  this.options = framework.options;
  this.webex = framework.webex;

  this.debug = function (message) {
    message = util.format.apply(null, Array.prototype.slice.call(arguments));

    if (typeof framework.debugger === 'function') {
      framework.debugger(message, this.id);
    } else {
      _debug(message);
    }
  };

  // Does anything bad happen if we never audit?
  //randomize distribution of when audit event should take place for this bot instance...
  //this.auditTrigger = Math.floor((Math.random() * this.framework.auditDelay)) + 1;

  this.batchDelay = this.framework.batchDelay;
  this.active = false;
  this.room = {};
  this.team = {};
  this.person = this.framework.person;
  this.membership = {};
  this.memberships = [];
  this.email = this.framework.email;
  this.isLocked = false;
  this.isModerator = false;
  this.isGroup = false;
  this.isDirect = false;
  this.isTeam = false;
  this.lastActivity = moment().utc().format();

  // TODO Get rid of this when I make a proper streamMessage function
  this.apiUrl = process.env.API_URL || this.options.apiUrl || 'https://api.ciscospark.com/v1/';

  this.on('error', err => {
    if (err) {
      this.debug(err.stack);
    }
  });
}
util.inherits(Bot, EventEmitter);

/**
 * Stop Bot.
 *
 * @function
 * @private
 * @returns {Boolean}
 *
 * @example
 * bot.stop();
 */
Bot.prototype.stop = function () {
  // if not stopped...
  if (this.active) {

    this.emit('stop', this);

    this.active = false;
    return true;
  } else {
    return false;
  }
};

/**
 * Start Bot.
 *
 * @function
 * @private
 * @returns {Boolean}
 *
 * @example
 * bot.start();
 */
Bot.prototype.start = function () {
  // if not started...
  if (!this.active) {

    this.emit('start', this);

    this.active = true;
    return true;
  } else {
    return false;
  }
};

/**
 * Instructs Bot to exit from room.
 *
 * @function
 * @returns {Promise.<Boolean>}
 *
 * @example
 * bot.exit();
 */
Bot.prototype.exit = function () {
  if (!this.isGroup) {
    return when(false);
  } else {

    return this.framework.webex.memberships.remove(this.membership)
      .then(() => {
        return when(true);
      })
      .catch(() => {
        return when(false);
      });
  }
};

/**
 * Instructs Bot to add person(s) to room.
 *
 * @function
 * @param {(String|Array)} email(s) - Email Address (or Array of Email Addresses) of Person(s) to add to room.
 * @param {Boolean} [moderator]
 * Add as moderator.
 * @returns {Promise.<Array>} Array of emails added
 * @example
 * // add one person to room by email
 * bot.add('john@test.com');
 * @example
 * // add one person as moderator to room by email
 * bot.add('john@test.com', true)
 *   .catch(function(err) {
 *     // log error if unsuccessful
 *     console.log(err.message);
 *   });
 * @example
 * // add 3 people to room by email
 * bot.add(['john@test.com', 'jane@test.com', 'bill@test.com']);
 */
Bot.prototype.add = function (email, asModerator) {

  // validate to boolean
  asModerator = (typeof asModerator === 'boolean' && asModerator);

  // function to add membership by email address to this room
  var add = (e, m) => {
    if (validator.isEmail(e)) {
      return this.framework.webex.memberships.create({
        roomId: this.room.id,
        personEmail: e,
        isModerator: m
      })
        .then(membership => {
          this.framework.debug('Added "%s" to room "%s"',
            (membership.personDisplayName) ? membership.personDisplayName : membership.personEmail,
            this.room.title);
          return when(e);
        })
        .catch(err => {
          console.error(`bot.add() Error adding ${e} to space: ${err.message}`);
          return when(false);
        });
      // .catch(err => when(false))
      // .delay(this.batchDelay);
    } else {
      return when(false);
    }
  };

  if (!this.isGroup) {
    return when.reject(new Error('can not add person to a 1:1 room'));
  } else {
    if (this.isLocked && !this.isModerator) {
      return when.reject(new Error('room is locked and bot is not moderator'));
    }

    if (!this.isLocked && asModerator) {
      return when.reject(new Error('can not add moderator to a unlocked room'));
    }

    // if passed as array, create batch process
    if (email instanceof Array && email.length > 1) {

      // create batch
      var batch = _.map(email, e => {
        e = _.toLower(e);
        return () => add(e, asModerator).catch(err => this.debug(err.stack));
      });

      // run batch
      return sequence(batch).then(batchResult => {
        batchResult = _.compact(batchResult);

        // if array of resulting emails is not empty...
        if (batchResult instanceof Array && batchResult.length > 0) {
          return batchResult;
        } else {
          return when.reject('invalid email(s) or email not specified');
        }
      });
    }

    // else, add using email
    else if (typeof email === 'string' || (email instanceof Array && email.length === 1)) {
      if (email instanceof Array) {
        email = _.toLower(email[0]);
      }

      return add(email, asModerator).then(result => {
        // if resulting email is not false
        if (result) {
          return when([result]);
        } else {
          return when.reject(new Error('invalid email(s) or email not specified'));
        }
      });
    }

    else {
      return when.reject(new Error('invalid parameter passed to bot.add()'));
    }
  }
};

/**
 * Instructs Bot to remove person from room.
 *
 * @function
 * @param {(String|Array)} email(s) - Email Address (or Array of Email Addresses) of Person(s) to remove from room.
 * @returns {Promise.<Array>} Array of emails removed
 *
 * @example
 * // remove one person to room by email
 * bot.remove('john@test.com');
 *
 * @example
 * // remove 3 people from room by email
 * bot.remove(['john@test.com', 'jane@test.com', 'bill@test.com']);
 */

// needs to be fixed to pass through errors, or pass through list of users removed.
Bot.prototype.remove = function (email) {

  // remove membership by email address from this room
  var remove = e => {
    //  if (validator.isEmail(e) && _.includes(_.map(this.memberships, 'personEmail'), e)) {
    //    return this.framework.webex.memberships.list({ roomId: this.room.id, personEmail: e })
    return this.framework.webex.memberships.list({ roomId: this.room.id, personEmail: email })
      .then((memberships) => {
        let membership = memberships.items[0];
        return this.framework.webex.memberships.remove(membership);
      })
      .then(() => {
        this.debug('Removed "%s" from room "%s"', e, this.room.title);
        return when(e);
      })
      .catch(err => {
        console.error(`bot.remove() Error removing ${e} to space: ${err.message}`);
        return when(false);
      });
    // })
    // .delay(this.batchDelay);
    // } else {
    //   return when(false);
    //}
  };

  if (!this.isGroup) {
    return when.reject(new Error('can not remove person from a 1:1 room'));
  } else {
    if (this.isLocked && !this.isModerator) {
      return when.reject(new Error('room is locked and bot is not moderator'));
    }

    // if passed as array, create batch process
    if (email instanceof Array && email.length > 1) {

      // create batch
      var batch = _.map(email, e => {
        return () => remove(e).catch(err => this.debug(err.stack));
      });

      // run batch
      return sequence(batch).then(batchResult => {
        batchResult = _.compact(batchResult);

        // if array of resulting emails is not empty...
        if (batchResult instanceof Array && batchResult.length > 0) {
          return batchResult;
        } else {
          return when.reject(new Error('invalid email(s) or email not specified'));
        }
      });
    }

    // else, remove using email
    else if (typeof email === 'string' || (email instanceof Array && email.length === 1)) {
      if (email instanceof Array) {
        email = email[0];
      }

      return remove(email).then(result => {
        // if resulting email is not false
        if (result) {
          return when([result]);
        } else {
          return when.reject(new Error('invalid email(s) or email not specified'));
        }
      });
    }

    else {
      return when.reject(new Error('invalid parameter passed to bot.remove()'));
    }
  }
};

/**
 * Get membership object from room using email.
 *
 * @function
 * @private
 * @param {String} email - Email of person to retrieve membership object of.
 * @returns {Promise.<Membership>}
 *
 * @example
 * bot.getMembership('john@test.com')
 *   .then(function(membership) {
 *     console.log('john@test.com is moderator: %s', membership.isModerator);
 *   });
 */
//TODO this needs to be reimplmented since we no longer keep the membership list in the bot
Bot.prototype.getMembership = function (email) {

  // check if person passed as email address
  if (validator.isEmail(email)) {

    // check for person in room
    var person = _.find(this.memberships, membership => {
      return (_.toLower(membership.personEmail) === _.toLower(email));
    });

    if (person) {
      return when(person);
    } else {
      return when.reject(new Error('Person not found in room'));
    }

  } else {
    return when.reject(new Error('Not a valid email'));
  }
};

/**
 * Get room moderators.
 *
 * @function
 * @returns {Promise.<Array>}
 *
 * @example
 * bot.getModerators()
 *   .then(function(moderators) {
 *     console.log(moderators);
 *   });
 */
Bot.prototype.getModerators = function () {
  return when(_.filter(this.memberships, membership => {
    return (membership.isModerator);
  }));
};

/**
 * Create new room with people by email
 *
 * @function
 * @param {String} name - Name of room.
 * @param {Array} emails - Emails of people to add to room.
 * @param {Boolean} isTeam -- Create a team room (if bot is already in a team space)
 * @returns {Promise.<Bot>}
 */
Bot.prototype.newRoom = function (name, emails, isTeam) {
  var newRoomBot = {};
  var teamId = '';

  // Validate team
  if (isTeam) {
    if (this.isTeam) {
      teamId = this.team.id;
    } else {
      return when.reject(new Error('This room is not part of a Webex Teams Team'));
    }
  }

  // add room
  var newRoom = { title: name };
  if (teamId) { newRoom.team = teamId; }
  return this.framework.webex.rooms.create(newRoom)

    // create room
    .then(room => {

      var count = 0;

      // find bot function
      var bot = () => {
        // get bot for new room
        return _.find(this.framework.bots, bot => {
          return (bot.room.id === room.id);
        });
      };

      // validate results of find bot function
      var isReady = (result) => {
        count++;
        // cap wait time at 150 * 100 ms
        if (count > 150) {
          return true;
        } else {
          return (typeof result !== 'undefined');
        }
      };

      // New bot for this room isn't spawned until we get the
      // membership:created event poll find bot every 100ms and 
      // return fulfilled promise when result function is true
      return poll(bot, 100, isReady)
        .then(bot => {
          if (!bot) {
            return when.reject(new Error('Framework timed out when creating a new room'));
          } else {
            newRoomBot = bot;
            newRoom = room;
            return when(bot);
          }
        });
    })

    // add users to room
    .then(bot => {
      if ((!emails) || (!emails.length)) {
        return when(true);
      } else {
        return bot.add(emails)
          .catch(() => {
            return when(true);
          });
      }
    })

    // return new Bot
    .then(() => when(newRoomBot))

    // if error, attempt to remove room before rejecting
    .catch(err => {

      if (newRoom && newRoom.id) {
        this.framework.webex.rooms.remove(newRoom)
          .catch(() => {/* ignore remove room errors */ });
      }

      return when.reject(err);
    });
};

/**
 * Create new Team Room
 * 
 * This can also be done by passing an optional boolean 
 * isTeam param to the newRoom() function, but this function
 * is also kept for compatibility with node-flint
 *
 * @function
 * @param {String} name - Name of room.
 * @param {Array} emails - Emails of people to add to room.
 * @returns {Promise.<Bot>}
 */
Bot.prototype.newTeamRoom = function (name, emails) {

  if (!this.isTeam) {
    return when.reject(new Error('This room is not part of a Webex Teams Team'));
  }
  return this.newRoom(name, emails, true);
};

/**
 * Enable Room Moderation.
 * 
 * This function will not work when framework was created
 * using a bot token, it requires an authorized user token
 *
 * @function
 * @returns {Promise.<Bot>}
 *
 * @example
 * bot.moderateRoom()
 *   .then(function(err) {
 *     console.log(err.message)
 *   });
 */
Bot.prototype.moderateRoom = function () {
  // validate framework is not a bot account
  if (this.framework.isBotAccount) {
    return when.reject(new Error('Bot accounts can not change moderation status in rooms'));
  }

  // set moderator
  if (!this.isGroup || this.isTeam) {
    return when.reject(new Error('Can not change moderation status on 1:1 or Team room'));
  }

  else if (this.isLocked) {
    return when.reject(new Error('Room is already moderated'));
  }

  else {
    var membership = this.membership;
    if (!membership.isModerator) {
      membership.isModerator = true;
      return this.framework.webex.memberships.update(membership)
        .then(() => when(this));
    } else {
      return when(this);
    }

  }
};

/**
 * Disable Room Moderation.
 *
 * This function will not work when framework was created
 * using a bot token, it requires an authorized user token
 *
 * @function
 * @returns {Promise.<Bot>}
 *
 * @example
 * bot.unmoderateRoom()
 *   .then(function(err) {
 *     console.log(err.message)
 *   });
 */
Bot.prototype.unmoderateRoom = function () {

  // validate framework is not a bot account
  if (this.framework.isBotAccount) {
    return when.reject(new Error('Bot accounts can not change moderator status in rooms'));
  }

  if (!this.isGroup || this.isTeam) {
    return when.reject(new Error('Can not change moderation status on 1:1 or Team room'));
  }

  else if (!this.isLocked) {
    return when.reject(new Error('Room is not moderated'));
  }

  else if (this.isLocked && !this.isModerator) {
    return when.reject(new Error('Bot is not a moderator in this room'));
  }

  else {
    return this.getModerators()
      .then(moderators => {

        // create batch
        var batch = _.map(moderators, m => {
          return () => this.moderatorClear(m).delay(this.batchDelay);
        });

        // run batch
        return sequence(batch);

      })

      // remove bot as moderator
      .then(() => this.moderatorClear(this.membership))
      .then(() => when(this));
  }
};

/**
 * Assign Moderator in Room
 *
 * This function will not work when framework was created
 * using a bot token, it requires an authorized user token
 *
 * @function
 * @param {(String|Array)} email(s) - Email Address (or Array of Email Addresses) of Person(s) to assign as moderator.
 * @returns {Promise.<Bot>}
 *
 * @example
 * bot.moderatorSet('john@test.com')
 *   .then(function(err) {
 *     console.log(err.message)
 *   });
 */
Bot.prototype.moderatorSet = function (email) {

  // function to set moderator by email address to this room
  var set = e => {
    return this.getMembership(e)
      .then(membership => {
        if (!membership.isModerator) {
          membership.isModerator = true;
          return this.framework.webex.memberships.update(membership)
            .then(() => when(this));
        } else {
          return when(this);
        }
      });
  };

  // validate bot is not a bot account
  if (this.framework.isBotAccount) {
    return when.reject(new Error('Bot accounts can not change moderator status in rooms'));
  }

  if (!this.isGroup || this.isTeam) {
    return when.reject(new Error('Can not change moderation status on 1:1 or Team room'));
  }

  else if (!this.isLocked) {
    return when.reject(new Error('Room is not moderated'));
  }

  else if (this.isLocked && !this.isModerator) {
    return when.reject(new Error('Bot is not moderator in this room'));
  }

  else {
    if (email instanceof Array) {

      // create batch
      var batch = _.map(email, e => {
        return () => set(e).delay(this.batchDelay);
      });

      // run batch
      return sequence(batch).then(() => when(this));

    }

    else if (typeof email === 'string') {
      return set(email).then(() => when(this));
    }

    else {
      return when.reject(new Error('Invalid parameter passed to moderatorSet'));
    }
  }
};

/**
 * Unassign Moderator in Room
 *
 * This function will not work when framework was created
 * using a bot token, it requires an authorized user token
 *
 * @function
 * @param {(String|Array)} email(s) - Email Address (or Array of Email Addresses) of Person(s) to unassign as moderator.
 * @returns {Promise.<Bot>}
 *
 * @example
 * bot.moderatorClear('john@test.com')
 *   .then(function(err) {
 *     console.log(err.message)
 *   });
 */
Bot.prototype.moderatorClear = function (email) {

  // function to set moderator by email address to this room
  var clear = e => {
    return this.getMembership(e)
      .then(membership => {
        if (membership.isModerator) {
          membership.isModerator = false;
          return this.framework.webex.memberships.update(membership)
            .then(() => when(this));
        } else {
          return when(this);
        }
      });
  };

  // validate bot is not a bot account
  if (this.framework.isBotAccount) {
    return when.reject(new Error('Bot accounts can not change moderator status in rooms'));
  }

  if (!this.isGroup || this.isTeam) {
    return when.reject(new Error('Can not change moderation status on 1:1 or Team room'));
  }

  else if (!this.isLocked) {
    return when.reject(new Error('Room is not moderated'));
  }

  else if (this.isLocked && !this.isModerator) {
    return when.reject(new Error('Bot is not a moderator in this room'));
  }

  else {
    if (email instanceof Array) {

      // create batch
      var batch = _.map(email, e => {
        return () => clear(e).delay(this.batchDelay);
      });

      // run batch
      return sequence(batch).then(() => when(this));

    }

    else if (typeof email === 'string') {
      return clear(email).then(() => when(this));
    }

    else {
      return when.reject(new Error('Invalid parameter passed to moderatorClear'));
    }
  }
};

/**
 * Remove a room and all memberships.
 *
 * @function
 * @returns {Promise.<Boolean>}
 *
 * @example
 * framework.hears('/implode', function(bot, trigger) {
 *   bot.implode();
 * });
 */
Bot.prototype.implode = function () {

  // validate room is group
  if (!this.isGroup || this.isTeam) {
    return when.reject(new Error('Can not implode a 1:1 or Team room'));
  }

  // validate bot is moderator if room is locked
  if (this.isLocked && !this.isModerator) {
    return when.reject(new Error('Bot is not moderator in this room'));
  }

  return this.framework.webex.rooms.remove(this.room)
    .then(() => when(true))
    .catch(() => when(false));
};

/**
 * Send text with optional file to room.
 *
 * @function
 * @param {String} [format=text] - Set message format. Valid options are 'text' or 'markdown'.
 * @param {String|Object} message - Message to send to room. This can be a simple string, or a object for advanced use.
 * @returns {Promise.<Message>}
 *
 * @example
 * // Simple example
 * framework.hears('/hello', function(bot, trigger) {
 *   bot.say('hello');
 * });
 *
 * @example
 * // Simple example to send message and file
 * framework.hears('/file', function(bot, trigger) {
 *   bot.say({text: 'Here is your file!', file: 'http://myurl/file.doc'});
 * });
 *
 * @example
 * // Markdown Method 1 - Define markdown as default
 * framework.messageFormat = 'markdown';
 * framework.hears('/hello', function(bot, trigger) {
 *   bot.say('**hello**, How are you today?');
 * });
 *
 * @example
 * // Markdown Method 2 - Define message format as part of argument string
 * framework.hears('/hello', function(bot, trigger) {
 *   bot.say('markdown', '**hello**, How are you today?');
 * });
 *
 * @example
 * // Mardown Method 3 - Use an object (use this method of bot.say() when needing to send a file in the same message as markdown text.
 * framework.hears('/hello', function(bot, trigger) {
 *   bot.say({markdown: '*Hello <@personEmail:' + trigger.personEmail + '|' + trigger.personDisplayName + '>*'});
 * });
 * 
 * @example
 * // Send an Webex card by providing a fully formed message object.
 * framework.hears('/card please', function(bot, trigger) {
 *   bot.say({       
 *      // Fallback text for clients that don't render cards is required
 *      markdown: "If you see this message your client cannot render buttons and cards.",
 *      attachments: [{
 *        "contentType": "application/vnd.microsoft.card.adaptive",
 *        "content": myCardsJson
 *     }]
*    });
 */
Bot.prototype.say = function (format, message) {

  // set default format type
  format = this.framework.messageFormat;

  // parse function args and check for wierd behavior of 
  // arguments object when function is called in a function
  var args = Array.prototype.slice.call(arguments);
  if ((args.length > 1) && (args[1] === undefined)) {
    args.pop();
  }

  // determine if a format is defined in arguments
  // first and second arguments should be string type
  // first argument should be one of the valid formats
  var formatDefined = (args.length > 1 && typeof args[0] === 'string' && typeof args[1] === 'string' && _.includes(['text', 'markdown', 'html'], _.toLower(args[0])));

  // if format defined in function arguments, overide default
  if (formatDefined) {
    format = _.toLower(args.shift());
  }

  // if message is object (raw)
  if (typeof args[0] === 'object') {
    let message = args[0];
    message.roomId = this.room.id;
    return this.framework.webex.messages.create(message);
  }

  // if message is string
  else if (typeof args[0] === 'string') {
    // apply string formatters to remaining arguments
    message = util.format.apply(null, args);

    // if markdown, apply markdown formatter to contructed message string
    message = format === 'markdown' ? markdownFormat(message) : message;

    // if html, apply html formatter to contructed message string
    message = format === 'html' ? htmlFormat(message) : message;

    // construct message object
    var messageObj = {};
    messageObj[format] = message;

    // send constructed message object to room
    messageObj.roomId = this.room.id;
    return this.framework.webex.messages.create(messageObj);
  }

  else {
    return when.reject(new Error('Invalid function arguments'));
  }
};

/**
 * Send a threaded message reply
 * 
 * NOTE:  Posting a threaded message response via API is currently a Webex EFT feature.  This method WILL FAIL
 * if your application identity is not configured for EFT access
 *
 * @function
 * @param {Object} replyTo - Message or attachmentAction object to send to reply to.
 * @param {String|Object} message - Message to send to room. This can be a simple string, or a object for advanced use.
 * @param {String} [format=text] - Set message format. Valid options are 'text' or 'markdown'.
 * @returns {Promise.<Message>}
 *
 * @example
 * // Simple example
 * framework.hears('/hello', function(bot, trigger) {
 *   bot.reply(trigger.message, 'hello back at you');
 * });
 *
 * @example
 * // Markdown Method 1 - Define markdown as default
 * framework.messageFormat = 'markdown';
 * framework.hears('/hello', function(bot, trigger) {
 *   bot.reply(trigger.message, '**hello**, How are you today?');
 * });
 *
 * @example
 * // Markdown Method 2 - Define message format as part of argument string
 * framework.hears('/hello', function(bot, trigger) {
 *   bot.reply(trigger.message, '**hello**, How are you today?', 'markdown');
 * });
 *
 * @example
 * // Mardown Method 3 - Use an object (use this method of bot.reply() when needing to send a file in the same message as markdown text.
 * framework.hears('/hello', function(bot, trigger) {
 *   bot.reply(trigger.message, {markdown: '*Hello <@personEmail:' + trigger.personEmail + '|' + trigger.personDisplayName + '>*'});
 * });
 * 
 * @example
 * // Reply to a card when a user hits an action.submit button
 * framework.on('attachmentAction', function(bot, trigger) {
 *   bot.reply(trigger.attachmentAction, 'Thanks for hitting the button');
 * });
 * 
 */
Bot.prototype.reply = function (replyTo, message, format) {

  var parentId;
  if (!validator.isMessage(replyTo)) {
    if (!validator.isAttachmentAction(replyTo)) {
      return when.reject(new Error('bot.reply(): Invalid replyTo parameter.  Must be message or attachmentAction object.'));
    } else {
      // Webex insists that a reply must have a parentId that is NOT already a threaded reply
      // If that is the case for our replyTo, find the root message as the parent.
      parentId = (replyTo.parentId) ? replyTo.parentId : replyTo.messageId;
    }
  } else {
    // Webex insists that a reply must have a parentId that is NOT already a threaded reply
    // If that is the case for our replyTo, find the root message as the parent.
    parentId = (replyTo.parentId) ? replyTo.parentId : replyTo.id;
  }

  // use the default format type if the format was not specified
  if (!format) {
    var format = this.framework.messageFormat;
  } else if ((format !== 'markdown') && (format !== 'text')) {
    return when.reject(new Error('bot.reply(): Invalid format parameter.  Must be "markdown" or "text".'));
  }

  // construct message object with attachments
  var messageObj = {};
  if (typeof message === 'string') {
    messageObj[format] = message;
  } else {
    if (!validator.isMessage(message)) {
      return when.reject(new Error('bot.reply(): Invalid message parameter.  Must be string or message object.'));
    }
    messageObj = message;
  }
  messageObj.parentId = parentId;

  // send constructed message object to room
  messageObj.roomId = this.room.id;
  return this.framework.webex.messages.create(messageObj);
};


/**
 * Send text with optional file in a direct message. 
 * This sends a message to a 1:1 room with the user (creates 1:1, if one does not already exist)
 *
 * @function
 * @param {String} person - Email or personId of person to send Direct Message.
 * @param {String} [format=text] - Set message format. Valid options are 'text' or 'markdown'.
 * @param {String|Object} message - Message to send to room. This can be a simple string, or a object for advanced use.
 * @returns {Promise.<Message>}
 *
 * @example
 * // Simple example
 * framework.hears('dm me', function(bot, trigger) {
 *   bot.dm(trigger.person.id, 'hello');
 * });
 *
 * @example
 * // Simple example to send message and file
 * framework.hears('dm me a file', function(bot, trigger) {
 *   bot.dm(trigger.person.id, {text: 'Here is your file!', file: 'http://myurl/file.doc'});
 * });
 *
 * @example
 * // Markdown Method 1 - Define markdown as default
 * framework.messageFormat = 'markdown';
 * framework.hears('dm me some rich text', function(bot, trigger) {
 *   bot.dm(trigger.person.id, '**hello**, How are you today?');
 * });
 *
 * @example
 * // Markdown Method 2 - Define message format as part of argument string
 * framework.hears('dm someone', function(bot, trigger) {
 *   bot.dm('john@doe.com', 'markdown', '**hello**, How are you today?');
 * });
 *
 * @example
 * // Mardown Method 3 - Use an object (use this method of bot.dm() when needing to send a file in the same message as markdown text.
 * framework.hears('dm someone', function(bot, trigger) {
 *   bot.dm('someone@domain.com', {markdown: '*Hello <@personId:' + trigger.person.id + '|' + trigger.person.displayName + '>*'});
 * });
 */
Bot.prototype.dm = function (person, format, message) {
  // parse function args and check for wierd behavior of 
  // arguments object when function is called in a function
  var args = Array.prototype.slice.call(arguments);
  if ((args.length > 2) && (args[2] === undefined)) {
    args.pop();
  }

  message = args.length > 0 ? args.pop() : false;
  person = args.length > 0 ? args.shift() : false;
  format = args.length > 0 && _.includes(['markdown', 'html', 'text'], format) ? args.shift() : this.framework.messageFormat || 'text';

  if ((person) && (typeof message === 'string' || typeof message === 'object')) {

    var toType;
    if (validator.isEmail(person)) {
      toType = 'toPersonEmail';
    } else {
      toType = 'toPersonId';
    }

    if (typeof message === 'object') {
      message[toType] = person;
      return this.framework.webex.messages.create(message);
    }

    if (typeof message === 'string') {
      var msgObj = {};

      // if markdown, apply markdown formatter to contructed message string
      message = format === 'markdown' ? markdownFormat(message) : message;

      // if html, apply html formatter to contructed message string
      message = format === 'html' ? htmlFormat(message) : message;

      msgObj[format] = message;
      msgObj[toType] = person;
      return this.framework.webex.messages.create(msgObj);
    }
  }

  else {
    return when.reject(new Error('Invalid function arguments'));
  }
};

/**
 * Send a Webex Teams Card to room.
 *
 * @function
 * @param {Object} cardJson - The card JSON to render.  This can come from the Webex Buttons and Cards Designer.
 * @param {String} fallbackText - Message to be displayed on client's that can't render cards.
 * @returns {Promise.<Message>}
 * 
 * @see {@link https://developer.webex.com/docs/api/guides/cards/working-with-cards|Buttons and Cards Guide} for further information.
 * @see {@link ./docs/buttons-and-cards-example.md|Buttons and Cards Framework Example}
 *
 * @example
 * // Simple example
 * framework.hears('card please', function(bot, trigger) {
 *   bot.SendCard(
 *    {
 *       "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
 *       "type": "AdaptiveCard",
 *       "version": "1.0",
 *       "body": [
 *           {
 *               "type": "ColumnSet",
 *               "columns": [
 *                   {
 *                       "type": "Column",
 *                       "width": 2,
 *                       "items": [
 *                           {
 *                               "type": "TextBlock",
 *                               "text": "Card Sample",
 *                               "weight": "Bolder",
 *                               "size": "Medium"
 *                           },
 *                           {
 *                               "type": "TextBlock",
 *                               "text": "What is your name?",
 *                               "wrap": true
 *                           },
 *                           {
 *                               "type": "Input.Text",
 *                               "id": "myName",
 *                               "placeholder": "John Doe"
 *                           }
 *                       ]
 *                   }
 *               ]
 *           }
 *       ],
 *       "actions": [
 *           {
 *               "type": "Action.Submit",
 *               "title": "Submit"
 *           }
 *       ]
 *    },
 *    "This is the fallback text if the client can't render this card");
 *  });
 *
 */
Bot.prototype.sendCard = function (cardJson, fallbackText) {

  if (!fallbackText) {
    fallbackText = 'This message contains a card that this client cannot render';
  }

  // use the default format type for the fallback text
  var format = this.framework.messageFormat;

  // construct message object with attachments
  var messageObj = {};
  messageObj[format] = fallbackText;
  messageObj.attachments = [{
    contentType: "application/vnd.microsoft.card.adaptive",
    content: cardJson
  }];

  // send constructed message object to room
  messageObj.roomId = this.room.id;
  return this.framework.webex.messages.create(messageObj);
};

/**
 * Upload a file to a room using a Readable Stream
 *
 * @function
 * @param {String} filename - File name used when uploading to room
 * @param {Stream.Readable} stream - Stream Readable
 * @returns {Promise.<Message>}
 *
 * @example
 * framework.hears('/file', function(bot, trigger) {
 *
 *   // define filename used when uploading to room
 *   var filename = 'test.png';
 *
 *   // create readable stream
 *   var stream = fs.createReadStream('/my/file/test.png');
 *
 *   bot.uploadStream(filename, stream);
 * });
 */
Bot.prototype.uploadStream = function (filename, stream) {
  if (typeof filename === 'string' && stream instanceof Stream) {
    return this.messageStreamRoom(this.room.id, { filename: filename, stream: stream });
  } else {
    return when.reject(new Error('Invalid stream'));
  }
};

/**
 * Streams message to a room.
 *
 * @function
 * @param {String} roomId - Webex Teams Room ID
 * @param {Object} message - Message Object
 * @returns {Promise.<Message>}
 *
 * @example
 * var roomId = 'Tm90aGluZyB0byBzZWUgaGVyZS4uLiBNb3ZlIGFsb25nLi4u';
 * var text = 'Hello';
 * var filename = 'test.png';
 * var stream = fs.createReadStream(filename);
 * var message = { 'text': text, 'filename': filename, 'stream': stream };
 * bot.messageStreamRoom(roomId, message)
 *   .then(function(message) {
 *     console.log('Message sent: %s', message.txt);
 *   })
 *   .catch(function(err){
 *     console.log(err);
 *   });
 */
Bot.prototype.messageStreamRoom = function (roomId, message) {
  if (typeof roomId !== 'string') {
    return when.reject(new Error('roomId invalid'));
  }

  var requestOptions = {
    method: 'post',
    url: this.apiUrl + 'messages',
    headers: { 'Authorization': 'Bearer ' + this.framework.options.token },
    formData: { 'roomId': roomId }
  };

  // if message is object...
  if (typeof message === 'object') {

    // if message.text present
    if (typeof message.text === 'string') requestOptions.formData.text = message.text;

    // if message.stream found and message.filename present
    if (typeof message.stream !== 'undefined' && typeof message.filename === 'string') {

      // regex for matching file extention
      var re = /\.([0-9a-z]{1,5})$/i;

      // if file extension found...
      if (re.test(message.filename) && message.filename.match(re).length > 1) {
        var ext = message.filename.match()[1];
        requestOptions.formData.files = {
          value: message.stream,
          options: {
            filename: message.filename,
            contentType: mime.lookup(ext)
          }
        };
      }

      // else, file extension missing
      else {
        return when.reject(new Error('message.filename missing a file extension'));
      }
    }

    // if message.stream found and message.filename NOT present
    else if (typeof message.stream !== 'undefined' && typeof message.filename === 'undefined') {
      requestOptions.formData.files = message.stream;
    }

    // else, message object invalid
    else {
      return when.reject(new Error('missing message object properties'));
    }
  }
  else {
    return when.reject(new Error('message is not object'));
  }

  return when.promise((resolve, reject) => {
    req(requestOptions, (err, response, body) => {
      if (err) {
        reject(err);
      } else {
        if (response.statusCode == 200) {
          resolve(response);
        } else {
          reject(util.format('received response code %s for (%s) %s body:%j qs:%j', response.statusCode, requestOptions.method, requestOptions.url, requestOptions.body || {}, requestOptions.qs || {}));
        }
      }
    });
  }).then(res => when(res));
  //  }).then(res => this.toObject(res));
};

/**
 * Upload a file to room.
 *
 * @function
 * @param {String} filepath - File Path to upload
 * @returns {Promise.<Message>}
 *
 * @example
 * framework.hears('/file', function(bot, trigger) {
 *   bot.upload('test.png');
 * });
 */
Bot.prototype.upload = function (filepath) {
  if (typeof filepath === 'string') {
    var stream = fs.createReadStream(filepath);
    var filename = filepath.replace(/^.*[\\\/]/, '');
    return bot.uploadStream(filename, stream);
  } else {
    return when.reject(new Error('Invalid file'));
  }
};

/**
 * Remove Message By Id.
 *
 * @function
 * @param {String} messageId
 * @returns {Promise.<Message>}
 */
Bot.prototype.censor = function (messageId) {
  return this.framework.webex.messages.get(messageId)
    .then(message => {

      // if bot can delete a message...
      if ((this.isLocked && this.isModerator && !this.framework.isBotAccount) || message.personId === this.person.id) {
        return this.framework.webex.messages.remove(messageId);
      }
      else {
        return when.reject(new Error('Can not remove this message'));
      }
    });
};

/**
 * Set Title of Room.
 *
 * @function
 * @param {String} title
 * @returns {Promise.<Room>}
 *
 * @example
 * bot.roomRename('My Renamed Room')
 *   .then(function(err) {
 *     console.log(err.message)
 *   });
 */
Bot.prototype.roomRename = function (title) {
  if (!this.isGroup) {
    return when.reject(new Error('Can not set title of 1:1 room'));
  }
  else if (this.isLocked && !this.isModerator) {
    return when.reject(new Error('Bot is not moderator in this room'));
  }
  else {
    if (this.room.title != title) {
      let room = this.room;
      room.title = title;
      return this.framework.webex.rooms.update(room)
        .then((r) => {
          this.room = r;
          return when(this);
        });
    } else {
      return when(this);
    }
  }
};

/**
 * Get messages from room. Returned data has newest message at bottom.
 *
 * This function will not work when framework was created
 * using a bot token, it requires an authorized user token
 *
 * @function
 * @param {Integer} count -- count of messages to return (max 10)
 * @returns {Promise.<Array>}
 *
 * @example
 * bot.getMessages(5).then(function(messages) {
 *   messages.forEach(function(message) {
 *     // display message text
 *     if(message.text) {
 *       console.log(message.text);
 *     }
 *   });
 * });
 */
Bot.prototype.getMessages = function (count) {
  if (this.framework.isBotAccount) {
    return when.reject(new Error('Bot accounts can not read room messages'));
  } else {
    count = typeof count !== 'number' && parseInt(count, 10) ? parseInt(count, 10) : count;
    return this.framework.webex.messages.list({ roomId: this.room.id, max: count })
      .then(messages => when.map(_.reverse(messages), message => this.framework.parseMessage(message)));
  }
};

/**
 * Store key/value data.
 *
 * @function
 * @param {String} key - Key under id object
 * @param {(String|Number|Boolean|Array|Object)} value - Value of key
 * @returns {(Promise.<String>|Promise.<Number>|Promise.<Boolean>|Promise.<Array>|Promise.<Object>)}
 */
Bot.prototype.store = null;

/**
 * Recall value of data stored by 'key'.
 *
 * @function
 * @param {String} [key] - Key under id object (optional). If key is not passed, all keys for id are returned as an object.
 * @returns {(Promise.<String>|Promise.<Number>|Promise.<Boolean>|Promise.<Array>|Promise.<Object>)}
 */
Bot.prototype.recall = null;

/**
 * Forget a key or entire store.
 *
 * @function
 * @param {String} [key] - Key under id object (optional). If key is not passed, id and all children are removed.
 * @returns {(Promise.<String>|Promise.<Number>|Promise.<Boolean>|Promise.<Array>|Promise.<Object>)}
 */
Bot.prototype.forget = null;

module.exports = Bot;
