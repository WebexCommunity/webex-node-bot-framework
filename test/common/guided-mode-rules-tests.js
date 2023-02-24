// Variables an functions shared by all tests
const when = require("when");
var common = require("../common/common");
let framework = common.framework;
let userWebex = common.userWebex;
let disallowedUser = common.getDisallowedUser();
let User_Test_Space_Title = common.User_Test_Space_Title;

let validator = common.validator;

paramCombos = [
  {},
  {"membershipRulesDisallowedResponse": ""},
  {"membershipRulesDisallowedResponse": "",
   "membershipRulesStateMessageResponse": ""},
  {"membershipRulesDisallowedResponse": "",
   "membershipRulesStateMessageResponse": "",
   "membershipRulesAllowedResponse": ""},
  {"membershipRulesDisallowedResponse": "No guides in this space, so I ain't working"},
  {"membershipRulesDisallowedResponse": "No guides in this space, so I ain't working",
   "membershipRulesStateMessageResponse": "Can't answer ya pal. No guides in this space"},
  {"membershipRulesDisallowedResponse": "No guides in this space, so I ain't working",
   "membershipRulesStateMessageResponse": "Can't answer ya pal. No guides in this space",
   "membershipRulesAllowedResponse": "Yay, there is a guide here.  I can work now!"}
 ]

paramCombos.forEach(function(paramCombo, testIndex) {
  // function run_guide_mode_test_suite() {
  describe(`Non Guide Creates Room with Bot for test ${testIndex + 1}`, () => {
    let userCreatedTestRoom, userCreatedRoomBot;
    let eventsData = {};
    // Define the messages we want to try sending to the bot
    let testMessages = [
      {msgText: 'hi', hearsInfo: {phrase: 'hi'}},
      {
        msgText: `Here is a file for ya`,
        msgFiles: process.env.HOSTED_FILE,
        hearsInfo: {phrase: /.*file.*/im}
      }
    ];

    // Set the framework guide mode bot response params for this test
    before(() => {
      Object.entries(paramCombo).forEach(([key, value]) => { 
        framework[key] = value; 
      });
      console.log(`    Test ${testIndex + 1} runs with the following guide mode config:`);
      if (framework.membershipRulesDisallowedResponse) {
        console.log(`     - When bot is added to a space with no guides, framework responds with "${framework.membershipRulesDisallowedResponse}"`);  
      } else {
        console.log(`     - Framework will not respond when bot is added to a space with no guides`);  
      }
      if (framework.membershipRulesStateMessageResponse) {
        console.log(`     - When bot is mentioned in a space with no guides, framework responds with "${framework.membershipRulesStateMessageResponse}"`);  
      } else {
        console.log(`     - Framework will not respond when bot mentioned in a space with no guides`);  
      }
      if (framework.membershipRulesAllowedResponse) {
        console.log(`     - When a guide enters a previously unguided space, framework will respond with "${framework.membershipRulesAllowedResponse}"`);  
      } else {
        console.log(`     - Framework will not respond when a guide enters a previously unguided space`);  
      }
    });

    // Create a room as user to have test bot which will create other rooms
    before(() => disallowedUser.rooms.create({title: User_Test_Space_Title})
      .then((r) => {
        userCreatedTestRoom = r;
        return validator.isRoom(r);
      }));

    // Add our bot to the room and validate that no spawn event occurs
    // since our bot should not work in when added to a space without a guide
    before(() => common.addBotToSpace('Add Bot to Space', framework,
      userCreatedTestRoom, eventsData, /*shouldFail = */ true, disallowedUser)
      .then((b) => {
        userCreatedRoomBot = b;
        eventsData.bot = b;
      }));

    // Bot leaves rooms
    after(() => {
      if ((!eventsData.bot) || (!userCreatedTestRoom)) {
        return Promise.resolve();
      }
      return common.botLeaveRoom('Bot Leaves Space', framework, eventsData.bot, userCreatedTestRoom, eventsData);
    });

    // User deletes room -- cleanup
    after(() => {
      if (!userCreatedTestRoom) {
        return Promise.resolve();
      }
      return disallowedUser.rooms.remove(userCreatedTestRoom)
        //        .then(() => when.all([membershipDeleted, stopped, despawned]))
        .catch((reason) => {
          console.error('Failed to cleanup test room', reason);
          throw reason;
        });
    });

    describe('Non guide user iteracts with bot', () => {
      // loop through message tests..
      testMessages.forEach((testData) => {
      
        it(`user says "${testData.msgText}" to disallowed bot`, () => {
          let testName = `user says ${testData.msgText} to disallowed bot`;
          // Adding expectHearsSwallowed in cases where the bot is configured
          // to not reply when spoken to in spaces with no guides
          // TODO add logic to check framework.options.membershipRulesDisallowedResponse
          eventsData.expectHearsSwallowed = true;
          framework.debug(`${testName} test starting...`);
          return common.userSendMessage(testName, framework, disallowedUser,
            userCreatedRoomBot, eventsData,
            testData.hearsInfo, testData.msgText, testData.msgFiles);
        });

        it(`bot should not respond to ${testData.msgText}`, () => {
          let testName = `bot should not respond to "${testData.msgText}"`;
          let shouldBeAllowed = false;
          framework.debug(`${testName} test starting...`);
          return common.botRespondsToTrigger(testName, framework,
            userCreatedRoomBot, eventsData, shouldBeAllowed);
        });
    
      });
      
      it(`Removes the framework.hears() handlers setup in previous ` + `${testMessages.length * 2} tests`, () => {
        testMessages.forEach((testData) => {
          framework.debug(`Cleaning up framework.hears(${testData.hearsInfo.phrase})...`);
          framework.clearHears(testData.hearsInfo.functionId);
        });
      });
    });

    describe('Bot adds guide user to space and iteracts with bot', () => {
      before(() => {
        testName = 'adds a guide user to the room';
        return common.botAddUsersToSpace(testName, framework, userCreatedRoomBot,
          [common.userInfo.emails[0]], eventsData);
      });

      // loop through message tests..
      testMessages.forEach((testData) => {
        eventsData = {expectHearsSwallowed: false};

        it(`user says ${testData.msgText}`, () => {
          let testName = `user says ${testData.msgText}`;
          return common.userSendMessage(testName, framework, userWebex,
            userCreatedRoomBot, eventsData, testData.hearsInfo,
            testData.msgText, testData.msgFiles);
        });

        it(`bot should respond to ${testData.msgText}`, () => {
          let testName = `bot should respond to ${testData.msgText}`;
          let shouldBeAllowed = true;
          return common.botRespondsToTrigger(testName, framework,
            userCreatedRoomBot, eventsData, shouldBeAllowed);
        });

      });

      it(`Removes the framework.hears() handlers setup in previous ` + `${testMessages.length * 2} tests`, () => {
        testMessages.forEach((testData) => {
          framework.debug(`Cleaning up framework.hears(${testData.hearsInfo.phrase})...`);
          framework.clearHears(testData.hearsInfo.functionId);
        });
      });
    });

    describe('Bot removes guide user from space and other user iteracts with it', () => {

      before(() => {
        testName = "removes guide user from the room";
        return common.botRemoveUserFromSpace(testName, framework, userCreatedRoomBot,
          common.userInfo.emails[0], eventsData, 
          1, /* numDisallowedUsersInSpace */
          false, /* isDisallowedUser */);
      });


      // loop through message tests again after guide is removed
      testMessages.forEach((testData) => {
        eventsData = {bot: userCreatedRoomBot};
    
        it(`user says "${testData.msgText}" to disallowed bot`, () => {
          let testName = `user says ${testData.msgText} to disallowed bot`;
          eventsData = {bot: userCreatedRoomBot};
          framework.debug(`${testName} test starting...`);
          return common.userSendMessage(testName, framework, disallowedUser,
            userCreatedRoomBot, eventsData,
            testData.hearsInfo, testData.msgText, testData.msgFiles);
        });

        it(`bot should not respond to ${testData.msgText}`, () => {
          let testName = `bot should not respond to "${testData.msgText}"`;
          let shouldBeAllowed = false;
          framework.debug(`${testName} test starting...`);
          return common.botRespondsToTrigger(testName, framework,
            userCreatedRoomBot, eventsData, shouldBeAllowed);
        });
    
      });
    
      it(`Removes the framework.hears() handlers setup in previous ` + `${testMessages.length * 2} tests`, () => {
        testMessages.forEach((testData) => {
          framework.debug(`Cleaning up framework.hears(${testData.hearsInfo.phrase})...`);
          framework.clearHears(testData.hearsInfo.functionId);
        });
      });
    });

  });  
});

// Run a final set of tests just to ensure that all the bot communication 
// functions are properly disabled when the bot is inactive due to guide mode rules
describe(`Non Guide Creates Room with Bot to validate bot won't communicate proactively`, () => {
  let userCreatedTestRoom, userCreatedRoomBot;
  let eventsData = {};
  // Create a room as user to have test bot which will create other rooms
  before(() => disallowedUser.rooms.create({title: User_Test_Space_Title})
    .then((r) => {
      userCreatedTestRoom = r;
      return validator.isRoom(r);
    }));

  // Add our bot to the room and validate that no spawn event occurs
  // since our bot should not work in when added to a space without a guide
  before(() => common.addBotToSpace('Add Bot to Space', framework,
    userCreatedTestRoom, eventsData, /*shouldFail = */ true, disallowedUser)
    .then((b) => {
      userCreatedRoomBot = b;
      eventsData.bot = b;
    }));

  // Bot leaves rooms
  after(() => {
    if ((!eventsData.bot) || (!userCreatedTestRoom)) {
      return Promise.resolve();
    }
    return common.botLeaveRoom('Bot Leaves Space', framework, eventsData.bot, userCreatedTestRoom, eventsData);
  });

  // User deletes room -- cleanup
  after(() => {
    if (!userCreatedTestRoom) {
      return Promise.resolve();
    }
    return disallowedUser.rooms.remove(userCreatedTestRoom)
      //        .then(() => when.all([membershipDeleted, stopped, despawned]))
      .catch((reason) => {
        console.error('Failed to cleanup test room', reason);
        throw reason;
      });
  });

  describe('Validate that bot communication functions fail in disabled state ', () => {

    it(`validates that bot.say() fails in disallowed state`, () => {
      userCreatedRoomBot.say('This message should never be seen')
        .then(() => {
          return when.reject('bot.say() should have failed but did not');
        })
        .catch((e) => {
          framework.debug(`Got expected error response: ${e.message}`);
          return when(true);
        });
    });

    it(`validates that bot.reply() fails in disallowed state`, () => {
      // Use the last posted message as the parent...
      userCreatedRoomBot.reply(eventsData.message, 'This message should never be seen')
        .then(() => {
          return when.reject('bot.reply() should have failed but did not');
        })
        .catch((e) => {
          framework.debug(`Got expected error response: ${e.message}`);
          return when(true);
        });
    });

    it(`validates that bot.sendCard() fails in disallowed state`, () => {
      let cardJson = require('../common/input-card.json');
      return userCreatedRoomBot.sendCard(cardJson, 'What is your name?')
        .then(() => {
          return when.reject('bot.sendCard() should have failed but did not');
        })
        .catch((e) => {
          framework.debug(`Got expected error response: ${e.message}`);
          return when(true);
        });
    });

    it(`validates that bot.sayWithLocalFile() fails in disallowed state`, () => {
      let filename = './test/flint.jpg';
      return userCreatedRoomBot.sayWithLocalFile('This is a file', filename)
        .then(() => {
          return when.reject('bot.sayWithLocalFile() should have failed but did not');
        })
        .catch((e) => {
          framework.debug(`Got expected error response: ${e.message}`);
          return when(true);
        });
    });

    it(`validates that bot.uploadStream() fails in disallowed state`, () => {
      let fs = require('fs');
      let filename = './test/flint.jpg';
      let stream = fs.createReadStream(filename);
      return userCreatedRoomBot.uploadStream(stream)
        .then(() => {
          return when.reject('bot.uploadStream() should have failed but did not');
        })
        .catch((e) => {
          framework.debug(`Got expected error response: ${e.message}`);
          return when(true);
        });
    });

  });
});
