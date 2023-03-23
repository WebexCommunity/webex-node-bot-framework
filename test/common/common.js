const assert = require('assert');
const when = require('when');
const validator = require('../../lib/validator');
var _ = require('lodash');
const { doesNotMatch } = require('assert');

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

  // Default value if setter is not called
  preMochaTimeout: 35000,
  setMochaTimeout: function(t) {
    // We will timeout 80% faster than Mocha
    this.preMochaTimeout = t - t/10*2;   
  },
  getDisallowedUser: function () {
    return (this.disallowedUserSDK);
  },


  // Common Tasks used by tests
  initFramework: function (testName, framework, userWebex) {
    let eventsData = this.eventsData
    eventsData.testName = testName;
    initEventsData(this.eventsData);
    console.log('In initFramework...');
    // Wait for framework to generate events that indicate it started succesfully
    const started = new Promise((resolve) => {
      this.frameworkStartHandler(testName, framework, eventsData, resolve);
    });
    const initialized = new Promise((resolve) => {
      this.frameworkInitializedHandler(testName, framework, eventsData, resolve);
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
    return waitForPromisesWithTimeout([started, initialized], this.preMochaTimeout, eventsData)
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
        return when(userInfoIsReady).catch((e) => {
          console.error(`Could not initialize user with USER_API_TOKEN: ${e.message}`);
          return Promise.reject(e);
        });    
      })
      .then((person) => {
        this.userInfo = person;
        assert(validator.isPerson(person),
          'getPerson did not return a valid person');
        this.botForUser1on1Space = cleanupFromPreviousTests(framework, this.userInfo);

        // All went well, we are ready to start running tests
        // Each test should register listeners for all framework generated events.
        // This catch-all listener will detect any events that don't have listeners
        registerUnexpectedEventsHandler(framework, eventsData);

        return when(true);
      });
  },

  stopFramework: function (testName, framework) {
    if (framework) {
      eventsData = this.eventsData;
      const stopped = new Promise((resolve) => {
        this.frameworkStopHandler(testName, framework, eventsData, resolve);
      });

      // remove the catch-all listener
      removeUnexpectedEventsHandler(framework);
      return framework.stop()
        .then(() => when(stopped))
        .catch((e) => console.error(`Failed during framework.stop(): ${e.message}`));
    }
  },

  userSendsMessageAndBotMayRespond: function (testData, framework, user, bot, eventsData) {
    initEventsData(eventsData);
    let spawnEvents = [];
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
    it(`user says ${testData.msg}`, () => {
      let testData = {
        msgText: `user says ${testData.msg}`,
        hearsInfo: [{
          phrase: testData.msgText
        }]
      };
      return common.userSendMessage(testName, framework,
        user, bot, eventsData, testData)
    });
  },

  addBotToSpace: function (framework, testInfo, shouldFail, userSDK) {
    // Configure this test to Wait for the events associated with a new membership
    initEventsData(testInfo);
    let spawnEvents = [];
    if (shouldFail) {
      spawnEvents = this.registerMembershipEventsForDectivatedBot(testInfo.config.testName, framework, '', testInfo);
    } else {
      spawnEvents.push(new Promise((resolve) => {
        this.frameworkMembershipCreatedHandler(testInfo.config.testName, framework, testInfo, resolve);
      }));
      spawnEvents.push(new Promise((resolve) => {
        this.frameworkSpawnedHandler(testInfo.config.testName, framework, testInfo, resolve);
      }));
    }

    let theUser = this.userWebex;
    if (testInfo.config.userUnderTest) {
      theUser = testInfo.config.userUnderTest;
    }

    // Add the bot to our user created space
    return theUser.memberships.create({
      roomId: testInfo.config.roomUnderTest.id,
      personId: framework.person.id
    })
      .then((m) => {
        membership = m;
        return assert(validator.isMembership(membership),
          'create memebership did not return a valid membership');
      })
      // Wait for the expected events
      .then(() => waitForPromisesWithTimeout(spawnEvents, this.preMochaTimeout, testInfo)
      .then(() => {
        userCreatedRoomBot = testInfo.bot;
        this.createBotEventHandlers(userCreatedRoomBot);
        if (!shouldFail) {
          assert(framework.getBotByRoomId(userCreatedRoomBot.room.id),
            'After spawn new bot is not in framework\'s bot array');
        }
        return userCreatedRoomBot;
      }).then((bot) => checkInterimEventsData(testInfo, bot)));
  },

  botAddUsersToSpace: function (testName, framework, bot, userEmails, eventsData) {
    initEventsData(eventsData);
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
    if (bot.active) {
      // Active bot should behave normally when a non restricted member enters
      eventPromises = this.registerMembershipHandlers(testName, framework, bot, userEmails, eventsData);
    } else if ((!bot.active) && (guideAdded)) {
      // Inactive bot should do a membership rules spawn when guide enters
      // This will fail if the space also includes restricted domain users -- not currently in tests
      eventPromises = this.registerMembershipEventsForGuideAdded(testName, framework, eventsData.disallowedUserEmail, eventsData);
    } else if (!bot.active) {
      // An inactive bot will remain inactive when non-guide users enter, memberEnters will be swallowed
      eventPromises = this.registerMembershipEventsForInactiveBot(testName, framework, eventsData.disallowedUserEmail, eventsData);
    } else {
      // This membership will trigger a membership rules "despawn"
      eventPromises = this.registerMembershipEventsForDectivatedBot(testName, framework, eventsData.disallowedUserEmail, eventsData);
    }
    // Add the users to the space with the bot
    return bot.add(userEmails)
      .then((emails) => {
        // Todo update this to check each email
        assert((emails.length === userEmails.length),
          `bot.add did not add all the requested users in test "${testName}"`);
        // Wait for all the event handlers to fire
        return waitForPromisesWithTimeout(eventPromises, this.preMochaTimeout, eventsData);
      }).then(() => {
        delete eventsData.multipleEvents;
        return checkInterimEventsData(eventsData);
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
    initEventsData(eventsData);
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
          `bot.remove did not remove the requested users in test "${testName}"`);
        if (isDisallowedUser) {
          eventsData.disallowedUserEmail = this.disallowedUserPerson.emails[0];
        }
        // Wait for all the event handlers to fire
        return waitForPromisesWithTimeout(eventPromises, this.preMochaTimeout, eventsData);
      }).then(() => checkInterimEventsData(eventsData));
  },

  registerMembershipHandlers: function (testName, framework, bot, eventsData) {
    initEventsData(eventsData);
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
    initEventsData(eventsData);
    let eventPromises = [];
    let swallowedEvents;
    // These events should occur with a new membership that adds a guide 
    // to a previously unguided space
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipCreatedHandler(testName, framework, eventsData, resolve);
    }));
    eventPromises.push(new Promise((resolve) => {
      this.frameworkSpawnedHandler(testName, framework, eventsData, resolve);
    }));

    if (framework.membershipRulesAllowedResponse) {
      // When Guides are removed from space with bot expect a 
      // message from the bot saying it won't work
        eventsData.checkMembershipRulesAllowedResponse = true;
        eventPromises.push(new Promise((resolve) => {
        this.frameworkMessageCreatedEventHandler(testName, framework, eventsData, resolve);
        }));
      }
  

    swallowedEvents = ['memberEnters']; 

    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipRulesEventHandler(testName, framework,
        swallowedEvents, eventsData,
        false, /* don't error on unexpected swallowed events */
        resolve);
    }));

    return (eventPromises);
  },

  registerMembershipEventsForInactiveBot: function (testName, framework, disallowedEmails, eventsData) {
    initEventsData(eventsData);
    let eventPromises = [];
    let swallowedEvents;
    // These events should occur when a new member will not change a bot's inactive status
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipCreatedHandler(testName, framework, eventsData, resolve);
    }));
    // the memberEnters event should be "swallowed", and the bot should not respond
    swallowedEvents = ['memberEnters']; 
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
    } else if (("guideEmails" in framework) && framework.guideEmails.length &&
              framework.membershipRulesDisallowedResponse) {
      // Bot in Guided Mode being added to a space with no guides expect a 
      // message from the bot saying it won't work and a "swallowed" spawn event
      eventsData.checkMembershipRulesDisallowedResponse = true;
      eventPromises.push(new Promise((resolve) => {
        this.frameworkMessageCreatedEventHandler(testName, framework, eventsData, resolve);
      }));
      swallowedEvents = ['spawn']; 
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

  registerMembershipHandlers: function (testName, framework, bot, userEmails, eventsData) {
    let eventPromises = [];
    let swallowedEvents = [];
    let disallowedMemberAdded = false;
    eventsData.multipleEvents = {};
    userEmails.forEach((userEmail) => {
      // MembershipCreated events occur for all scenarios
      if (!eventsData.multipleEvents?.membershipCreated) {
        eventPromises.push(new Promise((resolve) => {
          this.frameworkMembershipCreatedHandler(testName, framework, eventsData, resolve);
        }));
        eventsData.multipleEvents.membershipCreated = 1;
      } else {
        eventsData.multipleEvents.membershipCreated += 1;
      }

      if ((!disallowedMemberAdded) && (!eventsData.disallowedUserEmail.includes(userEmail))) {
        // These events should occur with a regular new membership to an active room
        if (!eventsData.multipleEvents?.memberEnters) {
          eventPromises.push(new Promise((resolve) => {
            this.frameworkMemberEntersHandler(testName, framework, eventsData, resolve);
          }));
          eventPromises.push(new Promise((resolve) => {
            bot.memberEntersHandler(testName, eventsData, resolve);
          }));
          eventsData.multipleEvents.memberEnters = 1;
          eventsData.multipleEvents.botMemberEnters = 1;
        } else {
          eventsData.multipleEvents.memberEnters += 1;
          eventsData.multipleEvents.botMemberEnters += 1;
        }
      } else if ((!disallowedMemberAdded) && (eventsData.disallowedUserEmail.includes(userEmail))) {
        // These events occur when a disallowed user is added to an enabled bot
        // It will also generate a despawn event with the membership of the dissallowed user
        eventPromises.push(new Promise((resolve) => {
          this.frameworkDespawnHandler(testName, framework, eventsData, resolve);
        }));
        if (framework.membershipRulesStateMessageResponse) {
          eventPromises.push(new Promise((resolve) => {
            this.frameworkMessageCreatedEventHandler(testName, framework, eventsData, resolve);
          }));            
        }
        // Finally, we will get some membership-rules events, 
        swallowedEvents.push('memberEnters');
        swallowedEvents.push('despawn')
        disallowedMemberAdded = true;
      } else {
        // These events occur when a user is added to a disabled bot
        swallowedEvents.push('memberEnters'); 
      }
    });
    // If we are generating any swallowed memberships rules events wait for them
    if (swallowedEvents.length) {
      eventPromises.push(new Promise((resolve) => {
        this.frameworkMembershipRulesEventHandler(testName, framework,
          swallowedEvents, eventsData,
          false, /* don't error on unexpected swallowed events */
          resolve);
      }));

    }
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
    if (bot != null) {
      eventPromises.push(new Promise((resolve) => {
        bot.memberExitsHandler(testName, eventsData, resolve);
      }));
    }

    return (eventPromises);
  },

  registerGuideRemovedFromSpaceEvents: function (testName, framework, eventsData, numDisallowedUsersInSpace) {
    let eventPromises = [];
    let swallowedEvents;
    // Framework always gets the membership change event
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipDeletedHandler(testName, framework, eventsData, resolve);
    }));

    // TODO check if other guides are in the space, we assume we'll be disallowed at this point
    eventPromises.push(new Promise((resolve) => {
      this.frameworkDespawnHandler(testName, framework, eventsData, resolve);
    }));

    if (framework.membershipRulesDisallowedResponse) {
    // When Guides are removed from space with bot expect a 
    // message from the bot saying it won't work
      eventsData.checkMembershipRulesDisallowedResponse = true;
      eventPromises.push(new Promise((resolve) => {
      this.frameworkMessageCreatedEventHandler(testName, framework, eventsData, resolve);
      }));
    }
    // Finally, we will get some membership-rules events, a "swallowed" memberExits
    // and a message about the re-spawning
    swallowedEvents = ['despawn']
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipRulesEventHandler(testName, framework,
        swallowedEvents, eventsData, true, resolve);
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
      // If configured to get a "now active" message, wait for messageCreated event
      if (framework.membershipRulesAllowedResponse) {
        eventPromises.push(new Promise((resolve) => {
          this.frameworkMessageCreatedEventHandler(testName, framework, eventsData, resolve);
        }));
        eventsData.checkMembershipRulesAllowedResponse = true;    
      }
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
  
  botLeaveRoom: function (testName, framework, bot, eventsData) {
    initEventsData(eventsData);
    let leaveRoomEvents = [];
    leaveRoomEvents.push(new Promise((resolve) => {
      this.frameworkMembershipDeletedHandler(testName, framework, eventsData, resolve);
    }));
    if (bot.active) {
      leaveRoomEvents.push(new Promise((resolve) => {
        bot.stopHandler(testName, eventsData, resolve);
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
      .then(() => waitForPromisesWithTimeout(leaveRoomEvents, this.preMochaTimeout, eventsData)
        .then(() => checkInterimEventsData(eventsData)));
  },

  botCreateRoom: function (testName, framework, bot, eventsData, members) {
    initEventsData(eventsData);
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
        return waitForPromisesWithTimeout([roomCreated], this.preMochaTimeout, eventsData)
      })
      // Wait for framework's membershipCreated event
      .then(() => {
        assert((eventsData.room.id == botCreatedRoomBot.room.id),
          'Room from framework roomCreated event does not match ' +
          'the one in the bot returned by newRoom()');
        return waitForPromisesWithTimeout([membershipCreatedEvent], this.preMochaTimeout, eventsData)
      })
      .then(() => {
        assert((eventsData.membership.id === botCreatedRoomBot.membership.id),
          'Membership from framework membershipCreated event does not match ' +
          'the one in the bot returned by newRoom()');
        return waitForPromisesWithTimeout([spawned], this.preMochaTimeout, eventsData);
      })
      // Wait for framework's spawned event
      .then(() => {
        assert((eventsData.bot.id == botCreatedRoomBot.id),
          'Bot from framework spawned event does not match the one returned by newRoom()');
        assert(framework.getBotByRoomId(botCreatedRoomBot.room.id),
          'After spawn new bot is not in framework\'s bot array');
        return when(botCreatedRoomBot);
      })
      .then((bot) => checkInterimEventsData(eventsData, bot));
  },

  userSendMessage: function (testName, framework, userWebex, bot, eventsData, testData) {
    initEventsData(eventsData);
    // We mention the bot when the test is running as a bot account
    // Only register for mention events, if we are mentioning the bot
    let isMention = false;
    let markdown = testData.msgText
    if (framework.isBotAccount) {
      // Add a bot mention at the beginning of the message or position indicated
      if ('mentionIndex' in testData) {
        let words = markdown.split(" ");
        words.splice(testData.mentionIndex, 0, `<@personId:${bot.person.id}>`);
        markdown = words.join(" ");
      } else {
        markdown = `<@personId:${bot.person.id}> ${markdown}`;
      }
      isMention = true;
    }

    // As the user, send the message, mentioning the bot
    msgObj = {
      roomId: bot.room.id,
      markdown: markdown
    };
    if ('files' in testData) {msgObj.files = testData.files;}

    // Set up handlers for the message events
    let eventPromises = [];
    if (bot.active) {
      eventPromises = this.registerMessageHandlers(testName, isMention, framework, bot, msgObj, eventsData);
    } else {
      eventPromises = this.getInactiveBotEventArray(testName, isMention, framework, msgObj, eventsData, testData.hearsInfo);
    }

    // Register the specified framework.hears handlers for the message 
    testData.hearsInfo.forEach((info) => {
      let calledHearsPromise = new Promise((resolve) => {
        info.functionId = framework.hears(info.phrase, (b, t) => {
          eventsData.out.got.push(`hears(${info.phrase})`);
          framework.debug(`Bot heard message "${t.message.text}" that user posted`);
          assert((b.id === bot.id),
            `bot returned in framework.hears(${info.phrase}) is not the one expected`);
          assert(validator.objIsEqual(t, eventsData.trigger),
            `trigger returned in framework.hears(${info.phrase}) was not as expected`);
          assert(validator.objIsEqual(t.message, eventsData.message),
          `trigger.message returned in framework.hears(${info.phrase}) was not as expected\n
            got: "${t.message.text}", expected: ${eventsData.message.text}`);
          if (("command" in info) && ("prompt" in info)) {
            assert(t.command == info.command,
              `trigger.command returned in framework.hears(${info.phrase}) was not as expected`);
            assert(t.prompt == info.prompt,
              `trigger.prompt returned in framework.hears(${info.phrase}) was not as expected`);
          }
          resolve(true);
        }, info.helpString, info.priority);
      });
      if (bot.active) {
        // Only wait for it to be called if our bot is active (not disabled by membership rules)
        eventsData.in.expected.push(`hears(${info.phrase})`);
        framework.debug(`Adding framework.hears(${info.phrase}) for test "${testName}"`)
        eventPromises.push(calledHearsPromise);
      }
    });


    // kick it all off with a message
    return userWebex.messages.create(msgObj)
      .then((m) => {
        message = m;
        assert(validator.isMessage(message),
          `Test:${testName} create message did not return a valid message`);
        // Wait for all the event handlers and the heard handler to fire
        return waitForPromisesWithTimeout(eventPromises, this.preMochaTimeout, eventsData);
      })
      .then(() => checkInterimEventsData(eventsData))
  },

  botRespondsToTrigger: function (testName, framework, bot, eventsData, shouldBeAllowed) {
    initEventsData(eventsData);
    let botResponse = '';
    if (shouldBeAllowed == undefined) {
      shouldBeAllowed = true;
    }
    if (!eventsData.trigger) {
      if (bot.active) {
        // This can occur if the previous tests failed
        return when.reject(new Error(`${testName} didn\'t run.  No trigger to respond to`));
      } else {
        // No trigger with a deactivated bot is normal.
        botResponse = 'Membership Rules should have prevented this message from being sent!'
      }
    } else {
      // Builds the response based on the trigger
      let trigger = eventsData.trigger;
      botResponse = `I heard the entry from ${trigger.person.displayName}:\n`;
      botResponse += (trigger.message.text) ? `* text: ${trigger.message.text}\n` : '';
      botResponse += (trigger.message.html) ? `* html: ${trigger.message.html}\n` : '';
    }
    framework.debug(botResponse);

    if (bot.active) {
      messageCreatedEvent = new Promise((resolve) => {
        this.frameworkMessageCreatedEventHandler(testName, framework, eventsData, resolve);
      });
    }

    return bot.say(botResponse)
      .then((m) => {
        message = m;
        assert(validator.isMessage(message),
          `${testName}: create message did not return a valid message`);
        return waitForPromisesWithTimeout([messageCreatedEvent], this.preMochaTimeout, eventsData);
      })
      .then(() => {
        if (!shouldBeAllowed) {
          let msg = `${testName} failed: bot.say() was successful but should have failed.`
          console.error(msg);
          return when.reject(new Error(msg));
        }
        return checkInterimEventsData(eventsData);
      }).catch((e) => {
        if (!shouldBeAllowed) {
          // bot.say correctly failed due to membership rules
          return when.resolve(true)
        }
        console.error(`${testName} failed: ${e.message}`);
        return when.reject(new Error(e));
      });
  },

  botDeletesRoom: function(testName, framework, botCreatedRoomBot, eventsData, numOtherUsers) {
    initEventsData(eventsData);
    let implodeEvents = [];
    implodeEvents.push(new Promise((resolve) => {
      this.frameworkMembershipDeletedHandler(testName, framework, eventsData, resolve);
    }));
    if (numOtherUsers) {
      // wait for membershipDeleted from the bot and all other users
      eventsData.multipleEvents = {};
      eventsData.multipleEvents.membershipDeleted = 1 + numOtherUsers;
    }
    if (botCreatedRoomBot.active) {
      implodeEvents.push(new Promise((resolve) => {
        botCreatedRoomBot.stopHandler(testName, eventsData, resolve);
      }));
      implodeEvents.push(new Promise((resolve) => {
        this.frameworkDespawnHandler(testName, framework, eventsData, resolve);
      }));
    } else {
      // Our real despawn event will be "swallowed" if membership rules already did it
      implodeEvents.push(new Promise((resolve) => {
        this.frameworkMembershipRulesEventHandler(eventsData.testName, 
          framework, ['despawn'], eventsData, false, resolve);
      }));
    }
  
    return botCreatedRoomBot.implode()
      .then(() => waitForPromisesWithTimeout(implodeEvents, this.preMochaTimeout, eventsData)
      .then(() => {
        delete eventsData.multipleEvents;
        return checkInterimEventsData(eventsData);
      }));
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

  getInactiveBotEventArray: function (testName, isMention, framework, msgObj, eventsData, hearsInfo) {
    let eventPromises = [];
    let swallowedEventsArray = []

    // Wait for the events associated with a new message before completing test..
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMessageCreatedEventHandler(testName, framework, eventsData, resolve);
    }));
    swallowedEventsArray = ['message'];
    hearsInfo.forEach(() => {
      swallowedEventsArray.push('hears')
    });
    if (isMention) {
      swallowedEventsArray.push('mentioned');
    }
    if ("files" in msgObj) {
      swallowedEventsArray.push('files');
    }
    if (this.framework.membershipRulesStateMessageResponse) {
      // Wait for the bot to respond with the an "Ignoring input" type message
      eventsData.msgSentToDisabledBot = true;
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

  frameworkStartHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    eventsData.in.expected.push('start');
    this.framework.once('start', (id) => {
      eventsData.out.got.push('start');
      framework.debug(`Framework start event occurred in test ${testName}`);
      promiseResolveFunction(assert(id === framework.id));
    });
  },

  frameworkInitializedHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    eventsData.in.expected.push('initialized');
    this.framework.once('initialized', (id) => {
      eventsData.out.got.push('initialized');
      framework.debug(`Framework initiatlized event occurred in test:${testName}`);
      promiseResolveFunction(assert(id === framework.id));
    });
  },

  frameworkSpawnedHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    eventsData.in.expected.push('spawn');
    this.framework.once('spawn', (bot, frameworkId, addedBy) => {
      eventsData.out.got.push('spawn');
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
    eventsData.in.expected.push('roomCreated');
    this.framework.once('roomCreated', (room, id) => {
      eventsData.out.got.push('roomCreated');
      framework.debug(`Framework roomCreated event occurred in test ${testName}`);
      eventsData.room = room;
      assert((id === framework.id),
        'id returned in framework.on("roomCreated") is not the one expected');
      promiseResolveFunction(assert(validator.isRoom(room),
        'roomCreated event did not include a valid room'));
    });
  },

  frameworkRoomUpdatedEventHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    eventsData.in.expected.push('roomUpdated');
    this.framework.once('roomUpdated', (room, id) => {
      eventsData.out.got.push('roomUpdated');
      framework.debug(`Framework roomUpdated event occurred in test ${testName}`);
      eventsData.room = room;
      assert((id === framework.id),
        'id returned in framework.on("roomUpdated") is not the one expected');
      promiseResolveFunction(assert(validator.isRoom(room),
        'roomUpdated event did not include a valid room'));
    });
  },

  frameworkRoomRenamedEventHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    eventsData.in.expected.push('roomRenamed');
    this.framework.once('roomRenamed', (bot, room, id) => {
      eventsData.out.got.push('roomRenamed');
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
    eventsData.in.expected.push('membershipCreated');
    this.framework.once('membershipCreated', (membership, id) => {
      eventsData.out.got.push('membershipCreated');
      framework.debug(`Framework membershipCreated event occurred in test ${testName}`);
      eventsData.membership = membership;
      assert(validator.isMembership(membership),
        'membershipCreated event did not include a valid membership');
      if (eventsData.multipleEvents?.membershipCreated) {
        if (--eventsData.multipleEvents.membershipCreated > 0) {
          // Need more events to emit before resolving promise, register another handler
          this.frameworkMembershipCreatedHandler(testName, framework, eventsData, promiseResolveFunction);
        } else {
          delete eventsData.multipleEvents.membershipCreated
          promiseResolveFunction(assert(id === framework.id));
        }    
      } else {
        promiseResolveFunction(assert(id === framework.id));
      }
    });
  },

  frameworkMembershipUpdatedHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    eventsData.in.expected.push('membershipCreated');
    this.framework.once('membershipUpdated', (membership, id) => {
      eventsData.out.got.push('membershipCreated');
      framework.debug(`Framework membershipUpdated event occurred in test ${testName}`);
      eventsData.membership = membership;
      assert(validator.isMembership(membership),
        'membershipUpdated event did not include a valid membership');
      promiseResolveFunction(assert(id === framework.id));
    });
  },

  frameworkMessageCreatedEventHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    eventsData.in.expected.push('messageCreated');
    this.framework.once('messageCreated', (message, id) => {
      eventsData.out.got.push('messageCreated');
      framework.debug(`Framework messageCreated event occurred in test ${testName}`);
      eventsData.message = message;
      assert((id === framework.id),
        'id returned in framework.on("messageCreated") is not the one expected');
      if (eventsData.msgSentToDisabledBot) {
        // This event occured when a user sent a message to a disallowed bot
        // Register this handler again so that we wait for the bot's automated response
        delete eventsData.msgSentToDisabledBot;
        this.frameworkMessageCreatedEventHandler(testName, framework, eventsData, promiseResolveFunction);
        // It's possible for the response to come back before the original message
        if (message.markdown != framework.membershipRulesStateMessageResponse) {
          // If this isn't the disabled message from the bot check it on the next event
          eventsData.checkMembershipRulesStateMessageResponse = true;
        }
        return
      } else if (eventsData.checkMembershipRulesDisallowedResponse) {
        delete eventsData.checkMembershipRulesDisallowedResponse;
        // Assert that the a bot is sending the configured membership
        // rules message when a membership change puts it in disabled mode
        assert((message.markdown == framework.membershipRulesDisallowedResponse),
          `Bot disabled due to membership change responded with "${message.markdown}",
           expected "${framework.membershipRulesDisallowedResponse}".`); 
      } else if (eventsData.checkMembershipRulesStateMessageResponse) {
        delete eventsData.checkMembershipRulesStateMessageResponse;
        // Assert that the disabled membership rules bot is sending the configured 
        // response after being mentiond
        assert((message.markdown == framework.membershipRulesStateMessageResponse),
          `Disabled bot responded to a message with "${message.markdown}",
           expected "${framework.membershipRulesStateMessageResponse}".`); 
      } else if (eventsData.checkMembershipRulesAllowedResponse) {
        delete eventsData.checkMembershipRulesAllowedResponse;
        // Assert that the disabled Guide Mode bot is sending the configured 
        // response when guide is added to a previously unguided room
        assert((message.markdown == framework.membershipRulesAllowedResponse),
          `Bot responded to a membership change which re-enabled it with "${message.markdown}",
          expected "${framework.membershipRulesAllowedResponse}".`); 
        }
      promiseResolveFunction(assert(validator.isMessage(message),
        'memssageCreated event did not include a valid message'));
    });
  },

  frameworkMessageDeletedEventHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    eventsData.in.expected.push('membershipDeleted');
    this.framework.once('messageDeleted', (message, id) => {
      eventsData.out.got.push('membershipDeleted');
      framework.debug(`Framework messageDeleted event occurred in test ${testName}`);
      eventsData.message = message;
      promiseResolveFunction(assert((id === framework.id),
        'id returned in framework.on("messageDeleted") is not the one expected'));
    });
  },

  frameworkMentionedHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    eventsData.in.expected.push('mentioned');
    this.framework.once('mentioned', (bot, trigger, id) => {
      eventsData.out.got.push('mentioned');
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
    eventsData.in.expected.push('message(framework)');
    this.framework.once('message', (bot, trigger, id) => {
      eventsData.out.got.push('message(framework)');
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
    eventsData.in.expected.push('files(framework)');
    this.framework.once('files', (bot, trigger, id) => {
      eventsData.out.got.push('files(framework)');
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
    eventsData.in.expected.push('memberEnters(framework)');
    this.framework.once('memberEnters', (bot, membership, id) => {
      eventsData.out.got.push('memberEnters(framework)');
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
      if (!eventsData.multipleEvents?.memberEnters) {
        if (--eventsData.multipleEvents.memberEnters > 0) {
          // Need more events to emit before resolving promise, register another handler
          this.frameworkMemberEntersHandler(testName, framework, eventsData, promiseResolveFunction);
        } else {
          delete eventsData.multipleEvents.memberEnters;
          promiseResolveFunction(true);
        } 
      } else {
        promiseResolveFunction(true);
      }
    });
  },

  frameworkMemberAddedAsModeratorHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    eventsData.in.expected.push('memberAddedAsModerator(framework)');
    this.framework.once('memberAddedAsModerator', (bot, membership, id) => {
      eventsData.out.got.push('memberEnters(framework)');
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
    eventsData.in.expected.push('memberExits(framework)');
    this.framework.once('memberExits', (bot, membership, id) => {
      eventsData.out.got.push('memberExits(framework)');
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
    eventsData.in.expected.push('membershipDeleted');
    this.framework.once('membershipDeleted', (membership, id) => {
      eventsData.out.got.push('membershipDeleted');
      framework.debug(`Framework membershipDeleted event occurred in test ${testName}`);
      assert(id === framework.id);
      assert(validator.isMembership(membership),
        'membership returned in framework.on("membershipDeleted") is not valid');
      eventsData.membership = membership;
      assert(validator.isMembership(membership),
        'membershipDeleted event did not include a valid membership')
      if (eventsData.multipleEvents?.membershipDeleted) {
        if (--eventsData.multipleEvents.membershipDeleted > 0) {
          this.frameworkMembershipDeletedHandler(testName, framework, 
            eventsData, promiseResolveFunction);
        } else {
          delete eventsData.multipleEvents.membershipDeleted;
          promiseResolveFunction(true);
        }
      } else {
        promiseResolveFunction(true);
      }
    });
  },

  frameworkAttachementActionEventHandler: function (testName, framework, cardSendingBot, eventsData, promiseResolveFunction) {
    eventsData.in.expected.push('attachmentAction');
    this.framework.once('attachmentAction', (bot, trigger, id) => {
      eventsData.out.got.push('attachmentAction');
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

  frameworkMembershipRulesEventHandler: function (testName, framework, expectedEvents, eventsData, failOnUnexpectedEvents, promiseResolveFunction, recursive=false) {
    if (!recursive) {
      expectedEvents.forEach((event) => {
        eventsData.in.expected.push(`membershipRules:${event}`);
      });  
    }
    this.framework.once('membershipRulesAction', (type, event, bot, id, ...args) => {
      eventsData.out.got.push(`membershipRules:${event}`);
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
            assert((args.length >= 2), 'did not get a membershipRulesChange object ' +
              'in membershipRulesAction event handler');
            let actorId = args[0];
            let membershipRulesChange = args[1];
            assert(((typeof membershipRulesChange == 'object') && 
              (typeof membershipRulesChange.membership === 'object')),
              'membershipRulesChange event did not return expected membershipRulesChange object');
            if (membershipRulesChange.membershipRule === "restrictedToEmailDomains") {
              // Validate that the membership belongs to the actor
              // This won't always be the case (it's the email of the first member who is not in
              // the allowed domains list), but they are the same in all of our test cases.
              assert((membershipRulesChange.membership.personId === actorId),
              'membershipRulesChange.membership.personId was not the same as the person who attempted to add ' +
                'the bot when processing a swallowed "spawn" event in the membershipRulesAction handler');
            } else {
              // Validate that the membership in the membershipRulesChange belongs to the bot
              assert((membershipRulesChange.membership.personId === bot.person.id),
              'membershipRulesChange.membership.personId was not the same as the bot\'s' +
                'person ID when processing a swallowed "spawn" event in the membershipRulesAction handler');
            }
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
        this.frameworkMembershipRulesEventHandler(testName, framework, expectedEvents, eventsData, 
          failOnUnexpectedEvents, promiseResolveFunction, /*recursive =*/true);
      } else {
        promiseResolveFunction(true);
      }
    });
  },

  frameworkDespawnHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    eventsData.in.expected.push('despawn');    
    this.framework.once('despawn', (bot, id, removedBy, membershipRuleChange) => {
      eventsData.out.got.push('despawn');    
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

  frameworkStopHandler: function (testName, framework, eventsData, promiseResolveFunction) {
    eventsData.in.expected.push('despawn');    
    this.framework.once('stop', (id) => {
      eventsData.out.got.push('despawn');    
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
      eventsData.in.expected.push('message(bot)');    
      activeBot.once('message', (bot, trigger, id) => {
        eventsData.out.got.push('message(bot)');    
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
      eventsData.in.expected.push('files(bot)');    
      activeBot.once('files', (bot, trigger, id) => {
        eventsData.out.got.push('files(bot)');    
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
      eventsData.in.expected.push('memberEnters(bot)');    
      activeBot.once('memberEnters', (bot, membership) => {
        eventsData.out.got.push('memberEnters(bot)');    
        this.framework.debug(`Bot memberEnters event occurred in test ${testName}`);
        assert(validator.isBot(bot),
          'bot memberEnters event did not include a valid bot');
        assert((bot.id === activeBot.id),
          'bot returned in bot.on("memberEnters") is not the one expected');
        assert((membership.id === eventsData.membership.id),
          'membership returned in framework.on("memberEnters") is not the one expected');
        assert(validator.isMembership(membership),
          'membership returned in framework.on("memberEnters") is not valid');
        if (!eventsData.multipleEvents?.botMemberEnters) {
          if (--eventsData.multipleEvents.botMemberEnters > 0) {
            // Need more events to emit before resolving promise, register another handler
            activeBot.memberEntersHandler(testName, eventsData, promiseResolveFunction);
          } else {
            delete eventsData.multipleEvents.botMemberEnters;
            promiseResolveFunction(true);
          } 
        } else {
          promiseResolveFunction(true);
        }
        });
    };

    activeBot.memberAddedAsModerator = function (testName, eventsData, promiseResolveFunction) {
      eventsData.in.expected.push('memberAddedAsModerator(bot)');    
      activeBot.once('memberAddedAsModerator', (bot, membership) => {
        eventsData.out.got.push('memberAddedAsModerator(bot)');    
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
      eventsData.in.expected.push('memberExits(bot)');    
      activeBot.once('memberExits', (bot, membership) => {
        eventsData.out.got.push('memberExits(bot)');    
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

    activeBot.stopHandler = function (testName, eventsData, promiseResolveFunction) {
      eventsData.in.expected.push('stop(bot)');    
      activeBot.once('stop', (bot) => {
        eventsData.out.got.push('stop(bot)');    
        this.framework.debug(`Bot stop event occurred in test ${testName}`);
        assert(validator.isBot(bot),
          'bot event did not include a valid bot');
        assert((bot.id === activeBot.id),
          'bot returned in bot.on("stop") is not the one expected');
        promiseResolveFunction(true);
      });
    };
  },

  // External Helper function to through all the messages in test-data
  // Helper function to iterate through test messages
  runMessages: function(testMessages, framework, eventsData, user, botShouldRespond) {
    let behavior = 'should'
    if (!botShouldRespond) {
      behavior += ' not'
    }
      testMessages.forEach((testData) => {
        let userMsgTest = `user says ${testData.msgText}`;
        let botResponseTest = `bot ${behavior} to ${testData.msgText}`;

        // describe((`${userMsgTest} and bot ${behavior} respond`), () => {

          it(userMsgTest, () => {
            eventsData.testName = userMsgTest;
            return this.userSendMessage(eventsData.testName, framework, user,
              eventsData.bot, eventsData, testData);
          });

          it(botResponseTest, () => {
            eventsData.testName = botResponseTest;
            return this.botRespondsToTrigger(eventsData.testName, framework,
              eventsData.bot, eventsData, botShouldRespond);
          });

          it(`clears framework.hears for ${testData.msgText}`, () => {
            testData.hearsInfo.forEach((info) => {
              framework.clearHears(info.functionId);
            });
          });
        });
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

  // TEMP: testInfo is a copy of eventsData
  // Eventually get rid of eventsData and use testInfo everywhere!
  eventsData: {
    config: {}
  },
  testInfo: this.eventsData,

  // Common helpers
  assert: assert,
  when: when,
  validator: validator,
  _: _

};

// Internal Helper functions

function initEventsData(eventsData) {
  eventsData.in = {};
  eventsData.in.expected = [];
  eventsData.out = {};
  eventsData.out.got = [];
  eventsData.out.unexpectedEventMessage = [];
}

function registerUnexpectedEventsHandler (framework, eventsData) {
  // if (!('catchAllRegistered' in eventsData)) {
  //   eventsData.catchAllRegistered = 0;
  // }
//  if (!eventsData.catchAllRegistered) {
    framework.debug('Setting a catch-all events listener to detect malformed tests');
    framework.onAny((eventName, ...args) => {
      if (eventName == 'log') {
        framework.debug(args[0]);
      } else {
        let msg = `Got a ${eventName} in test:"${eventsData.testName}"`
        if (eventName == 'membershipRulesAction') {
          msg = `Got a ${eventName} of type:${args[0]}`;
          if (('event-swallowed' == args[0]) || ('state-change' == args[0])) {
            msg += `:${args[1]}`;
          }
          msg += ` in test:"${eventsData.testName}"`
        }
        console.log(msg);
        if (framework.listenerCount(eventName) == 0) {
          let msg = `Got an unhandled event ${eventName} in test:"${eventsData.testName}"`
          console.error(msg);
          console.error(args[0]);
          eventsData.out.unexpectedEventMessage.push(msg);
        }
      }
    });
  //   eventsData.catchAllRegistered = 1;
  // } else {
  //   eventsData.catchAllRegistered += 1;
  // }
}

function removeUnexpectedEventsHandler(framework) {
// if ("catchAllRegistered" in eventsData) {
//   if (eventsData.catchAllRegistered) {
//     eventsData.catchAllRegistered -= 1;
//   }
//   if (eventsData.catchAllRegistered == 1) {
    framework.offAny();
    framework.debug('Clearing the catch-all events listener as final test spot bot leaves');
//     catchAllRegistered = 0;
//   }
// } else {
//   return when.reject(new Error('No catch-all events handler was set for these tests!'));
}



function checkInterimEventsData(eventsData, retVal=null) {
  let msg = '';
  if (eventsData.out.unexpectedEventMessage.length) {
    eventsData.out.unexpectedEventMessage.forEach((message) => {
      msg += `${message}\n`;
    });
    return when.reject(new Error(msg));
  }
  return when.resolve(retVal);
}

function difference(ar1, ar2) {
  const ar2Count = ar2.reduce((acc, val) => {
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {});

  return ar1.filter((val) => {
    if (ar2Count[val] > 0) {
      ar2Count[val]--;
      return false;
    }
    return true;
  });
}
function checkEventsDataAfterFailure(e, ed) {
  if (ed.out.unexpectedEventMessage.length) {
    return checkInterimEventsData(ed);
  }
  if (e.message === 'Timeout expired') {
    let result = difference(ed.in.expected, ed.out.got);
    let msg = `Timed out while wait for framework events in test:${ed.testName}!\n`
    if (result.length) {
      msg += ` -- Expected: ${ed.in.expected}\n`;
      msg += ` -- Got: ${ed.out.got}\n`;
      msg += ` -- Missing: ${result}`;
    } else {
      msg += `-- Could not identify reason for timeout failure in test: ${ed.testName}`;
    }
    console.error(msg);
    return when.reject(new Error(msg));
  } else {
    return when.reject(e);
  }
}


function waitForPromisesWithTimeout(promiseArray, preMochaTimeout, eventsData) {
  eventPromises = Promise.all(promiseArray);
  timeoutPromise = new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      return reject(new Error('Timeout expired'));
    }, preMochaTimeout);
  });

  return Promise.race([
    eventPromises.then(() => clearTimeout(timeoutId)),
    Promise.race([eventPromises, timeoutPromise]).catch((error) => {
      return checkEventsDataAfterFailure(error, eventsData)
    }),
  ]);  
}



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
      bot.getWebexSDK().rooms.remove(bot.room);
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




