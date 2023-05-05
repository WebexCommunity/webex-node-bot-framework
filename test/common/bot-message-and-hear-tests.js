// Variables and functions shared by all tests
let common = require('../common/common');
let tm = require('../common/test-messages');
let btm = require('../common/bot-test-messages');

let framework = common.framework;
let testInfo = common.testInfo;


describe('User Created Room to create a Test Bot', () => {
  // Add the common setup/tear down logic for initial test space
  let userCreatedSpace = require('../common/before-after-user-created-room.js');
  userCreatedSpace.registerBeforeAndAfterHooks();

  describe('User sends message and bot may respond', () => {
    // loop through user message tests..
    tm.runUserMessageTests(framework, testInfo, tm.testMessages);
    ///* botShouldRespond = */true);
  });

  describe('bot sends messages', () => {
    // loop through bot message tests..
    btm.runBotMessageTests(framework, testInfo, btm.botTestMessages); 
    ///* shouldFail = */false);
  });

  describe('Bot Created Rooms Tests', () => {
    // Add the common setup/tear down logic for initial test space
    let botCreatedSpace = require('../common/before-after-bot-created-room.js');
    botCreatedSpace.registerBeforeAndAfterHooks();

    describe('Bot adds a user to space who iteracts with bot', () => {
      before(() => {
        testInfo.config.testName = 'bot adds an allowed user to the room';
        return common.botAddUsersToSpace(framework, testInfo,
          [common.userPerson.emails[0]]);
      });

      after(() => {
        testInfo.config.testName = 'removes allowed user from the room';
        return common.botRemoveUserFromSpace(framework, testInfo, common.userPerson.emails[0], 
          0, /* numDisallowedUsersInSpace */
          false, /* isDisallowedUser */);
      });

      describe('User sends message and bot may respond', () => {
        // loop through user message tests..
        tm.runUserMessageTests(framework, testInfo, tm.testMessages);
      });
    
      describe('bot sends messages', () => {
        // loop through bot message tests..
        btm.runBotMessageTests(framework, testInfo, btm.botTestMessages); 
        ///* shouldFail = */false);
      });
    
    });
  });

});
