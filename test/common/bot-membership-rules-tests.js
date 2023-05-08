// Variables an functions shared by all tests
var common = require('../common/common');
let tm = require('../common/test-messages');
let btm = require('../common/bot-test-messages');

let framework = common.framework;
let userWebex = common.userWebex;
let testInfo = common.testInfo;
let disallowedUser = common.getDisallowedUser();

let assert = common.assert;

describe('User Created Room to create a Test Bot', () => {
  // Add the common setup/tear down logic for initial test space
  let userCreatedSpace = require('../common/before-after-user-created-room.js');
  userCreatedSpace.registerBeforeAndAfterHooks();

  describe('Bot Creates Room and Adds Member', () => {
    // Add the common setup/tear down logic for the bot created space
    let botCreatedSpace = require('../common/before-after-bot-created-room.js');
    botCreatedSpace.registerBeforeAndAfterHooks();

    describe('Bot adds and removes allowed user to space who iteracts with bot', () => {
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
        tm.runUserMessageTests(framework, testInfo, tm.testMessages,
          /* botShouldRespond = */true);
      });

      describe('Adds and removes a disallowed user to the space', () => {
        before(() => {
          testInfo.config.testName = 'adds a disallowed user to the room';
          return common.botAddUsersToSpace(framework, testInfo,
            [common.disallowedUserPerson.emails[0]])
            .then(() => {
              assert((!testInfo.config.botUnderTest.active),
                'After adding dissallowed user, bot did not move to inactive state.');
            });
        });

        after('removes the disallowed user to re-enable room',() => {
          testInfo.config.testName = 'removes the disallowed user to re-enable room';
          return common.botRemoveUserFromSpace(framework, testInfo, 
            common.disallowedUserPerson.emails[0],
            1, /* numDisallowedUsersInSpace */
            true, /* isDisallowedUser */);
        });

        describe('User sends message and bot should not respond', () => {
          // loop through user message tests..
          tm.runUserMessageTests(framework, testInfo, tm.testMessages,
            /* botShouldRespond = */false);
        });
      
        describe('disabled bot attempts sends messages', () => {
          // loop through bot message tests..
          btm.runBotMessageTests(framework, testInfo, btm.botTestMessages,
            /* shouldFail = */true);
        });

      });
    });

    describe('Bot adds allowed and 2 disallowed users to space who iteract with bot', () => {

      before(() => {
        testInfo.config.testName = 'adds one allowed to disallowed users to the room';
        testInfo.config.userUnderTest = disallowedUser;
        return common.botAddUsersToSpace(framework, testInfo,
          [common.userPerson.emails[0], common.disallowedUserPerson.emails[0],
            process.env.ANOTHER_DISALLOWED_USERS_EMAIL]);
      });

      describe('User sends message and bot should not respond', () => {
        // loop through user message tests..
        tm.runUserMessageTests(framework, testInfo, tm.testMessages,
          /* botShouldRespond = */false);
      });
    
      describe('Removes the first disallowed user to the space', () => {

        before(() => {
          testInfo.config.testName = 'Removes the first disallowed user to the space';
          testInfo.config.userUnderTest = userWebex;
          return common.botRemoveUserFromSpace(framework, testInfo, 
            process.env.ANOTHER_DISALLOWED_USERS_EMAIL,
            2, /* numDisallowedUsersInSpace */
            true, /* isDisallowedUser */)
            .then(() => {
              assert((!testInfo.config.botUnderTest.active),
                'After removing only the first dissallowed user, bot returned to active state.');
            });
        });

        describe('User sends message and bot should not respond', () => {
          // loop through user message tests..
          tm.runUserMessageTests(framework, testInfo, tm.testMessages,
            /* botShouldRespond = */false);
        });
      
      });

      describe('Removes the last disallowed user to the space', () => {

        before(() => {
          testInfo.config.testName = 'Removes the last disallowed user to the space';
          testInfo.config.userUnderTest = userWebex;
          return common.botRemoveUserFromSpace(framework, testInfo, 
            common.disallowedUserPerson.emails[0],
            1, /* numDisallowedUsersInSpace */
            true, /* isDisallowedUser */)
            .then(() => {
              assert(testInfo.config.botUnderTest.active,
                'After removing dissallowed user, bot did not return to active state.');
            });
        });

        describe('User sends message and bot should respond', () => {
          // loop through user message tests..
          tm.runUserMessageTests(framework, testInfo, tm.testMessages,
            /* botShouldRespond = */true);
        });
      
        describe('re-enabled bot attempts to send messages', () => {
          // loop through bot message tests..
          btm.runBotMessageTests(framework, testInfo, btm.botTestMessages,
            /* shouldFail = */false);
        });

      });
    });
  });
});

