const assert = require('assert');
const when = require('when');
const validator = require('../../lib/validator');
var _ = require('lodash');

const User_Test_Space_Title = 'Flint User Created Test Room';
const Bot_Test_Space_Title = 'Flint Bot Created Test Room';



module.exports = {
  // Parent test will init the flint and SDK objects
  setFlint: function (f) {
    this.flint = f;
  },
  setUser: function (w) {
    this.userWebex = w;
  },

  // Common Tasks used by tests
  initFlint: function (testName, flint, userWebex) {
    // Wait for flint to generate events that indicate it started succesfully
    const started = new Promise((resolve) => {
      this.flintStartHandler(testName, flint, resolve);
    });
    const initialized = new Promise((resolve) => {
      this.flintInitializedHandler(testName, flint, resolve);
    });

    flint.start()
      .catch(() => {
        console.error('Flint initialization failed, abandon all tests!');
        process.exit(-1);
      });
    // While we wait for flint, lets validate the user
    let userInfoIsReady = userWebex.people.get('me');
    // Now wait until flint is initialized
    return when.all([started, initialized])
      .then(() => {
        assert(validator.isFlint(flint),
          'Flint did not initialize succesfully');
        flint.debug(`${flint.email} is in ${flint.bots.length} at the start of the tests.`);
        if (process.env.CLEANUP_USER_ROOMS) {
          asUserCeanupFromPreviousTests(userWebex);
        }
        // Make sure we have user info before next step...
        return when(userInfoIsReady);
      })
      .then((person) => {
        this.userInfo = person;
        assert(validator.isPerson(person),
          'getPerson did not return a valid person');
        this.botForUser1on1Space = cleanupFromPreviousTests(flint, this.userInfo);
        return when(true);
      })
      .catch((e) => {
        console.error(`Setup failed: ${e.message}`);
        return Promise.reject(e);
      });
  },

  stopFlint: function (testName, flint) {
    if (flint) {
      const stopped = new Promise((resolve) => {
        this.flintStopHandler(testName, flint, resolve);
      });

      return flint.stop()
        .then(() => when(stopped))
        .catch((e) => console.error(`Failled during flint.stop(): ${e.message}`));
    }
  },


  addBotToSpace: function (testName, flint, userCreatedTestRoom, eventsData) {
    let membership;
    // Wait for the events associated with a new membership before completing test..
    const membershipEvent = new Promise((resolve) => {
      this.flintMembershipCreatedHandler(testName, flint, eventsData, resolve);
    });
    const spawned = new Promise((resolve) => {
      this.flintSpawnedHandler(testName, flint, eventsData, resolve);
    });

    // Add the bot to our user created space
    return this.userWebex.memberships.create({
      roomId: userCreatedTestRoom.id,
      personId: flint.person.id
    })
      .then((m) => {
        membership = m;
        return assert(validator.isMembership(membership),
          'create memebership did not return a valid membership');
      })
      // Wait for flint's membershipCreated event
      .then(() => when(membershipEvent)
        .then(() => {
          assert((eventsData.membership.id === membership.id),
            'Membership from flint event does not match the one returned by API');
          return when(spawned);
        })
        // Wait for flint's spawned event
        .then(() => {
          userCreatedRoomBot = eventsData.bot;
          this.createBotEventHandlers(userCreatedRoomBot);
          assert(_.find(flint.bots, bot => bot.room.id === userCreatedRoomBot.room.id),
            'After spawn new bot is not in flint\'s bot array');
          return userCreatedRoomBot;
        })
        .catch((e) => {
          console.error(`Bot spawn test failed: ${e.message}`);
          return Promise.reject(e);
        }));
    // .catch((e) => {
    //   console.error(`Spawn event never occured: ${e.message}`);
    //   return Promise.reject(e);
    // });
  },

  botLeaveRoom: function (testName, flint, bot, roomToLeave, eventsData) {
    const membershipDeleted = new Promise((resolve) => {
      this.flintMembershipDeletedHandler(testName, flint, eventsData, resolve);
    });
    const stopped = new Promise((resolve) => {
      bot.stopHandler(testName, resolve);
    });
    const despawned = new Promise((resolve) => {
      this.flintDespawnHandler(testName, flint, eventsData, resolve);
    });


    return bot.exit()
      .then(() => when.all([membershipDeleted, stopped, despawned]))
      .catch((e) => {
        console.error(`Bot failed to exit room: ${e.message}`);
      });
  },

  botCreateRoom: function (testName, flint, bot, eventsData, members) {
    // Wait for the events associated with a new membership before completing test..
    const roomCreated = new Promise((resolve) => {
      this.flintRoomCreatedHandler(testName, flint, eventsData, resolve);
    });
    const membershipCreatedEvent = new Promise((resolve) => {
      this.flintMembershipCreatedHandler(testName, flint, eventsData, resolve);
    });
    const spawned = new Promise((resolve) => {
      this.flintSpawnedHandler(testName, flint, eventsData, resolve);
    });

    return bot.newRoom(Bot_Test_Space_Title, members)
      .then((b) => {
        botCreatedRoomBot = b;
        assert(validator.isBot(b),
          `Bot returned by bot.newRoom is not valid.`);
        assert(validator.isRoom(b.room),
          `Room returned by bot.newRoom is not valid.`);
        this.createBotEventHandlers(b);
        return when(roomCreated);
      })
      // Wait for flint's membershipCreated event
      .then(() => {
        assert((eventsData.room.id == botCreatedRoomBot.room.id),
          'Room from flint roomCreated event does not match ' +
          'the one in the bot returned by newRoom()');
        return when(membershipCreatedEvent);
      })
      .then(() => {
        assert((eventsData.membership.id === botCreatedRoomBot.membership.id),
          'Membership from flint membershipCreated event does not match ' +
          'the one in the bot returned by newRoom()');
        return when(spawned);
      })
      // Wait for flint's spawned event
      .then(() => {
        assert((eventsData.bot.id == botCreatedRoomBot.id),
          'Bot from flint spawned event does not match the one returned by newRoom()');
        assert(_.find(flint.bots, bot => bot.room.id === botCreatedRoomBot.room.id),
          'After spawn new bot is not in flint\'s bot array');
        return when(botCreatedRoomBot);
      })
      .catch((e) => {
        console.error(`Bot newRoom() test failed: ${e.message}`);
        return Promise.reject(e);
      });
  },

  userSendMessage: function (testName, flint, userWebex, bot, eventsData, hearsInfo, markdown, files) {
    // Check the markdown to see if there is an at-mention in the message
    let isMention = (_.toLower(markdown).indexOf('<@PersonId') > -1);

    const heard = new Promise((resolve) => {
      //      if (!hearsInfo.priority) { 
      hearsInfo.functionVar = flint.hears(hearsInfo.phrase, (b, t) => {
        assert((b.id === bot.id),
          'bot returned in fint.hears("hi") is not the one expected');
        assert(validator.objIsEqual(t, eventsData.trigger),
          'trigger returned in flint.hears("hi") was not as expected');
        flint.debug('Bot heard message "hi" that user posted');
        resolve(true);
      }), hearsInfo.helpString, hearsInfo.priority;
      //      };
    });

    // Wait for the events associated with a new message before completing test..
    messageCreatedEvent = new Promise((resolve) => {
      this.flintMessageCreatedEventHandler(testName, flint, eventsData, resolve);
    });
    if (isMention) {
      flintMentionedEvent = new Promise((resolve) => {
        this.flintMentionedHandler(testName, flint, eventsData, resolve);
      });
      botMentionedEvent = new Promise((resolve) => {
        bot.mentionedHandler(testName, eventsData, resolve);
      });
    }
    flintMessageEvent = new Promise((resolve) => {
      this.flintMessageHandler(testName, flint, eventsData, resolve);
    });
    botMessageEvent = new Promise((resolve) => {
      bot.messageHandler(testName, eventsData, resolve);
    });

    // As the user, send the message, mentioning the bot
    msgObj = {
      roomId: bot.room.id,
      markdown: markdown
    };
    if (files) { msgObj.files = files; }

    return userWebex.messages.create(msgObj)
      .then((m) => {
        message = m;
        assert(validator.isMessage(message),
          `Test:${testName} create message did not return a valid message`);
        // Wait for all the event handlers and the heard handler to fire
        if (isMention) {
          return when.all([messageCreatedEvent, flintMentionedEvent, botMentionedEvent, flintMessageEvent, botMessageEvent, heard]);
        } else {
          // Don;t wait for the mentioned events....
          return when.all([messageCreatedEvent, flintMessageEvent, botMessageEvent, heard]);
        }
      })
      .then(() => when(message))
      .catch((e) => {
        console.error(`${testName} failed: ${e.message}`);
        return Promise.reject(e);
      });
  },



  // Flint Event Handlers

  flintStartHandler: function (testName, flint, promiseResolveFunction) {
    this.flint.once('start', (id) => {
      flint.debug(`Flint start event occurred in test ${testName}`);
      promiseResolveFunction(assert(id === flint.id));
    });
  },

  flintInitializedHandler: function (testName, flint, promiseResolveFunction) {
    this.flint.once('initialized', (id) => {
      flint.debug(`Flint initiatlized event occurred in test:${testName}`);
      promiseResolveFunction(assert(id === flint.id));
    });
  },

  flintSpawnedHandler: function (testName, flint, eventsData, promiseResolveFunction) {
    this.flint.once('spawn', (bot) => {
      flint.debug(`Flint spawned  event occurred in test ${testName}`);
      eventsData.bot = bot;
      promiseResolveFunction(assert(validator.isBot(bot),
        'spawned event did not include a valid bot'));
    });
  },

  flintRoomCreatedHandler: function (testName, flint, eventsData, promiseResolveFunction) {
    this.flint.once('roomCreated', (room, id) => {
      flint.debug(`Flint roomCreated event occurred in test ${testName}`);
      eventsData.room = room;
      assert((id === flint.id),
        'id returned in flint.on("roomCreated") is not the one expected');
      promiseResolveFunction(assert(validator.isRoom(room),
        'roomCreated event did not include a valid message'));
    });
  },

  flintMembershipCreatedHandler: function (testName, flint, eventsData, promiseResolveFunction) {
    this.flint.once('membershipCreated', (membership, id) => {
      flint.debug(`Flint membershipCreated event occurred in test ${testName}`);
      eventsData.membership = membership;
      assert(validator.isMembership(membership),
        'membershipCreated event did not include a valid membership');
      promiseResolveFunction(assert(id === flint.id));
    });
  },

  flintMembershipUpdatedHandler: function (testName, flint, eventsData, promiseResolveFunction) {
    this.flint.once('membershipUpdated', (membership, id) => {
      flint.debug(`Flint membershipUpdated event occurred in test ${testName}`);
      eventsData.membership = membership;
      assert(validator.isMembership(membership),
        'membershipUpdated event did not include a valid membership');
      promiseResolveFunction(assert(id === flint.id));
    });
  },

  flintMessageCreatedEventHandler: function (testName, flint, eventsData, promiseResolveFunction) {
    this.flint.once('messageCreated', (message, id) => {
      flint.debug(`Flint messageCreated event occurred in test ${testName}`);
      eventsData.message = message;
      assert((id === flint.id),
        'id returned in flint.on("messageCreated") is not the one expected');
      promiseResolveFunction(assert(validator.isMessage(message),
        'memssageCreated event did not include a valid message'));
    });
  },

  flintMentionedHandler: function (testName, flint, eventsData, promiseResolveFunction) {
    this.flint.once('mentioned', (bot, trigger, id) => {
      flint.debug(`Flint mentioned event occurred in test ${testName}`);
      assert(validator.isBot(bot),
        'mentioned event did not include a valid bot');
      assert((bot.id === eventsData.bot.id),
        'bot returned in flint.on("mentioned") is not the one expected');
      assert(validator.isTrigger(trigger),
        'mentioned event did not include a valid trigger');
      eventsData.trigger = trigger;
      assert((id === flint.id),
        'id returned in flint.on("mentioned") is not the one expected');
      promiseResolveFunction(true);
    });
  },

  flintMessageHandler: function (testName, flint, eventsData, promiseResolveFunction) {
    this.flint.once('message', (bot, trigger, id) => {
      flint.debug(`Flint message event occurred in test ${testName}`);
      assert(validator.isBot(bot),
        'message event did not include a valid bot');
      assert((bot.id === eventsData.bot.id),
        'bot returned in flint.on("message") is not the one expected');
      assert(validator.isTrigger(trigger),
        'message event did not include a valid trigger');
      eventsData.trigger = trigger;
      assert((id === flint.id),
        'id returned in flint.on("message") is not the one expected');
      promiseResolveFunction(true);
    });
  },

  flintFilesHandler: function (testName, flint, eventsData, promiseResolveFunction) {
    this.flint.once('files', (bot, trigger, id) => {
      flint.debug(`Flint files event occurred in test ${testName}`);
      assert(validator.isBot(bot),
        'files event did not include a valid bot');
      assert((bot.id === eventsData.bot.id),
        'bot returned in flint.on("files") is not the one expected');
      assert(validator.isTrigger(trigger),
        'files event did not include a valid trigger');
      eventsData.trigger = trigger;
      assert((id === flint.id),
        'id returned in flint.on("files") is not the one expected');
      promiseResolveFunction(true);
    });
  },

  flintMemberEntersHandler: function (testName, flint, eventsData, promiseResolveFunction) {
    this.flint.once('memberEnters', (bot, membership, id) => {
      flint.debug(`Flint memberEnters event occurred in test ${testName}`);
      assert(validator.isBot(bot),
        'bot in memberEnters event did not include a valid bot');
      assert((bot.id === eventsData.bot.id),
        'bot returned in flint.on("memberEnters") is not the one expected');
      // TODO validate membership
      assert((id === flint.id),
        'id returned in flint.on("memberEnters") is not the one expected');
      promiseResolveFunction(true);
    });
  },

  flintMemberAddedAsModeratorHandler: function (testName, flint, eventsData, promiseResolveFunction) {
    this.flint.once('memberAddedAsModerator', (bot, membership, id) => {
      flint.debug(`Flint memberAddedAsModerator event occurred in test ${testName}`);
      assert(validator.isBot(bot),
        'bot in memberAddedAsModerator event did not include a valid bot');
      assert((bot.id === eventsData.bot.id),
        'bot returned in flint.on("memberAddedAsModerator") is not the one expected');
      assert((membership.id === eventsData.membership.id),
        'membership returned in flint.on("memberAddedAsModerator") is not the one expected');
      assert(validator.isMembership(membership),
        'membership returned in flint.on("memberAddedAsModerator") is not valid');
      assert((id === flint.id),
        'id returned in flint.on("personEmemberAddedAsModeratornters") is not the one expected');
      promiseResolveFunction(true);
    });
  },

  flintMemberExitsHandler: function (testName, flint, eventsData, promiseResolveFunction) {
    this.flint.once('memberExits', (bot, membership, id) => {
      flint.debug(`Flint memberExits event occurred in test ${testName}`);
      assert(validator.isBot(bot),
        'bot in memberExits event did not include a valid bot');
      assert((bot.id === eventsData.bot.id),
        'bot returned in flint.on("memberExits") is not the one expected');
      assert((membership.id === eventsData.membership.id),
        'membership returned in flint.on("memberExits") is not the one expected');
      assert(validator.isMembership(membership),
        'membership returned in flint.on("memberExits") is not valid');
      assert((id === flint.id),
        'id returned in flint.on("memberExits") is not the one expected');
      promiseResolveFunction(true);
    });
  },

  flintMembershipDeletedHandler: function (testName, flint, eventsData, promiseResolveFunction) {
    this.flint.once('membershipDeleted', (membership, id) => {
      flint.debug(`Flint membershipDeleted event occurred in test ${testName}`);
      assert(id === flint.id);
      assert(validator.isMembership(membership),
        'membership returned in flint.on("membershipDeleted") is not valid');
      eventsData.membership = membership;
      promiseResolveFunction(assert(validator.isMembership(membership),
        'membershipDeleted event did not include a valid membership'));
    });
  },

  flintDespawnHandler: function (testName, flint, eventsData, promiseResolveFunction) {
    this.flint.once('despawn', (bot, id) => {
      flint.debug(`Flint despawn event occurred in test ${testName}`);
      assert(eventsData.bot.id === bot.id);
      eventsData.leftRoomId = bot.room.id;
      assert((id === flint.id),
        'id returned in flint.on("despawn") is not the one expected');
      promiseResolveFunction(assert(validator.isBot(bot),
        'despawn event did not include a valid bot'));
    });
  },

  flintStopHandler: function (testName, flint, promiseResolveFunction) {
    this.flint.once('stop', (id) => {
      flint.debug(`Flint stop event occurred in test ${testName}`);
      promiseResolveFunction(assert(id === flint.id));
    });
  },

  // Bot event handlers (set up when a new bot instance is created)
  createBotEventHandlers: function (activeBot) {
    activeBot.mentionedHandler = function (testName, eventsData, promiseResolveFunction) {
      activeBot.once('mentioned', (bot, trigger, id) => {
        this.flint.debug(`Bot mentioned event occurred in test ${testName}`);
        assert(validator.isBot(bot),
          'mentioned event did not include a valid bot');
        assert((bot.id === activeBot.id),
          'bot returned in bot.on("mentioned") is not the one expected');
        assert(validator.isTrigger(trigger),
          'mentioned event did not include a valid trigger');
        assert((id === activeBot.id),
          'id returned in flint.on("mentioned") is not the one expected');
        promiseResolveFunction(true);
      });
    },

      activeBot.messageHandler = function (testName, eventsData, promiseResolveFunction) {
        activeBot.once('message', (bot, trigger, id) => {
          this.flint.debug(`Bot message event occurred in test ${testName}`);
          assert(validator.isBot(bot),
            'message event did not include a valid bot');
          assert((bot.id === activeBot.id),
            'bot returned in bot.on("message") is not the one expected');
          assert(validator.isTrigger(trigger),
            'message event did not include a valid trigger');
          assert((id === activeBot.id),
            'id returned in flint.on("message") is not the one expected');
          promiseResolveFunction(true);
        });
      };

    activeBot.filesHandler = function (testName, eventsData, promiseResolveFunction) {
      activeBot.once('files', (bot, trigger, id) => {
        this.flint.debug(`Bot files event occurred in test ${testName}`);
        assert(validator.isBot(bot),
          'files event did not include a valid bot');
        assert((bot.id === activeBot.id),
          'bot returned in bot.on("files") is not the one expected');
        assert(validator.isTrigger(trigger),
          'files event did not include a valid trigger');
        assert((id === activeBot.id),
          'id returned in flint.on("files") is not the one expected');
        promiseResolveFunction(true);
      });
    };

    activeBot.memberEntersHandler = function (testName, eventsData, promiseResolveFunction) {
      activeBot.once('memberEnters', (bot, membership) => {
        this.flint.debug(`Bot memberEnters event occurred in test ${testName}`);
        assert(validator.isBot(bot),
          'bot memberEnters event did not include a valid bot');
        assert((bot.id === activeBot.id),
          'bot returned in bot.on("memberEnters") is not the one expected');
        assert((membership.id === eventsData.membership.id),
          'membership returned in flint.on("memberEnters") is not the one expected');
        assert(validator.isMembership(membership),
          'membership returned in flint.on("memberEnters") is not valid');
        promiseResolveFunction(true);
      });
    };

    activeBot.memberAddedAsModerator = function (testName, eventsData, promiseResolveFunction) {
      activeBot.once('memberAddedAsModerator', (bot, membership) => {
        this.flint.debug(`Bot memberAddedAsModerator event occurred in test ${testName}`);
        assert(validator.isBot(bot),
          'bot memberAddedAsModerator event did not include a valid bot');
        assert((bot.id === activeBot.id),
          'bot returned in bot.on("memberAddedAsModerator") is not the one expected');
        assert((membership.id === eventsData.membership.id),
          'membership returned in flint.on("memberAddedAsModerator") is not the one expected');
        assert(validator.isMembership(membership),
          'membership returned in flint.on("memberAddedAsModerator") is not valid');
        promiseResolveFunction(true);
      });
    };

    activeBot.memberExitsHandler = function (testName, eventsData, promiseResolveFunction) {
      activeBot.once('memberExits', (bot, membership) => {
        this.flint.debug(`Bot memberExits event occurred in test ${testName}`);
        assert(validator.isBot(bot),
          'bot memberExits event did not include a valid bot');
        assert((bot.id === activeBot.id),
          'bot returned in bot.on("memberExits") is not the one expected');
        assert((membership.id === eventsData.membership.id),
          'membership returned in flint.on("memberExits") is not the one expected');
        assert(validator.isMembership(membership),
          'membership returned in flint.on("memberExits") is not valid');
        promiseResolveFunction(true);
      });
    };

    activeBot.stopHandler = function (testName, promiseResolveFunction) {
      activeBot.once('stop', (bot) => {
        this.flint.debug(`Bot stop event occurred in test ${testName}`);
        assert(validator.isBot(bot),
          'bot event did not include a valid bot');
        assert((bot.id === activeBot.id),
          'bot returned in bot.on("stop") is not the one expected');
        promiseResolveFunction(true);
      });
    };
  },

  // Additional flint events to-do
  // attachmentAction
  // files (and for bot)

  // Common variables
  // flint: this.flint,
  // userWebex: this.userWebex,
  User_Test_Space_Title: User_Test_Space_Title,
  Bot_Test_Space_Title: Bot_Test_Space_Title,
  botForUser1on1Space: '',

  // Common helpers
  assert: assert,
  when: when,
  validator: validator,
  _: _

};

// Internal Helper functions

// Delete spaces leftover from previous test runs
// Aslo Check if the test bot already has a 1-1 space with the test user
function cleanupFromPreviousTests(flint, user) {
  botForUser1on1Space = null;
  for (let bot of flint.bots) {
    assert(validator.isBot(bot),
      'bot in flint.bots did not validate preoprly!');
    if ((bot.room.title === User_Test_Space_Title) ||
      (bot.room.title === Bot_Test_Space_Title)) {
      flint.debug('Removing room left over from previous test...');
      flint.webex.rooms.remove(bot.room);
    } else if (bot.room.type == 'direct') {
      if (bot.isDirectTo == user.emails[0]) {
        flint.debug(`Found existing direct space with ${bot.room.title}.  Will run direct message tests.`);
        botForUser1on1Space = bot;
      }
    }
  }
  return botForUser1on1Space;
}

function asUserCeanupFromPreviousTests(userWebex) {
  userWebex.rooms.list()
    .then((rooms) => {
      for (let room of rooms.items) {
        if ((room.title === User_Test_Space_Title) ||
          (room.title === Bot_Test_Space_Title)) {
          flint.debug('As user, removing room left over from previous test...');
          userWebex.rooms.remove(room);
        }
      }
    });
}




