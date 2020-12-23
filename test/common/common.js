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
  setDisallowedUser: function (d) {
    this.disallowedUserSDK = d;
  },
  setDisallowedUserPerson: function (p) {
    this.disallowedUserPerson = p;
  },
  getDisallowedUser: function () {
    return (this.disallowedUserSDK);
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
        if (framework.getWebexSDK().config.defaultMercuryOptions) {
          return Promise.reject(new Error(`Framework initialized but has a proxy config when none was set!`));
        }
        assert(validator.isFramework(framework),
          'Framework did not initialize succesfully');
        framework.debug(`${framework.email} is in ${framework.bots.length} at the start of the tests.`);
        if (process.env.CLEANUP_USER_ROOMS) {
          asUserCleanupFromPreviousTests(userWebex);
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

  userSendsMessageAndBotMayRespond: function (testData, framework, user, bot, eventsData) {
    it(`user says ${testData.msg}`, () => {
      let testName = `user says ${testData.msg}`;
      let hearsInfo = {
        phrase: testData.msgText
      };
      return common.userSendMessage(testName, framework, user, bot,
        eventsData, hearsInfo, testData.msgText)
        .then((m) => {
          hearsFunction = hearsInfo.functionId;
          message = m;
        });
    });
  },

  addBotToSpace: function (testName, framework, userCreatedTestRoom, eventsData, shouldFail, userSDK) {
    let spawnEvents = [];
    // Wait for the events associated with a new membership before completing test..
    if (shouldFail) {
      spawnEvents = this.registerMembershipEventsForDectivatedBot(testName, framework, '', eventsData);
    } else {
      spawnEvents.push(new Promise((resolve) => {
        this.frameworkMembershipCreatedHandler(testName, framework, eventsData, resolve);
      }));
      spawnEvents.push(new Promise((resolve) => {
        this.frameworkSpawnedHandler(testName, framework, eventsData, resolve);
      }));
    }

    let theUser = this.userWebex;
    if (userSDK) {
      theUser = userSDK;
    }

    // Add the bot to our user created space
    return theUser.memberships.create({
      roomId: userCreatedTestRoom.id,
      personId: framework.person.id
    })
      .then((m) => {
        membership = m;
        return assert(validator.isMembership(membership),
          'create memebership did not return a valid membership');
      })
      // Wait for framework's membershipCreated event
      .then(() => when.all(spawnEvents)
        .then(() => {
          assert((eventsData.membership.id === membership.id),
            'Membership from framework event does not match the one returned by API');
          userCreatedRoomBot = eventsData.bot;
          this.createBotEventHandlers(userCreatedRoomBot);
          if (!shouldFail) {
            assert(framework.getBotByRoomId(userCreatedRoomBot.room.id),
              'After spawn new bot is not in framework\'s bot array');
          }
          return userCreatedRoomBot;
        })
        .catch((e) => {
          console.error(`Bot spawn test failed: ${e.message}`);
          return Promise.reject(e);
        }));
  },

  botAddUsersToSpace: function (testName, framework, bot, userEmails, eventsData) {
    eventsData.disallowedUserEmail = [];
    let guideAdded = false;
    if (framework.options.restrictedToEmailDomains) {
      for (let i = 0; i < userEmails.length; i++) {
        if (this.isDisallowedEmailDomain(userEmails[i], framework.options.restrictedToEmailDomains)) {
          eventsData.disallowedUserEmail.push(userEmails[i]);
        }
      }
    }
    if (framework.options.guideEmails) {
      let guides = userEmails.filter(e => {
        return (-1 != framework.guideEmails.indexOf(_.toLower(e)));
      });
      if (guides.length) {
        guideAdded = true;
      }        
    }

    let eventPromises = [];
    if ((bot.active) && (!eventsData.disallowedUserEmail.length)) {
      eventPromises = this.registerMembershipHandlers(testName, framework, bot, eventsData);
    } else if ((!bot.active) && (guideAdded)) {
      eventPromises = this.registerMembershipEventsForGuideAdded(testName, framework, eventsData.disallowedUserEmail, eventsData);
    } else {
      eventPromises = this.registerMembershipEventsForDectivatedBot(testName, framework, eventsData.disallowedUserEmail, eventsData);
    }

    // Add the users to the space with the bot
    return bot.add(userEmails)
      .then((emails) => {
        // Todo update this to check each email
        assert((emails.length === userEmails.length),
          `bot.add did not add all the requested users in test "${testName}`);
        // Wait for all the event handlers to fire
        return when.all(eventPromises);
      })
      .catch((e) => {
        console.error(`"${testName}" failed: ${e.message}`);
        return Promise.reject(e);
      });
  },

  isDisallowedEmailDomain(email, allowedDomainList) {
    let domain = _.split(_.toLower(email), '@', 2)[1];
    if ((domain === 'webex.bot') || (domain === 'sparkbot.io')) {
      return false;  // ignore bots
    }
    if (-1 === allowedDomainList.indexOf(domain)) {
      return true;
    } else {
      return false;
    }
  },

  botRemoveUserFromSpace: function (testName, framework, bot, userEmail, eventsData,
    numDisallowedUsersInSpace, isDisallowedUser) {
    let eventPromises = [];
    let guideRemoved = false;
    if ((framework.options.guideEmails) &&
        (-1 != framework.guideEmails.indexOf(_.toLower(userEmail)))) {
      guideRemoved = true;
    }


    if (!bot.active) {
      assert(numDisallowedUsersInSpace, 
        `botRemoveUserFromSpace() error: ${testName} set numDisallowedUsersInSpace to ${numDisallowedUsersInSpace}`);
      eventPromises = this.registerMembershipDeletedEventsWhenDisallowedUserExits(testName, framework, eventsData, numDisallowedUsersInSpace);
    } else if (guideRemoved) {
      // A currently uncovered test case is removing one guide when another is still present
      eventPromises = this.registerGuideRemovedFromSpaceEvents(testName, framework, eventsData, numDisallowedUsersInSpace);
    } else {
      eventPromises = this.registerMembershipDeletedHandlers(testName, framework, bot, eventsData);
    }

    // Add the users to the space with the bot
    return bot.remove(userEmail)
      .then((emails) => {
        // Todo update this to check each email
        assert((emails[0] === userEmail),
          `bot.remove did not remove the requested users in test "${testName}`);
        if (isDisallowedUser) {
          eventsData.disallowedUserEmail = this.disallowedUserPerson.emails[0];
        }
        // Wait for all the event handlers to fire
        return when.all(eventPromises);
      })
      .catch((e) => {
        console.error(`"${testName}" failed: ${e.message}`);
        return Promise.reject(e);
      });
  },

  registerMembershipHandlers: function (testName, framework, bot, eventsData) {
    let eventPromises = [];
    // These events should occur with a new membership
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipCreatedHandler(testName, framework, eventsData, resolve);
    }));
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMemberEntersHandler(testName, framework, eventsData, resolve);
    }));
    eventPromises.push(new Promise((resolve) => {
      bot.memberEntersHandler(testName, eventsData, resolve);
    }));

    return (eventPromises);
  },

  registerMembershipEventsForGuideAdded: function (testName, framework, disallowedEmails, eventsData) {
    let eventPromises = [];
    let swallowedEvents;
    // These events should occur with a new membership that adds a guide to a previously unguided space
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipCreatedHandler(testName, framework, eventsData, resolve);
    }));
    eventPromises.push(new Promise((resolve) => {
      this.frameworkSpawnedHandler(testName, framework, eventsData, resolve);
    }));

    swallowedEvents = ['spawn']; 

    // TODO figure out what membershipRulesActions will be generated
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipRulesEventHandler(testName, framework,
        swallowedEvents, eventsData,
        false, /* don't error on unexpected swallowed events */
        resolve);
    }));

    return (eventPromises);
  },

  registerMembershipEventsForDectivatedBot: function (testName, framework, disallowedEmails, eventsData) {
    let eventPromises = [];
    let swallowedEvents;
    // These events should occur with a new membership that violates a memebership rule
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipCreatedHandler(testName, framework, eventsData, resolve);
    }));
    if (disallowedEmails) {
      // Since this user is disallowed we will get a message telling us the bot is deactivating
      eventPromises.push(new Promise((resolve) => {
        this.frameworkMessageCreatedEventHandler(testName, framework, eventsData, resolve);
      }));
      // It will also generate a despawn event with the membership of the dissallowed user
      eventPromises.push(new Promise((resolve) => {
        this.frameworkDespawnHandler(testName, framework, eventsData, resolve);
      }));
      // Finally, we will get some membership-rules events, 
      // and one "swallowed" memberEnters for each dissallowed user
      swallowedEvents = ['despawn']; 
    } else {
      // If now disallowed user we are adding a bot to a disallowed space
      // We will swallow a spawn event
      swallowedEvents = ['spawn']; 
    }
    if (disallowedEmails.length){
      for (let i=0; i<disallowedEmails.length; i++) {
        swallowedEvents.push('memberEnters');
      }
    }

    // and a message about the "disallowed" despawning
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipRulesEventHandler(testName, framework,
        swallowedEvents, eventsData,
        false, /* don't error on unexpected swallowed events */
        resolve);
    }));

    return (eventPromises);
  },

  registerMembershipHandlers: function (testName, framework, bot, eventsData) {
    let eventPromises = [];
    // These events should occur with a new membership
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipCreatedHandler(testName, framework, eventsData, resolve);
    }));
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMemberEntersHandler(testName, framework, eventsData, resolve);
    }));
    eventPromises.push(new Promise((resolve) => {
      bot.memberEntersHandler(testName, eventsData, resolve);
    }));

    return (eventPromises);
  },

  registerMembershipDeletedHandlers: function (testName, framework, bot, eventsData) {
    let eventPromises = [];
    // Framework always gets the membership change event
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipDeletedHandler(testName, framework, eventsData, resolve);
    }));
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMemberExitsHandler(testName, framework, eventsData, resolve);
    }));
    eventPromises.push(new Promise((resolve) => {
      bot.memberExitsHandler(testName, eventsData, resolve);
    }));

    return (eventPromises);
  },

  registerGuideRemovedFromSpaceEvents: function (testName, framework, eventsData, numDisallowedUsersInSpace) {
    let eventPromises = [];
    // Framework always gets the membership change event
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipDeletedHandler(testName, framework, eventsData, resolve);
    }));
    // TODO check if other guides are in the space, we assume we'll be disallowed at this point
    eventPromises.push(new Promise((resolve) => {
      this.frameworkDespawnHandler(testName, framework, eventsData, resolve);
    }));
    // Finally, we will get some membership-rules events, a "swallowed" memberExits
    // and a message about the re-spawning
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipRulesEventHandler(testName, framework,
        ['despawn'], eventsData, true, resolve);
    }));
    return (eventPromises);
  },

  registerMembershipDeletedEventsWhenDisallowedUserExits: function (testName, framework, eventsData, numDisallowedUsersInSpace) {
    let eventPromises = [];
    // Framework always gets the membership change event
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipDeletedHandler(testName, framework, eventsData, resolve);
    }));
    if (numDisallowedUsersInSpace === 1) { 
      // Last disallowed member leaving will "re-spawn" the bot
      eventPromises.push(new Promise((resolve) => {
        this.frameworkSpawnedHandler(testName, framework, eventsData, resolve);
      }));
      // Finally, we will get some membership-rules events, a "swallowed" memberExits
      // and a message about the re-spawning
      eventPromises.push(new Promise((resolve) => {
        this.frameworkMembershipRulesEventHandler(testName, framework,
          ['spawn', 'memberExits'], eventsData, true, resolve);
      }));
    } else {
      // If not last disallowed user there is no membership-rules spawn event
      eventPromises.push(new Promise((resolve) => {
        this.frameworkMembershipRulesEventHandler(testName, framework,
          ['memberExits'], eventsData, true, resolve);
      }));
    }

    return (eventPromises);
  },
  
  botLeaveRoom: function (testName, framework, bot, roomToLeave, eventsData) {
    let leaveRoomEvents = [];
    leaveRoomEvents.push(new Promise((resolve) => {
      this.frameworkMembershipDeletedHandler(testName, framework, eventsData, resolve);
    }));
    if (bot.active) {
      leaveRoomEvents.push(new Promise((resolve) => {
        bot.stopHandler(testName, resolve);
      }));
      leaveRoomEvents.push(new Promise((resolve) => {
        this.frameworkDespawnHandler(testName, framework, eventsData, resolve);
      }));
    } else {
      // There is no 'stop' event because the bot is not in the 'started' state
      swallowedEventsArray = ['despawn'];
      leaveRoomEvents.push(new Promise((resolve) => {
        this.frameworkMembershipRulesEventHandler(testName, framework,
          swallowedEventsArray, eventsData, 
          true, 
          resolve);
      }));
    }

    return bot.exit()
      .then(() => when.all(leaveRoomEvents)
        .catch((e) => {
          console.error(`Bot failed to exit room: ${e.message}`);
        }));
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
        assert(framework.getBotByRoomId(botCreatedRoomBot.room.id),
          'After spawn new bot is not in framework\'s bot array');
        return when(botCreatedRoomBot);
      })
      .catch((e) => {
        console.error(`Bot newRoom() test failed: ${e.message}`);
        return Promise.reject(e);
      });
  },

  userSendMessage: function (testName, framework, userWebex, bot, eventsData, hearsInfo, markdown, files) {
    // We mention the bot whe the test is running as a bot account
    // Only register for mention events, if we are mentioning the bot
    let isMention = false;
    if (framework.isBotAccount) {
      markdown = `<@personId:${bot.person.id}> ${markdown}`;
      isMention = true;
    }

    // As the user, send the message, mentioning the bot
    msgObj = {
      roomId: bot.room.id,
      markdown: markdown
    };
    if (files) {msgObj.files = files;}

    // Set up handlers for the message events
    let eventPromises = [];
    if (bot.active) {
      eventPromises = this.registerMessageHandlers(testName, isMention, framework, bot, msgObj, eventsData);
    } else {
      eventPromises = this.getInActiveBotEventArray(testName, isMention, framework, msgObj, eventsData);
    }

    // Register the framework.hears handler for this message.  We want this 
    // ven in the case of dissalowed bots so we can capture the "swallowed-hears"
    let calledHearsPromise = new Promise((resolve) => {
      hearsInfo.functionId = framework.hears(hearsInfo.phrase, (b, t) => {
        assert((b.id === bot.id),
          'bot returned in fint.hears("hi") is not the one expected');
        assert(validator.objIsEqual(t, eventsData.trigger),
          'trigger returned in framework.hears("hi") was not as expected');
        framework.debug('Bot heard message "hi" that user posted');
        resolve(true);
      }), hearsInfo.helpString, hearsInfo.priority;
    });
    if (bot.active) {
      // Wait for it to be called if our bot is active
      eventPromises.push(calledHearsPromise);
    }

    // kick it off with a message
    return userWebex.messages.create(msgObj)
      .then((m) => {
        message = m;
        assert(validator.isMessage(message),
          `Test:${testName} create message did not return a valid message`);
        // Wait for all the event handlers and the heard handler to fire
        return when.all(eventPromises);
      })
      .then(() => when(message))
      .catch((e) => {
        console.error(`${testName} failed: ${e.message}`);
        return Promise.reject(e);
      });
  },

  botRespondsToTrigger: function (testName, framework, bot, eventsData, shouldBeAllowed) {
    if ((shouldBeAllowed !== undefined) && (shouldBeAllowed) && (!bot.active)) {
      return new Error(`${testName} failed.  Expected bot to be in disallowed state but it wasn't.`);
    }
    if (!eventsData.trigger) {
      if (bot.active) {
        // This can occur if the previous tests failed
        return new Error(`${testName} didn\'t run.  No trigger to respond to`);
      } else {
        framework.debug(`${testName}: no trigger to respond to...expected when bot is in disabled state.`);
        return when(true);
      }
    }
    // Builds the response based on the trigger
    let trigger = eventsData.trigger;
    botReply = `I heard the entry from ${trigger.person.displayName}:\n`;
    botReply += (trigger.message.text) ? `* text: ${trigger.message.text}\n` : '';
    botReply += (trigger.message.html) ? `* html: ${trigger.message.html}\n` : '';
    framework.debug(botReply);

    // Wait for the events associated with a new message before completing test..
    messageCreatedEvent = new Promise((resolve) => {
      this.frameworkMessageCreatedEventHandler(testName, framework, eventsData, resolve);
    });

    return bot.say(botReply)
      .then((m) => {
        message = m;
        assert(validator.isMessage(message),
          `${testName}: create message did not return a valid message`);
        return when.all([messageCreatedEvent]);
      })
      .then(() => {
        assert(validator.objIsEqual(message, eventsData.message),
          `${testName}: message returned by API did not match the one from the messageCreated event`);
        return when(true);
      })
      .catch((e) => {
        console.error(`${testName} failed: ${e.message}`);
        return Promise.reject(e);
      });
  },

  registerMessageHandlers: function (testName, isMention, framework, bot, msg, eventsData) {
    let eventPromises = [];

    // Wait for the events associated with a new message before completing test..
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMessageCreatedEventHandler(testName, framework, eventsData, resolve);
    }));
    if (isMention) {
      eventPromises.push(new Promise((resolve) => {
        this.frameworkMentionedHandler(testName, framework, eventsData, resolve);
      }));
      eventPromises.push(new Promise((resolve) => {
        bot.mentionedHandler(testName, eventsData, resolve);
      }));
    }
    if ("files" in msg) {
      eventPromises.push(new Promise((resolve) => {
        this.frameworkFilesHandler(testName, framework, eventsData, resolve);
      }));
      eventPromises.push(new Promise((resolve) => {
        bot.filesHandler(testName, eventsData, resolve);
      }));
    }
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMessageHandler(testName, framework, eventsData, resolve);
    }));
    eventPromises.push(new Promise((resolve) => {
      bot.messageHandler(testName, eventsData, resolve);
    }));

    return eventPromises;
  },

  getInActiveBotEventArray: function (testName, isMention, framework, msgObj, eventsData) {
    let eventPromises = [];

    // Wait for the events associated with a new message before completing test..
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMessageCreatedEventHandler(testName, framework, eventsData, resolve);
    }));
    swallowedEventsArray = ['hears', 'message'];
    if (isMention) {
      swallowedEventsArray.push('mentioned');
    }
    if ("files" in msgObj) {
      swallowedEventsArray.push('files');
    }
    if (this.framework.membershipRulesStateMessageResponse) {
      // Wait for the bot to respond with the an "Ignoring input" type message
      eventsData.registerForBotResponse = true;
    }
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipRulesEventHandler(testName, framework,
        swallowedEventsArray, eventsData, 
        true, 
        resolve);
    }));

    return eventPromises;
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
        'roomCreated event did not include a valid room'));
    });
  },

  frameworkRoomUpdatedEventHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    this.framework.once('roomUpdated', (room, id) => {
      framework.debug(`Framework roomUpdated event occurred in test ${testName}`);
      eventsData.room = room;
      assert((id === framework.id),
        'id returned in framework.on("roomUpdated") is not the one expected');
      promiseResolveFunction(assert(validator.isRoom(room),
        'roomUpdated event did not include a valid room'));
    });
  },

  frameworkRoomRenamedEventHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    this.framework.once('roomRenamed', (bot, room, id) => {
      framework.debug(`Framework roomRenamed event occurred in test ${testName}`);
      eventsData.room = room;
      assert((eventsData.bot.id == bot.id),
        'bot returned in framework.on("roomRenamed") is not the one expected');
      assert((id === framework.id),
        'id returned in framework.on("roomRenamed") is not the one expected');
      promiseResolveFunction(assert(validator.isRoom(room),
        'roomRenamed event did not include a valid room'));
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
      if (eventsData.registerForBotResponse) {
        // This event occured when a user sent a message to a disallowed bot
        // Register this handler again so that we wait for the bot's automated response
        delete eventsData.registerForBotResponse;
        this.frameworkMessageCreatedEventHandler(testName, framework, eventsData, promiseResolveFunction);
      } else {
        promiseResolveFunction(assert(validator.isMessage(message),
          'memssageCreated event did not include a valid message'));
      }
    });
  },

  frameworkMessageDeletedEventHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    this.framework.once('messageDeleted', (message, id) => {
      framework.debug(`Framework messageDeleted event occurred in test ${testName}`);
      eventsData.message = message;
      promiseResolveFunction(assert((id === framework.id),
        'id returned in framework.on("messageDeleted") is not the one expected'));
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
      assert((membership.id === eventsData.membership.id),
        'membership returned in framework.on("memberEnters") is not the one expected');
      assert(validator.isMembership(membership),
        'membership returned in framework.on("memberEnters") is not valid');
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

  frameworkMembershipRulesEventHandler: function (testName, framework, expectedEvents, eventsData, failOnUnexpectedEvents, promiseResolveFunction) {
    this.framework.once('membershipRulesAction', (type, event, bot, id, ...args) => {
      framework.debug(`Framework membershipRulesAction of type ${type} occurred in test ${testName}`);
      if ((eventsData.bot) && (eventsData.bot.id))   {
        assert(id === eventsData.bot.id,
          'bot returned in framework.on("membershipRulesAction") is not the one expected');
      }
      assert((((type == 'state-change') && (event === 'spawn')) || (bot.active === false)),
        'bot returned in framework.on("membershipRulesAction") is still in the active state');
      // TODO -- could add some type and event validation
      switch (type) {
        case ('state-change'):
          framework.debug(`Membership Rules forced a "${event}" event`);
          break;
        case ('event-swallowed'):
          framework.debug(`Membership Rules swallowed a "${event}" event`);
          if (event === 'spawn') {
            // set the "swallowed bot" in eventsData so it can leave spaces
            eventsData.bot = bot;
            // Validate that the membership in the membershipRulesChange belongs to the bot
            assert((args.length >= 2), 'did not get a membershipRulesChange object ' +
              'in membershipRulesAction event handler');
            let mRC = args[1];
            assert(((typeof mRC == 'object') && 
              (typeof mRC.membership === 'object') && 
              (mRC.membership.personId === bot.person.id)),
            'membershipRulesChange.membership.personId was not the same as the bot\'s' +
              'person ID when processing a swallowed "spawn" event in the membershipRulesAction handler');
          }
          break;
        case ('hears-swallowed'):
          framework.debug(`Membership Rules swallowed a "${event}" event`);
          break;
        default:
          assert(true === false, `Got unexpected membershipsRules type: ${type}`);
          break;
      }
      var index = expectedEvents.indexOf(event);
      if (index < 0) {
        assert((false === failOnUnexpectedEvents), `membershipRulesAction handler got an unexpected ${event} swallowed`);
      } else {
        expectedEvents.splice(index, 1);
      }
      if (expectedEvents.length) {
        // Register handler for next event
        this.frameworkMembershipRulesEventHandler(testName, framework, expectedEvents, eventsData, failOnUnexpectedEvents, promiseResolveFunction);
      } else {
        promiseResolveFunction(true);
      }
    });
  },

  frameworkDespawnHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    this.framework.once('despawn', (bot, id, removedBy, membershipRuleChange) => {
      framework.debug(`Framework despawn event occurred in test ${testName}`);
      assert((eventsData.bot.id === bot.id),
        `${testName} failure processing "despawn": bot.id did not match expected`);
      eventsData.leftRoomId = bot.room.id;
      if (removedBy) {
        eventsData.removedBy = removedBy;
      }
      if ((membershipRuleChange) && (membershipRuleChange.membershipRule === "restrictedToEmailDomains")) {
        // This despawn was caused by a disallowed member add
        if (eventsData.disallowedUserEmail.length) {
          assert((-1 !== eventsData.disallowedUserEmail.indexOf(membershipRuleChange.membership.personEmail)),
            `${testName} failure processing "despawn": email of dissallowed ` +
          `member did not match any of the expected emails`);
        } else {
          assert(eventsData.disallowedUserEmail === membershipRuleChange.membership.personEmail,
            `${testName} failure processing "despawn": email of dissallowed ` +
            `member did not match expected email`);
        }
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
    };

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
      bot.getWebexSDK.rooms.remove(bot.room);
    } else if (bot.room.type == 'direct') {
      if (bot.isDirectTo == user.emails[0]) {
        framework.debug(`Found existing direct space with ${bot.room.title}.  Will run direct message tests.`);
        botForUser1on1Space = bot;
      }
    }
  }
  return botForUser1on1Space;
}

function asUserCleanupFromPreviousTests(userWebex) {
  // Todo -- handle paginated responses...
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




