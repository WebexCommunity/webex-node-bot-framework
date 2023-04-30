const assert = require('assert');
const when = require('when');
const sequence = require('when/sequence');
const validator = require('../../lib/validator');
let fs = require('fs');
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
  setUserPerson: function (p) {
    this.userPerson = p;
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

  getPersonInfoForUser(userSDK) {
    if (userSDK == this.userWebex) {
      return this.userPerson;
    } else if (userSDK == this.disallowedUserSDK) {
      return this.disallowedUserPerson;
    } else {
      return {};
    }
  },

  // Default value if setter is not called
  preMochaTimeout: 35000,
  setMochaTimeout: function(t) {
    // We will timeout 80% faster than Mocha
    this.preMochaTimeout = t - t/10*2;   
  },


  // Common Tasks used by tests
  initFramework: function (testName, framework, userWebex) {
    let testInfo = this.testInfo
    testInfo.config.testName = testName;
    initTestInfo(this.testInfo);
    console.log('In initFramework...');
    // Wait for framework to generate events that indicate it started succesfully
    const started = new Promise((resolve) => {
      this.frameworkStartHandler(framework, testInfo, resolve);
    });
    const initialized = new Promise((resolve) => {
      this.frameworkInitializedHandler(framework, testInfo, resolve);
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
    return waitForPromisesWithTimeout([started, initialized], this.preMochaTimeout, testInfo)
      .then(() => {
        if (framework.getWebexSDK().config.defaultMercuryOptions) {
          return Promise.reject(new Error(`Framework initialized but has a proxy config when none was set!`));
        }
        myAssert(testInfo, validator.isFramework(framework),
          'Framework did not initialize succesfully');
        framework.debug(`${framework.email} is in ${framework.bots.length} at the start of the tests.`);
        if (process.env.CLEANUP_USER_ROOMS) {
          return asUserCleanupFromPreviousTests(userWebex, framework);
        } else {
          return when(true);
        }
      }).then(() => {
        // Make sure we have user info before next step...
        return when(userInfoIsReady).catch((e) => {
          console.error(`Could not initialize user with USER_API_TOKEN: ${e.message}`);
          return Promise.reject(e);
        });    
      }).then((person) => {
        this.userPerson = person;
        myAssert(testInfo, validator.isPerson(person),
          'getPerson did not return a valid person');
        // All went well, we are ready to start running tests
        // Each test should register listeners for all framework generated events.
        // This catch-all listener will detect any events that don't have listeners
        registerUnexpectedEventsHandler(framework, testInfo);

        // Finally, see if there is a 1-1 space between test bot and test user
        return this.cleanupFromPreviousTestsAndFindDirectSpace(framework, this.userPerson);
      });
  },

  stopFramework: function (testName, framework) {
    if (framework) {
      let testInfo = this.testInfo;
      this.testInfo.config.testName = testName;
      const stopped = new Promise((resolve) => {
        this.frameworkStopHandler(framework, testInfo, resolve);
      });

      // remove the catch-all listener
      removeUnexpectedEventsHandler(framework);
      return framework.stop()
        .then(() => when(stopped))
        .catch((e) => console.error(`Failed during framework.stop(): ${e.message}`));
    }
  },

  userSendsMessageAndBotMayRespond: function (testData, framework, user, bot, testInfo) {
    initTestInfo(testInfo);
    let spawnEvents = [];
    if (shouldFail) {
      spawnEvents = this.registerMembershipEventsForDectivatedBot(framework, '', testInfo);
    } else {
      spawnEvents.push(new Promise((resolve) => {
        this.frameworkMembershipCreatedHandler(framework, testInfo, resolve);
      }));
      spawnEvents.push(new Promise((resolve) => {
        this.frameworkSpawnedHandler(framework, testInfo, resolve);
      }));
    }
    it(`user says ${testData.msg}`, () => {
      let testData = {
        msgText: `user says ${testData.msg}`,
        hearsInfo: [{
          phrase: testData.msgText
        }]
      };
      return this.userSendMessage(framework, testInfo, testData)
    });
  },

  userSendsAttachmentActionAndBotMayRespond: function (framework, testInfo, cardMsgId, inputs,) {
    initTestInfo(testInfo);
    let attachmentAction;

    // Wait for the events associated with a new button press before completing test..
    let attachmentActionEvent = new Promise((resolve) => {
      this.frameworkAttachementActionEventHandler(framework,
        testInfo, resolve);
    });

    return testInfo.config.userUnderTest.attachmentActions.create({
      // Emulate an Action.Submit button press
      type: 'submit',
      messageId: cardMsgId,
      inputs
    })
      .then((a) => {
        attachmentAction = a;
        assert(validator.isAttachmentAction(attachmentAction),
          `attachmentAction returned by sdk.attachmentActions.create() was not valid`);
        return waitForPromisesWithTimeout([attachmentActionEvent], this.preMochaTimeout, testInfo);
      })
      .then(() => {
        assert(validator.objIsEqual(attachmentAction, testInfo.out.attachmentAction),
          `"${testInfo.config.testName}" failed: attachmentAction returned by API did not match the one from the attachmentAction event`);
        // Wait for the events associated with a new message before completing test..
        return checkInterimtestInfo(testInfo, attachmentAction);
      });
  },

  addBotToSpace: function (framework, testInfo, shouldFail, userSDK) {
    // Configure this test to Wait for the events associated with a new membership
    initTestInfo(testInfo);
    let spawnEvents = [];
    if (shouldFail) {
      spawnEvents = this.registerMembershipEventsForDectivatedBot(framework, '', testInfo);
    } else {
      spawnEvents.push(new Promise((resolve) => {
        this.frameworkMembershipCreatedHandler(framework, testInfo, resolve);
      }));
      spawnEvents.push(new Promise((resolve) => {
        this.frameworkSpawnedHandler(framework, testInfo, resolve);
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
        return myAssert(testInfo, validator.isMembership(membership),
          'create memebership did not return a valid membership');
      })
      // Wait for the expected events
      .then(() => waitForPromisesWithTimeout(spawnEvents, this.preMochaTimeout, testInfo)
      .then(() => {
        userCreatedRoomBot = testInfo.out.newBot;
        this.createBotEventHandlers(userCreatedRoomBot);
        if (!shouldFail) {
          myAssert(testInfo, framework.getBotByRoomId(userCreatedRoomBot.room.id),
            'After spawn new bot is not in framework\'s bot array');
        }
        return userCreatedRoomBot;
      }).then((bot) => checkInterimtestInfo(testInfo, bot)));
  },

  botAddUsersToSpace: function (framework, testInfo, userEmails) {
    initTestInfo(testInfo);
    testInfo.disallowedUserEmail = [];
    let guideAdded = false;
    if (framework.options.restrictedToEmailDomains) {
      for (let i = 0; i < userEmails.length; i++) {
        if (this.isDisallowedEmailDomain(userEmails[i], framework.options.restrictedToEmailDomains)) {
          testInfo.disallowedUserEmail.push(userEmails[i]);
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
    if (testInfo.config.botUnderTest.active) {
      // Active bot should behave normally when a non restricted member enters
      eventPromises = this.registerMembershipHandlers(framework, testInfo, userEmails);
    } else if ((!testInfo.config.botUnderTest.active) && (guideAdded)) {
      // Inactive bot should do a membership rules spawn when guide enters
      // This will fail if the space also includes restricted domain users -- not currently in tests
      eventPromises = this.registerMembershipEventsForGuideAdded(framework, testInfo.disallowedUserEmail, testInfo);
    } else if (!testInfo.config.botUnderTest.active) {
      // An inactive bot will remain inactive when non-guide users enter, memberEnters will be swallowed
      eventPromises = this.registerMembershipEventsForInactiveBot(framework, testInfo.disallowedUserEmail, testInfo);
    } else {
      // This membership will trigger a membership rules "despawn"
      eventPromises = this.registerMembershipEventsForDectivatedBot(framework, testInfo.disallowedUserEmail, testInfo);
    }
    // Add the users to the space with the bot
    return testInfo.config.botUnderTest.add(userEmails)
      .then((emails) => {
        // Todo update this to check each email
        myAssert(testInfo, (emails.length === userEmails.length),
          `bot.add did not add all the requested users in test "${testInfo.config.testName}"`);
        // Wait for all the event handlers to fire
        return waitForPromisesWithTimeout(eventPromises, this.preMochaTimeout, testInfo);
      }).then(() => {
        delete testInfo.multipleEvents;
        return checkInterimtestInfo(testInfo);
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

  botRemoveUserFromSpace: function (framework, testInfo, userEmail,
    numDisallowedUsersInSpace, isDisallowedUser) {
    initTestInfo(testInfo);
    let eventPromises = [];
    let guideRemoved = false;
    if ((framework.options.guideEmails) &&
        (-1 != framework.guideEmails.indexOf(_.toLower(userEmail)))) {
      guideRemoved = true;
    }

    if (!testInfo.config.botUnderTest.active) {
      myAssert(testInfo, numDisallowedUsersInSpace, 
        `botRemoveUserFromSpace() error: ${testInfo.config.testName}set numDisallowedUsersInSpace to ${numDisallowedUsersInSpace}`);
      eventPromises = this.registerMembershipDeletedEventsWhenDisallowedUserExits(framework, testInfo, numDisallowedUsersInSpace);
    } else if (guideRemoved) {
      // A currently uncovered test case is removing one guide when another is still present
      eventPromises = this.registerGuideRemovedFromSpaceEvents(framework, testInfo, numDisallowedUsersInSpace);
    } else {
      eventPromises = this.registerMembershipDeletedHandlers(framework, testInfo);
    }

    // Add the users to the space with the bot
    return testInfo.config.botUnderTest.remove(userEmail)
      .then((emails) => {
        // Todo update this to check each email
        myAssert(testInfo, (emails[0] === userEmail),
          `bot.remove did not remove the requested users in test "${testInfo.config.testName}"`);
        if (isDisallowedUser) {
          testInfo.disallowedUserEmail = this.disallowedUserPerson.emails[0];
        }
        // Wait for all the event handlers to fire
        return waitForPromisesWithTimeout(eventPromises, this.preMochaTimeout, testInfo);
      }).then(() => checkInterimtestInfo(testInfo));
  },

  registerMembershipHandlers: function (framework, bot, testInfo) {
    //initTestInfo(testInfo);
    let eventPromises = [];
    // These events should occur with a new membership
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipCreatedHandler(framework, testInfo, resolve);
    }));
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMemberEntersHandler(framework, testInfo, resolve);
    }));
    eventPromises.push(new Promise((resolve) => {
      bot.memberEntersHandler(testInfo, resolve);
    }));

    return (eventPromises);
  },

  registerMembershipEventsForGuideAdded: function (framework, disallowedEmails, testInfo) {
    //initTestInfo(testInfo);
    let eventPromises = [];
    let swallowedEvents;
    // These events should occur with a new membership that adds a guide 
    // to a previously unguided space
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipCreatedHandler(framework, testInfo, resolve);
    }));
    eventPromises.push(new Promise((resolve) => {
      this.frameworkSpawnedHandler(framework, testInfo, resolve);
    }));

    if (framework.membershipRulesAllowedResponse) {
      // When Guides are removed from space with bot expect a 
      // message from the bot saying it won't work
        testInfo.checkMembershipRulesAllowedResponse = true;
        eventPromises.push(new Promise((resolve) => {
        this.frameworkMessageCreatedEventHandler(framework, testInfo, resolve);
        }));
      }
  
    swallowedEvents = ['memberEnters', 'spawn']; 
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipRulesEventHandler(framework,
        swallowedEvents, testInfo,
        false, /* don't error on unexpected swallowed events */
        resolve);
    }));

    return (eventPromises);
  },

  registerMembershipEventsForInactiveBot: function (framework, disallowedEmails, testInfo) {
    //initTestInfo(testInfo);
    let eventPromises = [];
    let swallowedEvents;
    // These events should occur when a new member will not change a bot's inactive status
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipCreatedHandler(framework, testInfo, resolve);
    }));
    // the memberEnters event should be "swallowed", and the bot should not respond
    swallowedEvents = ['memberEnters']; 
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipRulesEventHandler(framework,
        swallowedEvents, testInfo,
        false, /* don't error on unexpected swallowed events */
        resolve);
    }));

    return (eventPromises);
  },

  registerMembershipEventsForDectivatedBot: function (framework, disallowedEmails, testInfo) {
    let eventPromises = [];
    let swallowedEvents;
    // These events should occur with a new membership that violates a memebership rule
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipCreatedHandler(framework, testInfo, resolve);
    }));
    if (disallowedEmails) {
      // Since this user is disallowed we will get a message telling us the bot is deactivating
      eventPromises.push(new Promise((resolve) => {
        this.frameworkMessageCreatedEventHandler(framework, testInfo, resolve);
      }));
      // It will also generate a despawn event with the membership of the dissallowed user
      eventPromises.push(new Promise((resolve) => {
        this.frameworkDespawnHandler(framework, testInfo, resolve);
      }));
      // Finally, we will get some membership-rules events, 
      // and one "swallowed" memberEnters for each dissallowed user
      swallowedEvents = ['despawn']; 
    } else if (("guideEmails" in framework) && framework.guideEmails.length &&
              framework.membershipRulesDisallowedResponse) {
      // Bot in Guided Mode being added to a space with no guides expect a 
      // message from the bot saying it won't work and a "swallowed" spawn event
      testInfo.checkMembershipRulesDisallowedResponse = true;
      eventPromises.push(new Promise((resolve) => {
        this.frameworkMessageCreatedEventHandler(framework, testInfo, resolve);
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
      this.frameworkMembershipRulesEventHandler(framework,
        swallowedEvents, testInfo,
        false, /* don't error on unexpected swallowed events */
        resolve);
    }));

    return (eventPromises);
  },

  registerMembershipHandlers: function (framework, testInfo, userEmails) {
    let eventPromises = [];
    let swallowedEvents = [];
    let disallowedMemberAdded = false;
    testInfo.multipleEvents = {};
    userEmails.forEach((userEmail) => {
      // MembershipCreated events occur for all scenarios
      if (!testInfo.multipleEvents?.membershipCreated) {
        eventPromises.push(new Promise((resolve) => {
          this.frameworkMembershipCreatedHandler(framework, testInfo, resolve);
        }));
        testInfo.multipleEvents.membershipCreated = 1;
      } else {
        testInfo.multipleEvents.membershipCreated += 1;
      }

      if ((!disallowedMemberAdded) && (!testInfo.disallowedUserEmail.includes(userEmail))) {
        // These events should occur with a regular new membership to an active room
        if (!testInfo.multipleEvents?.memberEnters) {
          eventPromises.push(new Promise((resolve) => {
            this.frameworkMemberEntersHandler(framework, testInfo, resolve);
          }));
          eventPromises.push(new Promise((resolve) => {
            testInfo.config.botUnderTest.memberEntersHandler(testInfo, resolve);
          }));
          testInfo.multipleEvents.memberEnters = 1;
          testInfo.multipleEvents.botMemberEnters = 1;
        } else {
          testInfo.multipleEvents.memberEnters += 1;
          testInfo.multipleEvents.botMemberEnters += 1;
        }
      } else if ((!disallowedMemberAdded) && (testInfo.disallowedUserEmail.includes(userEmail))) {
        // These events occur when a disallowed user is added to an enabled bot
        // It will also generate a despawn event with the membership of the dissallowed user
        eventPromises.push(new Promise((resolve) => {
          this.frameworkDespawnHandler(framework, testInfo, resolve);
        }));
        if (framework.membershipRulesStateMessageResponse) {
          eventPromises.push(new Promise((resolve) => {
            this.frameworkMessageCreatedEventHandler(framework, testInfo, resolve);
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
        this.frameworkMembershipRulesEventHandler(framework,
          swallowedEvents, testInfo,
          false, /* don't error on unexpected swallowed events */
          resolve);
      }));

    }
    return (eventPromises);
  },

  registerMembershipDeletedHandlers: function (framework, testInfo) {
    let eventPromises = [];
    let bot = testInfo.config.botUnderTest;
    // Framework always gets the membership change event
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipDeletedHandler(framework, testInfo, resolve);
    }));
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMemberExitsHandler(framework, testInfo, resolve);
    }));
    if (bot != null) {
      eventPromises.push(new Promise((resolve) => {
        bot.memberExitsHandler(testInfo, resolve);
      }));
    }

    return (eventPromises);
  },

  registerGuideRemovedFromSpaceEvents: function (framework, testInfo, numDisallowedUsersInSpace) {
    let eventPromises = [];
    let swallowedEvents;
    // Framework always gets the membership change event
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipDeletedHandler(framework, testInfo, resolve);
    }));

    // TODO check if other guides are in the space, we assume we'll be disallowed at this point
    eventPromises.push(new Promise((resolve) => {
      this.frameworkDespawnHandler(framework, testInfo, resolve);
    }));

    if (framework.membershipRulesDisallowedResponse) {
    // When Guides are removed from space with bot expect a 
    // message from the bot saying it won't work
      testInfo.checkMembershipRulesDisallowedResponse = true;
      eventPromises.push(new Promise((resolve) => {
      this.frameworkMessageCreatedEventHandler(framework, testInfo, resolve);
      }));
    }
    // Finally, we will get some membership-rules events, a "swallowed" memberExits
    // and a message about the re-spawning
    swallowedEvents = ['despawn']
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipRulesEventHandler(framework,
        swallowedEvents, testInfo, true, resolve);
    }));
    return (eventPromises);
  },

  registerMembershipDeletedEventsWhenDisallowedUserExits: function (framework, testInfo, numDisallowedUsersInSpace) {
    let eventPromises = [];
    // Framework always gets the membership change event
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipDeletedHandler(framework, testInfo, resolve);
    }));
    if (numDisallowedUsersInSpace === 1) { 
      // Last disallowed member leaving will "re-spawn" the bot
      eventPromises.push(new Promise((resolve) => {
        this.frameworkSpawnedHandler(framework, testInfo, resolve);
      }));
      // If configured to get a "now active" message, wait for messageCreated event
      if (framework.membershipRulesAllowedResponse) {
        eventPromises.push(new Promise((resolve) => {
          this.frameworkMessageCreatedEventHandler(framework, testInfo, resolve);
        }));
        testInfo.checkMembershipRulesAllowedResponse = true;    
      }
      // Finally, we will get some membership-rules events, a "swallowed" memberExits
      // and a message about the re-spawning
      eventPromises.push(new Promise((resolve) => {
        this.frameworkMembershipRulesEventHandler(framework,
          ['spawn', 'memberExits'], testInfo, true, resolve);
      }));
    } else {
      // If not last disallowed user there is no membership-rules spawn event
      eventPromises.push(new Promise((resolve) => {
        this.frameworkMembershipRulesEventHandler(framework,
          ['memberExits'], testInfo, true, resolve);
      }));
    }

    return (eventPromises);
  },
  
  botLeaveSpace: function (framework, testInfo) {
    initTestInfo(testInfo);
    let leaveSpaceEvents = [];
    leaveSpaceEvents.push(new Promise((resolve) => {
      this.frameworkMembershipDeletedHandler(framework, testInfo, resolve);
    }));
    if (testInfo.config.botUnderTest.active) {
      leaveSpaceEvents.push(new Promise((resolve) => {
        testInfo.config.botUnderTest.stopHandler(testInfo, resolve);
      }));
      leaveSpaceEvents.push(new Promise((resolve) => {
        this.frameworkDespawnHandler(framework, testInfo, resolve);
      }));
    } else {
      // There is no 'stop' event because the bot is not in the 'started' state
      swallowedEventsArray = ['despawn'];
      leaveSpaceEvents.push(new Promise((resolve) => {
        this.frameworkMembershipRulesEventHandler(framework,
          swallowedEventsArray, testInfo, true, resolve);
        }));
    }
  
    return testInfo.config.botUnderTest.exit()
      .then(() => waitForPromisesWithTimeout(leaveSpaceEvents, this.preMochaTimeout, testInfo)
      .then(() => checkInterimtestInfo(testInfo)));
  },

  botCreateSpace: function (framework, testInfo, members) {
    initTestInfo(testInfo);
    // Wait for the events associated with a new membership before completing test..
    const roomCreated = new Promise((resolve) => {
      this.frameworkRoomCreatedHandler(framework, testInfo, resolve);
    });
    const membershipCreatedEvent = new Promise((resolve) => {
      this.frameworkMembershipCreatedHandler(framework, testInfo, resolve);
    });
    const spawned = new Promise((resolve) => {
      this.frameworkSpawnedHandler(framework, testInfo, resolve);
    });

    return testInfo.config.botUnderTest.newRoom(Bot_Test_Space_Title, members)
      .then((b) => {
        botCreatedRoomBot = b;
        myAssert(testInfo, validator.isBot(b),
          `Bot returned by bot.newRoom is not valid.`);
        myAssert(testInfo, validator.isRoom(b.room),
          `Room returned by bot.newRoom is not valid.`);
        this.createBotEventHandlers(b);
        return waitForPromisesWithTimeout([roomCreated], this.preMochaTimeout, testInfo)
      })
      // Wait for framework's membershipCreated event
      .then(() => {
        myAssert(testInfo, (testInfo.out.room.id == botCreatedRoomBot.room.id),
          'Room from framework roomCreated event does not match ' +
          'the one in the bot returned by newRoom()');
        return waitForPromisesWithTimeout([membershipCreatedEvent], this.preMochaTimeout, testInfo)
      })
      .then(() => {
        myAssert(testInfo, (testInfo.out.membership.id === botCreatedRoomBot.membership.id),
          'Membership from framework membershipCreated event does not match ' +
          'the one in the bot returned by newRoom()');
        return waitForPromisesWithTimeout([spawned], this.preMochaTimeout, testInfo);
      })
      // Wait for framework's spawned event
      .then(() => {
        myAssert(testInfo, (testInfo.out.newBot.id == botCreatedRoomBot.id),
          'Bot from framework spawned event does not match the one returned by newRoom()');
        myAssert(testInfo, framework.getBotByRoomId(botCreatedRoomBot.room.id),
          'After spawn new bot is not in framework\'s bot array');
        return when(botCreatedRoomBot);
      })
      .then((bot) => checkInterimtestInfo(testInfo, bot));
  },

  userSendMessage: function (framework, testInfo, testData) {
    initTestInfo(testInfo);
    // We mention the bot when the test is running as a bot account
    // Only register for mention events, if we are mentioning the bot
    let isMention = false;
    let bot = testInfo.config.botUnderTest
    let markdown = testData.msgText
    if ((framework.isBotAccount) && (testInfo.config.roomUnderTest.type != 'direct')) {
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
      eventPromises = this.registerMessageHandlers(isMention, framework, msgObj, testInfo);
    } else {
      eventPromises = this.getInactiveBotEventArray(isMention, framework, msgObj, testInfo, testData.hearsInfo);
    }

    // Register the specified framework.hears handlers for the message 
    testData.hearsInfo.forEach((info) => {
      let calledHearsPromise = new Promise((resolve) => {
        info.functionId = framework.hears(info.phrase, (b, t) => {
          testInfo.out.got.push(`hears(${info.phrase})`);
          framework.debug(`Bot heard message "${t.message.text}" that user posted`);
          myAssert(testInfo, (b.id === bot.id),
            `bot returned in framework.hears(${info.phrase}) is not the one expected`);
          myAssert(testInfo, validator.objIsEqual(t, testInfo.out.trigger),
            `trigger returned in framework.hears(${info.phrase}) was not as expected`);
          myAssert(testInfo, validator.objIsEqual(t.message, testInfo.out.message),
          `trigger.message returned in framework.hears(${info.phrase}) was not as expected\n
            got: "${t.message.text}", expected: ${testInfo.out.message.text}`);
          if (("command" in info) && ("prompt" in info)) {
            myAssert(testInfo, t.command == info.command,
              `trigger.command returned in framework.hears(${info.phrase}) was not as expected`);
            myAssert(testInfo, t.prompt == info.prompt,
              `trigger.prompt returned in framework.hears(${info.phrase}) was not as expected`);
          }
          resolve(true);
        }, info.helpString, info.priority);
      });
      if (bot.active) {
        // Only wait for it to be called if our bot is active (not disabled by membership rules)
        testInfo.in.expected.push(`hears(${info.phrase})`);
        framework.debug(`Adding framework.hears(${info.phrase}) for test "${testInfo.config.testName}"`)
        eventPromises.push(calledHearsPromise);
      }
    });


    // kick it all off with a message
    return testInfo.config.userUnderTest.messages.create(msgObj)
      .then((m) => {
        message = m;
        myAssert(testInfo, validator.isMessage(message),
          `Test:${testInfo.config.testName}create message did not return a valid message`);
        // Wait for all the event handlers and the heard handler to fire
        return waitForPromisesWithTimeout(eventPromises, this.preMochaTimeout, testInfo);
      })
      .then(() => checkInterimtestInfo(testInfo))
      .then(() => when(testInfo.out.trigger))
  },

  botRespondsToTrigger: function (framework, testInfo, shouldBeAllowed) {
    initTestInfo(testInfo);
    let bot = testInfo.config.botUnderTest;
    let shouldFail = false;
    let botResponse = {
      testName: testInfo.config.testName,
      format: 'markdown'
    };
    if ((shouldBeAllowed != undefined) && (shouldBeAllowed == false)) {
      shouldFail = true;
    }
    if (!testInfo.config.priorTestsTrigger) {
      if (bot.active) {
        // This can occur if the previous tests failed
        return when.reject(new Error(`${testInfo.config.testName} didn\'t run. No trigger to respond to`));
      } else {
        // No trigger with a deactivated bot is normal.
        botResponse.msgText = 'Membership Rules should have prevented this message from being sent!'
      }
    } else {
      // Builds the response based on the trigger
      let trigger = testInfo.config.priorTestsTrigger;
      botResponse.msgText = `I heard the entry from ${trigger.person.displayName}:\n`;
      botResponse.msgText += (trigger.message.text) ? `* text: ${trigger.message.text}\n` : '';
      botResponse.msgText += (trigger.message.html) ? `* html: ${trigger.message.html}\n` : '';
    }
    framework.debug(botResponse);

    return this.botSendsMessage(framework, testInfo, botResponse, shouldFail)
  },

  botSendsMessage: function(framework, testInfo, botMsgTest, shouldFail) {
    let bot = testInfo.config.botUnderTest;
    let frameworkMessageFormat = framework.messageFormat; 
    let rejectMessage = `"${testInfo.config.testName}" failed:`; 
    let botMethod = ('botMethod' in botMsgTest) ? botMsgTest.botMethod : 'say';
    let sentText = (botMsgTest.msgObject?.text) ? botMsgTest.msgObject.text : botMsgTest.msgText
    let sentMarkdown = false; 
    let sentFiles = (botMsgTest.msgObject?.file) ? botMsgTest.msgObject.file : botMsgTest.file 
    let sayPromise;
    let message = {};

    if ((botMsgTest.frameworkFormat == 'markdown') || 
      (botMsgTest.format == 'markdown') || (botMsgTest.msgObject?.markdown)) {
      sentMarkdown = true;
      sentText = '';
    }

    if (!shouldFail) {
      if (botMsgTest?.shouldFail == true) {
        shouldFail = true;
      }
    }

    if ((!sentFiles) && ((botMethod == 'uploadStream') || (botMethod == 'sayWithLocalFile'))) {
      throw(new Error(`${rejectMessage} invalid bot message test. ` +
        `If botMethod=="${botMethod}", test must include "file"`));
    }

    // When the bot sends a message the framework WILL generate a
    // messageCreated event, but will not generate other message related events
    // that occur when the message is sent by any other member in the space
    if ((!shouldFail) && (bot.active)) {
      if (botMethod != 'censor') {
        messageEvent = new Promise((resolve) => {
          this.frameworkMessageCreatedEventHandler(framework, testInfo, resolve);
        });
       } else {
        messageEvent = new Promise((resolve) => {
          this.frameworkMessageDeletedEventHandler(framework, testInfo, resolve);
        });                
       }
    }

    if ('frameworkFormat' in botMsgTest) {
      framework.messageFormat = botMsgTest.frameworkFormat;
    }

    if (botMethod == 'sayWithLocalFile') {
      if ('msgText' in botMsgTest) {
        sayPromise = bot.sayWithLocalFile(botMsgTest.msgText, botMsgTest.file);
      } else {
        sayPromise = bot.sayWithLocalFile(null, botMsgTest.file);
      }
    } else if (botMethod == 'uploadStream') {
      let stream = fs.createReadStream(botMsgTest.file);
      sayPromise = bot.uploadStream(stream);
    } else if (botMethod == 'reply') {
      let replyMsg = ('msgObject' in botMsgTest) ? botMsgTest.msgObject : botMsgTest.msgText;
      let parentIdentifer = ('parentObj' in botMsgTest) ? botMsgTest.parentObj : botMsgTest.parentId;
      if ('format' in botMsgTest) {
        sayPromise = bot.reply(parentIdentifer, replyMsg, botMsgTest.format);
      } else {
        sayPromise = bot.reply(parentIdentifer, replyMsg);
      }
    } else if (botMethod == 'sendCard') {
      myAssert(('cardJson' in botMsgTest),
        `${rejectMessage} invalid bot message test. If botMethod=="sendCard", test must include "cardJson"`);
      cardJson = require(botMsgTest.cardJson);
      if ('fallback' in botMsgTest) {
        sayPromise = bot.sendCard(cardJson, botMsgTest.fallback);
      } else {
        sayPromise = bot.sendCard(cardJson);
      }
    } else if (botMethod == 'censor') {
      let censorMsgIdentifer = ('parentObj' in botMsgTest) ? botMsgTest.parentObj : botMsgTest.parentId;
      sayPromise = bot.censor(censorMsgIdentifer);
    } else {  // assume bot.say() test
      if ('format' in botMsgTest) {
        if ('msgText' in botMsgTest) {
          sayPromise = bot.say(botMsgTest.format, botMsgTest.msgText);
        } else if ('msgObject' in botMsgTest) {
          sayPromise = bot.say(botMsgTest.format, botMsgTest.msgObject);
        } else {
          when.reject(new Error(`invalid bot message test. If "format" is set, test must also contain "msgObject" or "msgText"`))
        }
      } else if ('msgText' in botMsgTest) {
        sayPromise = bot.say(botMsgTest.msgText);
      } else if ('msgObject' in botMsgTest) {
        sayPromise = bot.say(botMsgTest.msgObject);
      } else {
        when.reject(new Error(`invalid bot message test. bot.say test must contain "msgObject" or "msgText"`))
    }
    }
    return when(sayPromise)
      .then((m) => {
        if (botMethod != 'censor') {
          message = m;
          framework.messageFormat = frameworkMessageFormat
          myAssert(testInfo, validator.isMessage(m),
            `${rejectMessage} bot.${botMethod} did not return a valid message`);
          if (sentText) {
            myAssert(testInfo, m.text == sentText,
            `${rejectMessage} bot.${botMethod} did not return a message with same text field`);
          }
          if (sentMarkdown) {
            myAssert(testInfo, m.markdown.length,
              `${rejectMessage} bot.${botMethod} did not return a message with markdown`);  
          }
          if (sentFiles) {
            myAssert(testInfo, m.files.length,
            `${rejectMessage} bot.${botMethod} did not return a message webex file URLs`);
          }
          if (botMethod == 'sendCard') {
            myAssert((typeof m.attachments === 'object'),
            `${rejectMessage} bot.${botMethod} did not return a message with a card attachment`);  
          }
        }
        return waitForPromisesWithTimeout([messageEvent], this.preMochaTimeout, testInfo);
      })
      .then(() => {
        if (shouldFail) {
          let msg = `${testInfo.config.testName} bot.${botMethod} was successful but should have failed.`
          console.error(msg);
          return when.reject(new Error(msg));
        }
        myAssert(validator.objIsEqual(message, testInfo.out.message),
          `${rejectMessage} message returned by API did not match the one from the messageCreated event`);
        return checkInterimtestInfo(testInfo, testInfo.out.message);
      }).catch((e) => {
        framework.messageFormat = frameworkMessageFormat
        if (shouldFail) {
          // bot.say correctly failed due to membership rules
          return when.resolve(true)
        }
        console.error(`${testInfo.config.testName} failed: ${e.message}`);
        return when.reject(new Error(e));
      });
  },

  botDeletesSpace: function(framework, testInfo, numOtherUsers) {
    initTestInfo(testInfo);
    let room = testInfo.config.roomUnderTest;
    myAssert(testInfo, validator.isRoom(room),
        'Invalid testInfo.config.roomUnderTest in common.botDeletesSpace()');
    return framework.webex.memberships.list({roomId: room.id})
      .then((memberships) => memberships.items.length - 1)
      .catch((e) => {
        e.message = `Bot failed to get memberships from "${room.title}" before deleting it: ${e.message}`;
        return when.reject(e);
      })
      .then((numOtherUsers) => {
        let implodeEvents = [];
        implodeEvents.push(new Promise((resolve) => {
          this.frameworkMembershipDeletedHandler(framework, testInfo, resolve);
        }));
        if (numOtherUsers) {
          // wait for membershipDeleted from the bot and all other users
          testInfo.multipleEvents = {};
          testInfo.multipleEvents.membershipDeleted = 1 + numOtherUsers;
          framework.debug(`Expecting a total of ${testInfo.multipleEvents.membershipDeleted} ` +
            `MembershipDeleted events to occur when bot deletes "${room.title}"`);
        }
        if (testInfo.config.botUnderTest.active) {
          implodeEvents.push(new Promise((resolve) => {
            testInfo.config.botUnderTest.stopHandler(testInfo, resolve);
          }));
          implodeEvents.push(new Promise((resolve) => {
            this.frameworkDespawnHandler(framework, testInfo, resolve);
          }));
        } else {
          // Our real despawn event will be "swallowed" if membership rules already did it
          implodeEvents.push(new Promise((resolve) => {
            this.frameworkMembershipRulesEventHandler(framework, ['despawn'], testInfo, false, resolve);
          }));
        }
      
        return testInfo.config.botUnderTest.implode()
          .then(() => waitForPromisesWithTimeout(implodeEvents, this.preMochaTimeout, testInfo)
          .then(() => {
            delete testInfo.multipleEvents;
            return checkInterimtestInfo(testInfo);
          }));
      });
  },

  registerMessageHandlers: function (isMention, framework, msg, testInfo) {
    let eventPromises = [];
    let bot = testInfo.config.botUnderTest;

    // Wait for the events associated with a new message before completing test..
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMessageCreatedEventHandler(framework, testInfo, resolve);
    }));

    if (isMention) {
      eventPromises.push(new Promise((resolve) => {
        this.frameworkMentionedHandler(framework, testInfo, resolve);
      }));
      eventPromises.push(new Promise((resolve) => {
        bot.mentionedHandler(testInfo, resolve);
      }));
    }
    if ("files" in msg) {
      eventPromises.push(new Promise((resolve) => {
        this.frameworkFilesHandler(framework, testInfo, resolve);
      }));
      eventPromises.push(new Promise((resolve) => {
        bot.filesHandler(testInfo, resolve);
      }));
    }
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMessageHandler(framework, testInfo, resolve);
    }));
    eventPromises.push(new Promise((resolve) => {
      bot.messageHandler(testInfo, resolve);
    }));

    return eventPromises;
  },

  getInactiveBotEventArray: function (isMention, framework, msgObj, testInfo, hearsInfo) {
    let eventPromises = [];
    let swallowedEventsArray = []

    // Wait for the events associated with a new message before completing test..
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMessageCreatedEventHandler(framework, testInfo, resolve);
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
      testInfo.msgSentToDisabledBot = true;
    }
    eventPromises.push(new Promise((resolve) => {
      this.frameworkMembershipRulesEventHandler(framework,
        swallowedEventsArray, testInfo, 
        true, 
        resolve);
    }));

    return eventPromises;
  },


  // Framework Event Handlers

  frameworkStartHandler: function (framework, testInfo, promiseResolveFunction) {
    testInfo.in.expected.push('start');
    this.framework.once('start', (id) => {
      testInfo.out.got.push('start');
      framework.debug(`Framework start event occurred in test ${testInfo.config.testName}`);
      promiseResolveFunction(myAssert(testInfo, id === framework.id),
        'id returned in framework.on("start") is not the one expected');
    });
  },

  frameworkInitializedHandler: function (framework, testInfo, promiseResolveFunction) {
    testInfo.in.expected.push('initialized');
    this.framework.once('initialized', (id) => {
      testInfo.out.got.push('initialized');
      framework.debug(`Framework initiatlized event occurred in test:${testInfo.config.testName}`);
      promiseResolveFunction(myAssert(testInfo, id === framework.id),
        'id returned in framework.on("initiatlized") is not the one expected');
    });
  },

  frameworkSpawnedHandler: function (framework, testInfo, promiseResolveFunction) {
    testInfo.in.expected.push('spawn');
    this.framework.once('spawn', (bot, frameworkId, addedBy) => {
      testInfo.out.got.push('spawn');
      framework.debug(`Framework spawned  event occurred in test ${testInfo.config.testName}`);
      testInfo.out.newBot = bot;
      myAssert(testInfo, (frameworkId === framework.id),
        `In ${testInfo.config.testName}, the frameworkId passed to the spawned handler was not as expected`);
      if (addedBy) {
        testInfo.addedBy = addedBy;
      }
      promiseResolveFunction(myAssert(testInfo, validator.isBot(bot),
        'spawned event did not include a valid bot'));
    });
  },

  frameworkRoomCreatedHandler: function (framework, testInfo, promiseResolveFunction) {
    testInfo.in.expected.push('roomCreated');
    this.framework.once('roomCreated', (room, id) => {
      testInfo.out.got.push('roomCreated');
      framework.debug(`Framework roomCreated event occurred in test ${testInfo.config.testName}`);
      testInfo.out.room = room;
      myAssert(testInfo, (id === framework.id),
        'id returned in framework.on("roomCreated") is not the one expected');
      promiseResolveFunction(myAssert(testInfo, validator.isRoom(room),
        'roomCreated event did not include a valid room'));
    });
  },

  frameworkRoomUpdatedEventHandler: function (framework, testInfo, promiseResolveFunction) {
    testInfo.in.expected.push('roomUpdated');
    this.framework.once('roomUpdated', (room, id) => {
      testInfo.out.got.push('roomUpdated');
      framework.debug(`Framework roomUpdated event occurred in test ${testInfo.config.testName}`);
      testInfo.out.room = room;
      myAssert(testInfo, (id === framework.id),
        'id returned in framework.on("roomUpdated") is not the one expected');
      promiseResolveFunction(myAssert(testInfo, validator.isRoom(room),
        'roomUpdated event did not include a valid room'));
    });
  },

  frameworkRoomRenamedEventHandler: function (framework, testInfo, promiseResolveFunction) {
    testInfo.in.expected.push('roomRenamed');
    this.framework.once('roomRenamed', (bot, room, id) => {
      testInfo.out.got.push('roomRenamed');
      framework.debug(`Framework roomRenamed event occurred in test ${testInfo.config.testName}`);
      testInfo.out.room = room;
      myAssert(testInfo, (testInfo.config.botUnderTest.id == bot.id),
        'bot returned in framework.on("roomRenamed") is not the one expected');
      myAssert(testInfo, (id === framework.id),
        'id returned in framework.on("roomRenamed") is not the one expected');
      promiseResolveFunction(myAssert(testInfo, validator.isRoom(room),
        'roomRenamed event did not include a valid room'));
    });
  },

  frameworkMembershipCreatedHandler: function (framework, testInfo, promiseResolveFunction) {
    testInfo.in.expected.push('membershipCreated');
    this.framework.once('membershipCreated', (membership, id) => {
      testInfo.out.got.push('membershipCreated');
      framework.debug(`Framework membershipCreated event occurred in test ${testInfo.config.testName}`);
      testInfo.out.membership = membership;
      myAssert(testInfo, validator.isMembership(membership),
        'membershipCreated event did not include a valid membership');
      if (testInfo.multipleEvents?.membershipCreated) {
        if (--testInfo.multipleEvents.membershipCreated > 0) {
          // Need more events to emit before resolving promise, register another handler
          this.frameworkMembershipCreatedHandler(framework, testInfo, promiseResolveFunction);
        } else {
          delete testInfo.multipleEvents.membershipCreated
          promiseResolveFunction(myAssert(testInfo, id === framework.id),
            'id returned in framework.on("membershipCreated") is not the one expected');
        }    
      } else {
        promiseResolveFunction(myAssert(testInfo, id === framework.id),
          'id returned in framework.on("membershipCreated") is not the one expected');
      }
    });
  },

  frameworkMembershipUpdatedHandler: function (framework, testInfo, promiseResolveFunction) {
    testInfo.in.expected.push('membershipUpdated');
    this.framework.once('membershipUpdated', (membership, id) => {
      testInfo.out.got.push('membershipUpdated');
      framework.debug(`Framework membershipUpdated event occurred in test ${testInfo.config.testName}`);
      testInfo.out.membership = membership;
      myAssert(testInfo, validator.isMembership(membership),
        'membershipUpdated event did not include a valid membership');
      promiseResolveFunction(myAssert(testInfo, id === framework.id),
        'id returned in framework.on("membershipUpdated") is not the one expected');
    });
  },

  frameworkMessageCreatedEventHandler: function (framework, testInfo, promiseResolveFunction) {
    testInfo.in.expected.push('messageCreated');
    this.framework.once('messageCreated', (message, id) => {
      testInfo.out.got.push('messageCreated');
      framework.debug(`Framework messageCreated event occurred in test ${testInfo.config.testName}`);
      testInfo.out.message = message;
      myAssert(testInfo, (id === framework.id),
        'id returned in framework.on("messageCreated") is not the one expected');
      if (testInfo.msgSentToDisabledBot) {
        // This event occured when a user sent a message to a disallowed bot
        // Register this handler again so that we wait for the bot's automated response
        delete testInfo.msgSentToDisabledBot;
        this.frameworkMessageCreatedEventHandler(framework, testInfo, promiseResolveFunction);
        // It's possible for the response to come back before the original message
        if (message.markdown != framework.membershipRulesStateMessageResponse) {
          // If this isn't the disabled message from the bot check it on the next event
          testInfo.checkMembershipRulesStateMessageResponse = true;
        }
        return
      } else if (testInfo.checkMembershipRulesDisallowedResponse) {
        delete testInfo.checkMembershipRulesDisallowedResponse;
        // Assert that the a bot is sending the configured membership
        // rules message when a membership change puts it in disabled mode
        myAssert(testInfo, (message.markdown == framework.membershipRulesDisallowedResponse),
          `Bot disabled due to membership change responded with "${message.markdown}",
           expected "${framework.membershipRulesDisallowedResponse}".`); 
      } else if (testInfo.checkMembershipRulesStateMessageResponse) {
        delete testInfo.checkMembershipRulesStateMessageResponse;
        // Assert that the disabled membership rules bot is sending the configured 
        // response after being mentiond
        myAssert(testInfo, (message.markdown == framework.membershipRulesStateMessageResponse),
          `Disabled bot responded to a message with "${message.markdown}",
           expected "${framework.membershipRulesStateMessageResponse}".`); 
      } else if (testInfo.checkMembershipRulesAllowedResponse) {
        delete testInfo.checkMembershipRulesAllowedResponse;
        // Assert that the disabled Guide Mode bot is sending the configured 
        // response when guide is added to a previously unguided room
        myAssert(testInfo, (message.markdown == framework.membershipRulesAllowedResponse),
          `Bot responded to a membership change which re-enabled it with "${message.markdown}",
          expected "${framework.membershipRulesAllowedResponse}".`); 
        }
      promiseResolveFunction(myAssert(testInfo, validator.isMessage(message),
        'memssageCreated event did not include a valid message'));
    });
  },

  frameworkMessageDeletedEventHandler: function (framework, testInfo, promiseResolveFunction) {
    testInfo.in.expected.push('messageDeleted');
    this.framework.once('messageDeleted', (message, id) => {
      testInfo.out.got.push('messageDeleted');
      framework.debug(`Framework messageDeleted event occurred in test ${testInfo.config.testName}`);
      testInfo.out.message = message;
      promiseResolveFunction(myAssert(testInfo, (id === framework.id),
        'id returned in framework.on("messageDeleted") is not the one expected'));
    });
  },

  frameworkMentionedHandler: function (framework, testInfo, promiseResolveFunction) {
    testInfo.in.expected.push('mentioned');
    this.framework.once('mentioned', (bot, trigger, id) => {
      testInfo.out.got.push('mentioned');
      framework.debug(`Framework mentioned event occurred in test ${testInfo.config.testName}`);
      myAssert(testInfo, validator.isBot(bot),
        'mentioned event did not include a valid bot');
      myAssert(testInfo, (bot.id === testInfo.config.botUnderTest.id),
        'bot returned in framework.on("mentioned") is not the one expected');
      myAssert(testInfo, validator.isTrigger(trigger),
        'mentioned event did not include a valid trigger');
      testInfo.out.trigger = trigger;
      promiseResolveFunction(myAssert(testInfo, (id === framework.id),
        'id returned in framework.on("mentioned") is not the one expected'));
    });
  },

  frameworkMessageHandler: function (framework, testInfo, promiseResolveFunction) {
    testInfo.in.expected.push('message(framework)');
    this.framework.once('message', (bot, trigger, id) => {
      testInfo.out.got.push('message(framework)');
      framework.debug(`Framework message event occurred in test ${testInfo.config.testName}`);
      myAssert(testInfo, validator.isBot(bot),
        'message event did not include a valid bot');
      myAssert(testInfo, (bot.id === testInfo.config.botUnderTest.id),
        'bot returned in framework.on("message") is not the one expected');
      myAssert(testInfo, validator.isTrigger(trigger),
        'message event did not include a valid trigger');
      testInfo.out.trigger = trigger;
      promiseResolveFunction(myAssert(testInfo, (id === framework.id),
        'id returned in framework.on("message") is not the one expected'));
    });
  },

  frameworkFilesHandler: function (framework, testInfo, promiseResolveFunction) {
    testInfo.in.expected.push('files(framework)');
    this.framework.once('files', (bot, trigger, id) => {
      testInfo.out.got.push('files(framework)');
      framework.debug(`Framework files event occurred in test ${testInfo.config.testName}`);
      myAssert(testInfo, validator.isBot(bot),
        'files event did not include a valid bot');
      myAssert(testInfo, (bot.id === testInfo.config.botUnderTest.id),
        'bot returned in framework.on("files") is not the one expected');
      myAssert(testInfo, validator.isTrigger(trigger),
        'files event did not include a valid trigger');
      testInfo.out.trigger = trigger;
      promiseResolveFunction(myAssert(testInfo, (id === framework.id),
        'id returned in framework.on("files") is not the one expected'));
    });
  },

  frameworkMemberEntersHandler: function (framework, testInfo, promiseResolveFunction) {
    testInfo.in.expected.push('memberEnters(framework)');
    this.framework.once('memberEnters', (bot, membership, id) => {
      testInfo.out.got.push('memberEnters(framework)');
      framework.debug(`Framework memberEnters event occurred in test ${testInfo.config.testName}`);
      myAssert(testInfo, validator.isBot(bot),
        'bot in memberEnters event did not include a valid bot');
      myAssert(testInfo, (bot.id === testInfo.config.botUnderTest.id),
        'bot returned in framework.on("memberEnters") is not the one expected');
      // TODO validate membership
      myAssert(testInfo, (membership.id === testInfo.out.membership.id),
        'membership returned in framework.on("memberEnters") is not the one expected');
      myAssert(testInfo, validator.isMembership(membership),
        'membership returned in framework.on("memberEnters") is not valid');
      myAssert(testInfo, (id === framework.id),
        'id returned in framework.on("memberEnters") is not the one expected');
      if (!testInfo.multipleEvents?.memberEnters) {
        if (--testInfo.multipleEvents.memberEnters > 0) {
          // Need more events to emit before resolving promise, register another handler
          this.frameworkMemberEntersHandler(framework, testInfo, promiseResolveFunction);
        } else {
          delete testInfo.multipleEvents.memberEnters;
          promiseResolveFunction(true);
        } 
      } else {
        promiseResolveFunction(true);
      }
    });
  },

  frameworkMemberAddedAsModeratorHandler: function (framework, testInfo, promiseResolveFunction) {
    testInfo.in.expected.push('memberAddedAsModerator(framework)');
    this.framework.once('memberAddedAsModerator', (bot, membership, id) => {
      testInfo.out.got.push('memberAddedAsModerator(framework)');
      framework.debug(`Framework memberAddedAsModerator event occurred in test ${testInfo.config.testName}`);
      myAssert(testInfo, validator.isBot(bot),
        'bot in memberAddedAsModerator event did not include a valid bot');
      myAssert(testInfo, (bot.id === testInfo.config.botUnderTest.id),
        'bot returned in framework.on("memberAddedAsModerator") is not the one expected');
      myAssert(testInfo, (membership.id === testInfo.out.membership.id),
        'membership returned in framework.on("memberAddedAsModerator") is not the one expected');
      myAssert(testInfo, validator.isMembership(membership),
        'membership returned in framework.on("memberAddedAsModerator") is not valid');
        promiseResolveFunction(myAssert(testInfo, (id === framework.id),
        'id returned in framework.on("personEmemberAddedAsModeratornters") is not the one expected'));
    });
  },

  frameworkMemberExitsHandler: function (framework, testInfo, promiseResolveFunction) {
    testInfo.in.expected.push('memberExits(framework)');
    this.framework.once('memberExits', (bot, membership, id) => {
      testInfo.out.got.push('memberExits(framework)');
      framework.debug(`Framework memberExits event occurred in test ${testInfo.config.testName}`);
      myAssert(testInfo, validator.isBot(bot),
        'bot in memberExits event did not include a valid bot');
      myAssert(testInfo, (bot.id === testInfo.config.botUnderTest.id),
        'bot returned in framework.on("memberExits") is not the one expected');
      myAssert(testInfo, (membership.id === testInfo.out.membership.id),
        'membership returned in framework.on("memberExits") is not the one expected');
      myAssert(testInfo, validator.isMembership(membership),
        'membership returned in framework.on("memberExits") is not valid');
        promiseResolveFunction(myAssert(testInfo, (id === framework.id),
        'id returned in framework.on("memberExits") is not the one expected'));
    });
  },

  frameworkMembershipDeletedHandler: function (framework, testInfo, promiseResolveFunction) {
    testInfo.in.expected.push('membershipDeleted');
    this.framework.once('membershipDeleted', (membership, id) => {
      testInfo.out.got.push('membershipDeleted');
      framework.debug(`Framework membershipDeleted event occurred in test ${testInfo.config.testName}`);
      myAssert(testInfo, id === framework.id);
      myAssert(testInfo, validator.isMembership(membership),
        'membership returned in framework.on("membershipDeleted") is not valid');
      testInfo.out.membership = membership;
      myAssert(testInfo, validator.isMembership(membership),
        'membershipDeleted event did not include a valid membership')
      if (testInfo.multipleEvents?.membershipDeleted) {
        if (--testInfo.multipleEvents.membershipDeleted > 0) {
          this.frameworkMembershipDeletedHandler(framework, 
            testInfo, promiseResolveFunction);
        } else {
          delete testInfo.multipleEvents.membershipDeleted;
          promiseResolveFunction(true);
        }
      } else {
        promiseResolveFunction(true);
      }
    });
  },

  frameworkAttachementActionEventHandler: function (framework, testInfo, promiseResolveFunction) {
    testInfo.in.expected.push('attachmentAction');
    this.framework.once('attachmentAction', (bot, trigger, id) => {
      testInfo.out.got.push('attachmentAction');
      framework.debug(`Framework attachmentAction event occurred in test ${testInfo.config.testName}`);
      myAssert(testInfo, id === framework.id);
      myAssert(testInfo, bot.id === testInfo.config.botUnderTest.id,
        'bot returned in framework.on("attachmentAction") is not the same as the on that sent the card');
      myAssert(testInfo, validator.isTrigger(trigger),
        'mentioned event did not include a valid trigger');
      myAssert(testInfo, trigger.type === 'attachmentAction',
        'trigger returned in framework.on("attachmentAction") was not attachmentAction type!');
      testInfo.out.attachmentAction = trigger.attachmentAction;
      promiseResolveFunction(myAssert(testInfo, validator.isAttachmentAction(trigger.attachmentAction),
        'attachmentAction returned in framework.on("attachmentAction") is not valid'));
    });
  },

  frameworkMembershipRulesEventHandler: function (framework, expectedEvents, testInfo, failOnUnexpectedEvents, promiseResolveFunction, recursive=false) {
    if (!recursive) {
      expectedEvents.forEach((event) => {
        testInfo.in.expected.push(`membershipRules:${event}`);
      });  
    }
    this.framework.once('membershipRulesAction', (type, event, bot, id, ...args) => {
      testInfo.out.got.push(`membershipRules:${event}`);
      framework.debug(`Framework membershipRulesAction of type ${type} occurred in test ${testInfo.config.testName}`);
      if (testInfo.config.botUnderTest)   {
        myAssert(testInfo, id === testInfo.config.botUnderTest.id,
          'bot returned in framework.on("membershipRulesAction") is not the one expected');
      }
      myAssert(testInfo, (((type == 'state-change') && (event === 'spawn')) || (bot.active === false)),
        'bot returned in framework.on("membershipRulesAction") is still in the active state');
      // TODO -- could add some more type and event validation?
      switch (type) {
        case ('state-change'):
          framework.debug(`Membership Rules forced a "${event}" event`);
          break;
        case ('event-swallowed'):
          framework.debug(`Membership Rules swallowed a "${event}" event`);
          if (event === 'spawn') {
            // set the "swallowed bot" in testInfo so it can leave spaces
            testInfo.out.newBot = bot;
            myAssert(testInfo, (args.length >= 2), 'did not get a membershipRulesChange object ' +
              'in membershipRulesAction event handler');
            let actorId = args[0];
            let membershipRulesChange = args[1];
            myAssert(testInfo, ((typeof membershipRulesChange == 'object') && 
              (typeof membershipRulesChange.membership === 'object')),
              'membershipRulesChange event did not return expected membershipRulesChange object');
            if (membershipRulesChange.membershipRule === "restrictedToEmailDomains") {
              // Validate that the membership belongs to the actor
              // This won't always be the case (it's the email of the first member who is not in
              // the allowed domains list), but they are the same in all of our test cases.
              myAssert(testInfo, (membershipRulesChange.membership.personId === actorId),
              'membershipRulesChange.membership.personId was not the same as the person who attempted to add ' +
                'the bot when processing a swallowed "spawn" event in the membershipRulesAction handler');
            } else {
              // Validate that the membership in the membershipRulesChange belongs to the bot
              myAssert(testInfo, (membershipRulesChange.membership.personId === bot.person.id),
              'membershipRulesChange.membership.personId was not the same as the bot\'s' +
                'person ID when processing a swallowed "spawn" event in the membershipRulesAction handler');
            }
          }
          break;
        case ('hears-swallowed'):
          framework.debug(`Membership Rules swallowed a "${event}" event`);
          break;
        default:
          myAssert(testInfo, true === false, `Got unexpected membershipsRules type: ${type}`);
          break;
      }
      var index = expectedEvents.indexOf(event);
      if (index < 0) {
        myAssert(testInfo, (false === failOnUnexpectedEvents), `membershipRulesAction handler got an unexpected ${event} swallowed`);
      } else {
        expectedEvents.splice(index, 1);
      }
      if (expectedEvents.length) {
        // Register handler for next event
        this.frameworkMembershipRulesEventHandler(framework, expectedEvents, testInfo, 
          failOnUnexpectedEvents, promiseResolveFunction, /*recursive =*/true);
      } else {
        promiseResolveFunction(true);
      }
    });
  },

  frameworkDespawnHandler: function (framework, testInfo, promiseResolveFunction) {
    testInfo.in.expected.push('despawn');    
    this.framework.once('despawn', (bot, id, removedBy, membershipRuleChange) => {
      testInfo.out.got.push('despawn');    
      framework.debug(`Framework despawn event occurred in test ${testInfo.config.testName}`);
      myAssert(testInfo, (testInfo.config.botUnderTest.id === bot.id),
        `${testInfo.config.testName}failure processing "despawn": bot.id did not match expected`);
      testInfo.out.leftRoomId = bot.room.id;
      if (removedBy) {
        testInfo.out.removedBy = removedBy;
      }
      if ((membershipRuleChange) && (membershipRuleChange.membershipRule === "restrictedToEmailDomains")) {
        // This despawn was caused by a disallowed member add
        if (testInfo.disallowedUserEmail.length) {
          myAssert(testInfo, (-1 !== testInfo.disallowedUserEmail.indexOf(membershipRuleChange.membership.personEmail)),
            `${testInfo.config.testName}failure processing "despawn": email of dissallowed ` +
          `member did not match any of the expected emails`);
        } else {
          myAssert(testInfo, testInfo.disallowedUserEmail === membershipRuleChange.membership.personEmail,
            `${testInfo.config.testName}failure processing "despawn": email of dissallowed ` +
            `member did not match expected email`);
        }
      }

      myAssert(testInfo, (id === framework.id),
        'id returned in framework.on("despawn") is not the one expected');
      promiseResolveFunction(myAssert(testInfo, validator.isBot(bot),
        'despawn event did not include a valid bot'));
    });
  },

  frameworkStopHandler: function (framework, testInfo, promiseResolveFunction) {
    testInfo.in.expected.push('despawn');    
    this.framework.once('stop', (id) => {
      testInfo.out.got.push('despawn');    
      framework.debug(`Framework stop event occurred in test ${testInfo.config.testName}`);
      promiseResolveFunction(myAssert(testInfo, id === framework.id),
        'id returned in framework.on("despawn") is not the one expected');
    });
  },

  // Bot event handlers (set up when a new bot instance is created)
  createBotEventHandlers: function (activeBot) {
    activeBot.mentionedHandler = function (testInfo, promiseResolveFunction) {
      activeBot.once('mentioned', (bot, trigger, id) => {
        this.framework.debug(`Bot mentioned event occurred in test ${testInfo.config.testName}`);
        myAssert(testInfo, validator.isBot(bot),
          'mentioned event did not include a valid bot');
        myAssert(testInfo, (bot.id === activeBot.id),
          'bot returned in bot.on("mentioned") is not the one expected');
        myAssert(testInfo, validator.isTrigger(trigger),
          'mentioned event did not include a valid trigger');
        promiseResolveFunction(myAssert(testInfo, (id === activeBot.id),
          'id returned in bot.on("mentioned") is not the one expected'));
      });
    };

    activeBot.messageHandler = function (testInfo, promiseResolveFunction) {
      testInfo.in.expected.push('message(bot)');    
      activeBot.once('message', (bot, trigger, id) => {
        testInfo.out.got.push('message(bot)');    
        this.framework.debug(`Bot message event occurred in test ${testInfo.config.testName}`);
        myAssert(testInfo, validator.isBot(bot),
          'message event did not include a valid bot');
        myAssert(testInfo, (bot.id === activeBot.id),
          'bot returned in bot.on("message") is not the one expected');
        myAssert(testInfo, validator.isTrigger(trigger),
          'message event did not include a valid trigger');
        promiseResolveFunction(myAssert(testInfo, (id === activeBot.id),
          'id returned in bot.on("message") is not the one expected'));
      });
    };

    activeBot.filesHandler = function (testInfo, promiseResolveFunction) {
      testInfo.in.expected.push('files(bot)');    
      activeBot.once('files', (bot, trigger, id) => {
        testInfo.out.got.push('files(bot)');    
        this.framework.debug(`Bot files event occurred in test ${testInfo.config.testName}`);
        myAssert(testInfo, validator.isBot(bot),
          'files event did not include a valid bot');
        myAssert(testInfo, (bot.id === activeBot.id),
          'bot returned in bot.on("files") is not the one expected');
        myAssert(testInfo, validator.isTrigger(trigger),
          'files event did not include a valid trigger');
        promiseResolveFunction(myAssert(testInfo, (id === activeBot.id),
          'id returned in bot.on("files") is not the one expected'));
      });
    };

    activeBot.memberEntersHandler = function (testInfo, promiseResolveFunction) {
      testInfo.in.expected.push('memberEnters(bot)');    
      activeBot.once('memberEnters', (bot, membership) => {
        testInfo.out.got.push('memberEnters(bot)');    
        this.framework.debug(`Bot memberEnters event occurred in test ${testInfo.config.testName}`);
        myAssert(testInfo, validator.isBot(bot),
          'bot memberEnters event did not include a valid bot');
        myAssert(testInfo, (bot.id === activeBot.id),
          'bot returned in bot.on("memberEnters") is not the one expected');
        myAssert(testInfo, (membership.id === testInfo.out.membership.id),
          'membership returned in bot.on("memberEnters") is not the one expected');
        myAssert(testInfo, validator.isMembership(membership),
          'membership returned in bot.on("memberEnters") is not valid');
        if (!testInfo.multipleEvents?.botMemberEnters) {
          if (--testInfo.multipleEvents.botMemberEnters > 0) {
            // Need more events to emit before resolving promise, register another handler
            activeBot.memberEntersHandler(testInfo, promiseResolveFunction);
          } else {
            delete testInfo.multipleEvents.botMemberEnters;
            promiseResolveFunction(true);
          } 
        } else {
          promiseResolveFunction(true);
        }
        });
    };

    activeBot.memberAddedAsModerator = function (testInfo, promiseResolveFunction) {
      testInfo.in.expected.push('memberAddedAsModerator(bot)');    
      activeBot.once('memberAddedAsModerator', (bot, membership) => {
        testInfo.out.got.push('memberAddedAsModerator(bot)');    
        this.framework.debug(`Bot memberAddedAsModerator event occurred in test ${testInfo.config.testName}`);
        myAssert(testInfo, validator.isBot(bot),
          'bot memberAddedAsModerator event did not include a valid bot');
        myAssert(testInfo, (bot.id === activeBot.id),
          'bot returned in bot.on("memberAddedAsModerator") is not the one expected');
        myAssert(testInfo, (membership.id === testInfo.out.membership.id),
          'membership returned in bot.on("memberAddedAsModerator") is not the one expected');
        promiseResolveFunction(myAssert(testInfo, validator.isMembership(membership),
          'membership returned in bot.on("memberAddedAsModerator") is not valid'));
      });
    };

    activeBot.memberExitsHandler = function (testInfo, promiseResolveFunction) {
      testInfo.in.expected.push('memberExits(bot)');    
      activeBot.once('memberExits', (bot, membership) => {
        testInfo.out.got.push('memberExits(bot)');    
        this.framework.debug(`Bot memberExits event occurred in test ${testInfo.config.testName}`);
        myAssert(testInfo, validator.isBot(bot),
          'bot memberExits event did not include a valid bot');
        myAssert(testInfo, (bot.id === activeBot.id),
          'bot returned in bot.on("memberExits") is not the one expected');
        myAssert(testInfo, (membership.id === testInfo.out.membership.id),
          'membership returned in bot.on("memberExits") is not the one expected');
        promiseResolveFunction(myAssert(testInfo, validator.isMembership(membership),
          'membership returned in bot.on("memberExits") is not valid'));
      });
    };

    activeBot.stopHandler = function (testInfo, promiseResolveFunction) {
      testInfo.in.expected.push('stop(bot)');    
      activeBot.once('stop', (bot) => {
        testInfo.out.got.push('stop(bot)');    
        this.framework.debug(`Bot stop event occurred in test ${testInfo.config.testName}`);
        myAssert(testInfo, validator.isBot(bot),
          'bot event did not include a valid bot');
        promiseResolveFunction(myAssert(testInfo, (bot.id === activeBot.id),
          'bot returned in bot.on("stop") is not the one expected'));
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

  // TEMP: testInfo is a copy of testInfo
  // Eventually get rid of testInfo and use testInfo everywhere!
  testInfo: {
    config: {}
  },

  // Internal function to delete spaces leftover from previous test runs
  //and check if the test bot already has a 1-1 space with the test user
  cleanupFromPreviousTestsAndFindDirectSpace: function(framework, user) {
    let botForUser1on1Space = null;
    let leftoverTestSpaceBots = [];
    for (let bot of framework.bots) {
      assert(validator.isBot(bot),
        'bot in framework.bots did not validate preoprly!');
      if ((bot.room.title === User_Test_Space_Title) ||
        (bot.room.title === Bot_Test_Space_Title)) {
          leftoverTestSpaceBots.push(bot);
      } else if (bot.room.type == 'direct') {
        if (bot.isDirectTo == user.emails[0]) {
          framework.debug(`Found existing direct space with ${bot.room.title}.  Will run direct message tests.`);
          this.botForUser1on1Space = bot;
        }
      }
    }
    if (leftoverTestSpaceBots.length) {
      let delete_promises = []
      framework.debug(`Removing ${leftoverTestSpaceBots.length} rooms left over from previous test...`);
      delete_promises = _.map(leftoverTestSpaceBots, b => {
        let testInfo = {
          config: {
            testName: 'Bot delete leftover test space',
            botUnderTest: b,
            roomUnderTest: b.room,
          }
        };
        this.createBotEventHandlers(b);
        return () => this.botDeletesSpace(framework, testInfo);
      });
      return sequence(delete_promises)
        .then(() => when(true))
        .catch(e => {
          framework.debug(e.message);
          return when(true);
        })
      .then(() => when(true));
    } else {
      return when(true);
    }      
  },

  // Common helpers
  assert: assert,
  when: when,
  sequence: sequence,
  validator: validator,
  _: _

};

// Internal Helper functions

function initTestInfo(testInfo) {
  testInfo.in = {};
  testInfo.in.expected = [];
  testInfo.out = {};
  testInfo.out.got = [];
  testInfo.out.unexpectedEventMessage = [];
  testInfo.out.assertErrors = [];
}

function registerUnexpectedEventsHandler (framework, testInfo) {
    framework.debug('Setting a catch-all events listener to detect malformed tests');
    framework.onAny((eventName, ...args) => {
      if (eventName == 'log') {
        framework.debug(args[0]);
        return;
      }
      let msg = `Got an unhandled ${eventName} in test:"${testInfo.config.testName}"`
      if (eventName == 'membershipRulesAction') {
        msg = `Got an unhandled ${eventName} of type:${args[0]}`;
        if (('event-swallowed' == args[0]) || ('state-change' == args[0])) {
          msg += `:${args[1]}`;
        }
        msg += ` in test:"${testInfo.config.testName}"`
      }
      if ((framework.listenerCount(eventName) == 0) && 
        (testInfo.config.testName != "framework init")) {
        console.error(msg);
        console.error(args[0]);
        testInfo.out.unexpectedEventMessage.push(msg);
      }
    });
}

function removeUnexpectedEventsHandler(framework) {
    framework.offAny();
    framework.debug('Clearing the catch-all events listener as final test spot bot leaves');
}



function checkInterimtestInfo(testInfo, retVal=null) {
  let msg = '';
  if (testInfo.out.assertErrors.length) {
    msg += `Test "${testInfo.config.testName}" failed assertion test(s):\n`
    testInfo.out.assertErrors.forEach((message) => {
      msg += `${message}\n`;
    });
    return when.reject(new Error(msg));
  }
  if (testInfo.out.unexpectedEventMessage.length) {
    testInfo.out.unexpectedEventMessage.forEach((message) => {
      msg += `${message}\n`;
    });
    return when.reject(new Error(msg));
  }
  // Makes for verbose test output
  // console.log(`Test "${testInfo.config.testName}" got all expected events: ${testInfo.in.expected}`)
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
function checkTestInfoAfterTimout(e, ti) {
  if ((ti.out.unexpectedEventMessage.length) || (ti.out.assertErrors.length)) {
    return checkInterimtestInfo(ti);
  }
  if (e.message === 'Timeout expired') {
    let result = difference(ti.in.expected, ti.out.got);
    let msg = `Timed out while waiting for framework events in test:${ti.config.testName}!\n`
    if (result.length) {
      msg += ` -- Expected: ${ti.in.expected}\n`;
      msg += ` -- Got: ${ti.out.got}\n`;
      msg += ` -- Missing: ${result}`;
    } else {
      msg += `-- Could not identify reason for timeout failure in test: ${ti.config.testName}`;
    }
    console.error(msg);
    return when.reject(new Error(msg));
  } else {
    return when.reject(e);
  }
}


function waitForPromisesWithTimeout(promiseArray, preMochaTimeout, testInfo) {
  eventPromises = Promise.all(promiseArray);
  timeoutPromise = new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      return reject(new Error('Timeout expired'));
    }, preMochaTimeout);
  });

  return Promise.race([
    eventPromises.then(() => clearTimeout(timeoutId)),
    Promise.race([eventPromises, timeoutPromise]).catch((error) => {
      return checkTestInfoAfterTimout(error, testInfo)
    }),
  ]);  
}

  // Create a custom assert function that will update our testInfo object
  // This is necessary because if we assert in an event handler the
  // framework will catch the exception and the test may or may not faile
function myAssert (thisInfo, eval, msg) {
  if (!eval) {
    thisInfo.out.assertErrors.push(msg)
    assert(eval, msg)
  }
}



function asUserCleanupFromPreviousTests(userWebex, framework) {
  // Todo -- handle paginated responses...
  let deletePromises = []
  return userWebex.rooms.list()
    .then((rooms) => {
      for (let room of rooms.items) {
        if ((room.title === User_Test_Space_Title) ||
          (room.title === Bot_Test_Space_Title)) {
          framework.debug('As user, removing room left over from previous test...');
          deletePromises.push(userWebex.rooms.remove(room));
        }
      }
      if (deletePromises.length) {
        return when.all(deletePromises);
      }
      return when(true);
    });
}




