const assert = require('assert');
const when = require('when');
const validator = require('../../lib/validator');
var _ = require('lodash');

const User_Test_Space_Title = 'Framework User Created Test Room';
const Bot_Test_Space_Title = 'Framework Bot Created Test Room';



module.exports = {
  // Parent test will init the framework and SDK objects
  setFramework: function (f) {
    this.framework = f;
  },
  setUser: function (w) {
    this.userWebex = w;
  },

  // Common Tasks used by tests
  initFramework: function (testName, framework, userWebex) {
    console.log('In initFramework...');
    // Wait for framework to generate events that indicate it started succesfully
    const started = new Promise((resolve) => {
      this.frameworkStartHandler(testName, framework, resolve);
    });
    const initialized = new Promise((resolve) => {
      this.frameworkInitializedHandler(testName, framework, resolve);
    });

    framework.start()
      .catch((e) => {
        console.error(`Framework initialization failed: ${e.message}, abandon all tests!`);
        process.exit(-1);
      });
    // While we wait for framework, lets validate the user
    let userInfoIsReady = userWebex.people.get('me');
    console.log('Waiting for framework initialization to complete...');
    // Now wait until framework is initialized
    return when.all([started, initialized])
      .then(() => {
        assert(validator.isFramework(framework),
          'Framework did not initialize succesfully');
        framework.debug(`${framework.email} is in ${framework.bots.length} at the start of the tests.`);
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
        this.botForUser1on1Space = cleanupFromPreviousTests(framework, this.userInfo);
        return when(true);
      })
      .catch((e) => {
        console.error(`Setup failed: ${e.message}`);
        return Promise.reject(e);
      });
  },

  stopFramework: function (testName, framework) {
    if (framework) {
      const stopped = new Promise((resolve) => {
        this.frameworkStopHandler(testName, framework, resolve);
      });

      return framework.stop()
        .then(() => when(stopped))
        .catch((e) => console.error(`Failled during framework.stop(): ${e.message}`));
    }
  },


  addBotToSpace: function (testName, framework, userCreatedTestRoom, eventsData) {
    let membership;
    // Wait for the events associated with a new membership before completing test..
    const membershipEvent = new Promise((resolve) => {
      this.frameworkMembershipCreatedHandler(testName, framework, eventsData, resolve);
    });
    const spawned = new Promise((resolve) => {
      this.frameworkSpawnedHandler(testName, framework, eventsData, resolve);
    });

    // Add the bot to our user created space
    return this.userWebex.memberships.create({
      roomId: userCreatedTestRoom.id,
      personId: framework.person.id
    })
      .then((m) => {
        membership = m;
        return assert(validator.isMembership(membership),
          'create memebership did not return a valid membership');
      })
      // Wait for framework's membershipCreated event
      .then(() => when(membershipEvent)
        .then(() => {
          assert((eventsData.membership.id === membership.id),
            'Membership from framework event does not match the one returned by API');
          return when(spawned);
        })
        // Wait for framework's spawned event
        .then(() => {
          userCreatedRoomBot = eventsData.bot;
          this.createBotEventHandlers(userCreatedRoomBot);
          assert(_.find(framework.bots, bot => bot.room.id === userCreatedRoomBot.room.id),
            'After spawn new bot is not in framework\'s bot array');
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

  botLeaveRoom: function (testName, framework, bot, roomToLeave, eventsData) {
    const membershipDeleted = new Promise((resolve) => {
      this.frameworkMembershipDeletedHandler(testName, framework, eventsData, resolve);
    });
    const stopped = new Promise((resolve) => {
      bot.stopHandler(testName, resolve);
    });
    const despawned = new Promise((resolve) => {
      this.frameworkDespawnHandler(testName, framework, eventsData, resolve);
    });


    return bot.exit()
      .then(() => when.all([membershipDeleted, stopped, despawned]))
      .catch((e) => {
        console.error(`Bot failed to exit room: ${e.message}`);
      });
  },

  botCreateRoom: function (testName, framework, bot, eventsData, members) {
    // Wait for the events associated with a new membership before completing test..
    const roomCreated = new Promise((resolve) => {
      this.frameworkRoomCreatedHandler(testName, framework, eventsData, resolve);
    });
    const membershipCreatedEvent = new Promise((resolve) => {
      this.frameworkMembershipCreatedHandler(testName, framework, eventsData, resolve);
    });
    const spawned = new Promise((resolve) => {
      this.frameworkSpawnedHandler(testName, framework, eventsData, resolve);
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
      // Wait for framework's membershipCreated event
      .then(() => {
        assert((eventsData.room.id == botCreatedRoomBot.room.id),
          'Room from framework roomCreated event does not match ' +
          'the one in the bot returned by newRoom()');
        return when(membershipCreatedEvent);
      })
      .then(() => {
        assert((eventsData.membership.id === botCreatedRoomBot.membership.id),
          'Membership from framework membershipCreated event does not match ' +
          'the one in the bot returned by newRoom()');
        return when(spawned);
      })
      // Wait for framework's spawned event
      .then(() => {
        assert((eventsData.bot.id == botCreatedRoomBot.id),
          'Bot from framework spawned event does not match the one returned by newRoom()');
        assert(_.find(framework.bots, bot => bot.room.id === botCreatedRoomBot.room.id),
          'After spawn new bot is not in framework\'s bot array');
        return when(botCreatedRoomBot);
      })
      .catch((e) => {
        console.error(`Bot newRoom() test failed: ${e.message}`);
        return Promise.reject(e);
      });
  },

  userSendMessage: function (testName, framework, userWebex, bot, eventsData, hearsInfo, markdown, files) {
    // unless instructed otherwise we add a mention when our bot is 
    // not running with a user token
    let isMention = false;
    if (framework.isBotAccount) {
      markdown = `<@personId:${bot.person.id}> ${markdown}`;
      isMention = true;
    }

    // Check the markdown to see if there is an at-mention in the message
    //let isMention = (_.toLower(markdown).indexOf('<@PersonId') > -1);

    const heard = new Promise((resolve) => {
      //      if (!hearsInfo.priority) { 
      hearsInfo.functionVar = framework.hears(hearsInfo.phrase, (b, t) => {
        assert((b.id === bot.id),
          'bot returned in fint.hears("hi") is not the one expected');
        assert(validator.objIsEqual(t, eventsData.trigger),
          'trigger returned in framework.hears("hi") was not as expected');
        framework.debug('Bot heard message "hi" that user posted');
        resolve(true);
      }), hearsInfo.helpString, hearsInfo.priority;
      //      };
    });

    // Wait for the events associated with a new message before completing test..
    messageCreatedEvent = new Promise((resolve) => {
      this.frameworkMessageCreatedEventHandler(testName, framework, eventsData, resolve);
    });
    if (isMention) {
      frameworkMentionedEvent = new Promise((resolve) => {
        this.frameworkMentionedHandler(testName, framework, eventsData, resolve);
      });
      botMentionedEvent = new Promise((resolve) => {
        bot.mentionedHandler(testName, eventsData, resolve);
      });
    }
    frameworkMessageEvent = new Promise((resolve) => {
      this.frameworkMessageHandler(testName, framework, eventsData, resolve);
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
          return when.all([messageCreatedEvent, frameworkMentionedEvent, botMentionedEvent, frameworkMessageEvent, botMessageEvent, heard]);
        } else {
          // Don;t wait for the mentioned events....
          return when.all([messageCreatedEvent, frameworkMessageEvent, botMessageEvent, heard]);
        }
      })
      .then(() => when(message))
      .catch((e) => {
        console.error(`${testName} failed: ${e.message}`);
        return Promise.reject(e);
      });
  },



  // Framework Event Handlers

  frameworkStartHandler: function (testName, framework, promiseResolveFunction) {
    this.framework.once('start', (id) => {
      framework.debug(`Framework start event occurred in test ${testName}`);
      promiseResolveFunction(assert(id === framework.id));
    });
  },

  frameworkInitializedHandler: function (testName, framework, promiseResolveFunction) {
    this.framework.once('initialized', (id) => {
      framework.debug(`Framework initiatlized event occurred in test:${testName}`);
      promiseResolveFunction(assert(id === framework.id));
    });
  },

  frameworkSpawnedHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    this.framework.once('spawn', (bot, frameworkId, addedBy) => {
      framework.debug(`Framework spawned  event occurred in test ${testName}`);
      eventsData.bot = bot;
      assert((frameworkId === framework.id),
        `In ${testName}, the frameworkId passed to the spawned handler was not as expected`);
      if (addedBy) {
        eventsData.addedBy = addedBy;
      }
      promiseResolveFunction(assert(validator.isBot(bot),
        'spawned event did not include a valid bot'));
    });
  },

  frameworkRoomCreatedHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    this.framework.once('roomCreated', (room, id) => {
      framework.debug(`Framework roomCreated event occurred in test ${testName}`);
      eventsData.room = room;
      assert((id === framework.id),
        'id returned in framework.on("roomCreated") is not the one expected');
      promiseResolveFunction(assert(validator.isRoom(room),
        'roomCreated event did not include a valid message'));
    });
  },

  frameworkMembershipCreatedHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    this.framework.once('membershipCreated', (membership, id) => {
      framework.debug(`Framework membershipCreated event occurred in test ${testName}`);
      eventsData.membership = membership;
      assert(validator.isMembership(membership),
        'membershipCreated event did not include a valid membership');
      promiseResolveFunction(assert(id === framework.id));
    });
  },

  frameworkMembershipUpdatedHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    this.framework.once('membershipUpdated', (membership, id) => {
      framework.debug(`Framework membershipUpdated event occurred in test ${testName}`);
      eventsData.membership = membership;
      assert(validator.isMembership(membership),
        'membershipUpdated event did not include a valid membership');
      promiseResolveFunction(assert(id === framework.id));
    });
  },

  frameworkMessageCreatedEventHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    this.framework.once('messageCreated', (message, id) => {
      framework.debug(`Framework messageCreated event occurred in test ${testName}`);
      eventsData.message = message;
      assert((id === framework.id),
        'id returned in framework.on("messageCreated") is not the one expected');
      promiseResolveFunction(assert(validator.isMessage(message),
        'memssageCreated event did not include a valid message'));
    });
  },

  frameworkMentionedHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    this.framework.once('mentioned', (bot, trigger, id) => {
      framework.debug(`Framework mentioned event occurred in test ${testName}`);
      assert(validator.isBot(bot),
        'mentioned event did not include a valid bot');
      assert((bot.id === eventsData.bot.id),
        'bot returned in framework.on("mentioned") is not the one expected');
      assert(validator.isTrigger(trigger),
        'mentioned event did not include a valid trigger');
      eventsData.trigger = trigger;
      assert((id === framework.id),
        'id returned in framework.on("mentioned") is not the one expected');
      promiseResolveFunction(true);
    });
  },

  frameworkMessageHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    this.framework.once('message', (bot, trigger, id) => {
      framework.debug(`Framework message event occurred in test ${testName}`);
      assert(validator.isBot(bot),
        'message event did not include a valid bot');
      assert((bot.id === eventsData.bot.id),
        'bot returned in framework.on("message") is not the one expected');
      assert(validator.isTrigger(trigger),
        'message event did not include a valid trigger');
      eventsData.trigger = trigger;
      assert((id === framework.id),
        'id returned in framework.on("message") is not the one expected');
      promiseResolveFunction(true);
    });
  },

  frameworkFilesHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    this.framework.once('files', (bot, trigger, id) => {
      framework.debug(`Framework files event occurred in test ${testName}`);
      assert(validator.isBot(bot),
        'files event did not include a valid bot');
      assert((bot.id === eventsData.bot.id),
        'bot returned in framework.on("files") is not the one expected');
      assert(validator.isTrigger(trigger),
        'files event did not include a valid trigger');
      eventsData.trigger = trigger;
      assert((id === framework.id),
        'id returned in framework.on("files") is not the one expected');
      promiseResolveFunction(true);
    });
  },

  frameworkMemberEntersHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    this.framework.once('memberEnters', (bot, membership, id) => {
      framework.debug(`Framework memberEnters event occurred in test ${testName}`);
      assert(validator.isBot(bot),
        'bot in memberEnters event did not include a valid bot');
      assert((bot.id === eventsData.bot.id),
        'bot returned in framework.on("memberEnters") is not the one expected');
      // TODO validate membership
      assert((id === framework.id),
        'id returned in framework.on("memberEnters") is not the one expected');
      promiseResolveFunction(true);
    });
  },

  frameworkMemberAddedAsModeratorHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    this.framework.once('memberAddedAsModerator', (bot, membership, id) => {
      framework.debug(`Framework memberAddedAsModerator event occurred in test ${testName}`);
      assert(validator.isBot(bot),
        'bot in memberAddedAsModerator event did not include a valid bot');
      assert((bot.id === eventsData.bot.id),
        'bot returned in framework.on("memberAddedAsModerator") is not the one expected');
      assert((membership.id === eventsData.membership.id),
        'membership returned in framework.on("memberAddedAsModerator") is not the one expected');
      assert(validator.isMembership(membership),
        'membership returned in framework.on("memberAddedAsModerator") is not valid');
      assert((id === framework.id),
        'id returned in framework.on("personEmemberAddedAsModeratornters") is not the one expected');
      promiseResolveFunction(true);
    });
  },

  frameworkMemberExitsHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    this.framework.once('memberExits', (bot, membership, id) => {
      framework.debug(`Framework memberExits event occurred in test ${testName}`);
      assert(validator.isBot(bot),
        'bot in memberExits event did not include a valid bot');
      assert((bot.id === eventsData.bot.id),
        'bot returned in framework.on("memberExits") is not the one expected');
      assert((membership.id === eventsData.membership.id),
        'membership returned in framework.on("memberExits") is not the one expected');
      assert(validator.isMembership(membership),
        'membership returned in framework.on("memberExits") is not valid');
      assert((id === framework.id),
        'id returned in framework.on("memberExits") is not the one expected');
      promiseResolveFunction(true);
    });
  },

  frameworkMembershipDeletedHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    this.framework.once('membershipDeleted', (membership, id) => {
      framework.debug(`Framework membershipDeleted event occurred in test ${testName}`);
      assert(id === framework.id);
      assert(validator.isMembership(membership),
        'membership returned in framework.on("membershipDeleted") is not valid');
      eventsData.membership = membership;
      promiseResolveFunction(assert(validator.isMembership(membership),
        'membershipDeleted event did not include a valid membership'));
    });
  },

  frameworkAttachementActionEventHandler: function (testName, framework, cardSendingBot, eventsData, promiseResolveFunction) {
    this.framework.once('attachmentAction', (bot, trigger, id) => {
      framework.debug(`Framework attachmentAction event occurred in test ${testName}`);
      assert(id === framework.id);
      assert(bot.id === cardSendingBot.id,
        'bot returned in framework.on("attachmentAction") is not the same as the on that sent the card');
      assert(validator.isTrigger(trigger),
        'mentioned event did not include a valid trigger');
      assert(trigger.type === 'attachmentAction',
        'trigger returned in framework.on("attachmentAction") was not attachmentAction type!');
      eventsData.attachmentAction = trigger.attachmentAction;
      promiseResolveFunction(assert(validator.isAttachmentAction(trigger.attachmentAction),
        'attachmentAction returned in framework.on("attachmentAction") is not valid'));
    });
  },

  frameworkDespawnHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    this.framework.once('despawn', (bot, id, removedBy) => {
      framework.debug(`Framework despawn event occurred in test ${testName}`);
      assert(eventsData.bot.id === bot.id);
      eventsData.leftRoomId = bot.room.id;
      if (removedBy) {
        eventsData.removedBy = removedBy;
      }

      assert((id === framework.id),
        'id returned in framework.on("despawn") is not the one expected');
      promiseResolveFunction(assert(validator.isBot(bot),
        'despawn event did not include a valid bot'));
    });
  },

  frameworkStopHandler: function (testName, framework, promiseResolveFunction) {
    this.framework.once('stop', (id) => {
      framework.debug(`Framework stop event occurred in test ${testName}`);
      promiseResolveFunction(assert(id === framework.id));
    });
  },

  // Bot event handlers (set up when a new bot instance is created)
  createBotEventHandlers: function (activeBot) {
    activeBot.mentionedHandler = function (testName, eventsData, promiseResolveFunction) {
      activeBot.once('mentioned', (bot, trigger, id) => {
        this.framework.debug(`Bot mentioned event occurred in test ${testName}`);
        assert(validator.isBot(bot),
          'mentioned event did not include a valid bot');
        assert((bot.id === activeBot.id),
          'bot returned in bot.on("mentioned") is not the one expected');
        assert(validator.isTrigger(trigger),
          'mentioned event did not include a valid trigger');
        assert((id === activeBot.id),
          'id returned in framework.on("mentioned") is not the one expected');
        promiseResolveFunction(true);
      });
    },

    activeBot.messageHandler = function (testName, eventsData, promiseResolveFunction) {
      activeBot.once('message', (bot, trigger, id) => {
        this.framework.debug(`Bot message event occurred in test ${testName}`);
        assert(validator.isBot(bot),
          'message event did not include a valid bot');
        assert((bot.id === activeBot.id),
          'bot returned in bot.on("message") is not the one expected');
        assert(validator.isTrigger(trigger),
          'message event did not include a valid trigger');
        assert((id === activeBot.id),
          'id returned in framework.on("message") is not the one expected');
        promiseResolveFunction(true);
      });
    };

    activeBot.filesHandler = function (testName, eventsData, promiseResolveFunction) {
      activeBot.once('files', (bot, trigger, id) => {
        this.framework.debug(`Bot files event occurred in test ${testName}`);
        assert(validator.isBot(bot),
          'files event did not include a valid bot');
        assert((bot.id === activeBot.id),
          'bot returned in bot.on("files") is not the one expected');
        assert(validator.isTrigger(trigger),
          'files event did not include a valid trigger');
        assert((id === activeBot.id),
          'id returned in framework.on("files") is not the one expected');
        promiseResolveFunction(true);
      });
    };

    activeBot.memberEntersHandler = function (testName, eventsData, promiseResolveFunction) {
      activeBot.once('memberEnters', (bot, membership) => {
        this.framework.debug(`Bot memberEnters event occurred in test ${testName}`);
        assert(validator.isBot(bot),
          'bot memberEnters event did not include a valid bot');
        assert((bot.id === activeBot.id),
          'bot returned in bot.on("memberEnters") is not the one expected');
        assert((membership.id === eventsData.membership.id),
          'membership returned in framework.on("memberEnters") is not the one expected');
        assert(validator.isMembership(membership),
          'membership returned in framework.on("memberEnters") is not valid');
        promiseResolveFunction(true);
      });
    };

    activeBot.memberAddedAsModerator = function (testName, eventsData, promiseResolveFunction) {
      activeBot.once('memberAddedAsModerator', (bot, membership) => {
        this.framework.debug(`Bot memberAddedAsModerator event occurred in test ${testName}`);
        assert(validator.isBot(bot),
          'bot memberAddedAsModerator event did not include a valid bot');
        assert((bot.id === activeBot.id),
          'bot returned in bot.on("memberAddedAsModerator") is not the one expected');
        assert((membership.id === eventsData.membership.id),
          'membership returned in framework.on("memberAddedAsModerator") is not the one expected');
        assert(validator.isMembership(membership),
          'membership returned in framework.on("memberAddedAsModerator") is not valid');
        promiseResolveFunction(true);
      });
    };

    activeBot.memberExitsHandler = function (testName, eventsData, promiseResolveFunction) {
      activeBot.once('memberExits', (bot, membership) => {
        this.framework.debug(`Bot memberExits event occurred in test ${testName}`);
        assert(validator.isBot(bot),
          'bot memberExits event did not include a valid bot');
        assert((bot.id === activeBot.id),
          'bot returned in bot.on("memberExits") is not the one expected');
        assert((membership.id === eventsData.membership.id),
          'membership returned in framework.on("memberExits") is not the one expected');
        assert(validator.isMembership(membership),
          'membership returned in framework.on("memberExits") is not valid');
        promiseResolveFunction(true);
      });
    };

    activeBot.stopHandler = function (testName, promiseResolveFunction) {
      activeBot.once('stop', (bot) => {
        this.framework.debug(`Bot stop event occurred in test ${testName}`);
        assert(validator.isBot(bot),
          'bot event did not include a valid bot');
        assert((bot.id === activeBot.id),
          'bot returned in bot.on("stop") is not the one expected');
        promiseResolveFunction(true);
      });
    };
  },

  // Additional framework events to-do
  // attachmentAction
  // files (and for bot)

  // Common variables
  // framework: this.framework,
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
function cleanupFromPreviousTests(framework, user) {
  botForUser1on1Space = null;
  for (let bot of framework.bots) {
    assert(validator.isBot(bot),
      'bot in framework.bots did not validate preoprly!');
    if ((bot.room.title === User_Test_Space_Title) ||
      (bot.room.title === Bot_Test_Space_Title)) {
      framework.debug('Removing room left over from previous test...');
      framework.webex.rooms.remove(bot.room);
    } else if (bot.room.type == 'direct') {
      if (bot.isDirectTo == user.emails[0]) {
        framework.debug(`Found existing direct space with ${bot.room.title}.  Will run direct message tests.`);
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
          framework.debug('As user, removing room left over from previous test...');
          userWebex.rooms.remove(room);
        }
      }
    });
}




