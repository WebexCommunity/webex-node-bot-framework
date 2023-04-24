// Variables an functions shared by all tests
const when = require("when");
var common = require("../common/common");
let tm = require("../common/test-messages")
let btm = require("../common/bot-test-messages")

let framework = common.framework;
let testInfo = common.testInfo;
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
  {"membershipRulesDisallowedResponse": "No guides in this space, so I ain't working",
   "membershipRulesStateMessageResponse": "Can't answer ya pal. No guides in this space",
   "membershipRulesAllowedResponse": "Yay, there is a guide here.  I can work now!"}
 ]

paramCombos.forEach(function(paramCombo, testIndex) {
  describe(`Non Guide Creates Room with Bot for test ${testIndex + 1}`, () => {
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
        testInfo.config.roomUnderTest = r;
        testInfo.config.userUnderTest = disallowedUser;
          return validator.isRoom(r);
      }));

    // Add our bot to the room and validate that no spawn event occurs
    // since our bot should not work in when added to a space without a guide
    before(() => {
      testInfo.config.testName = 'Disallowed User Adds Bot to Space';
      return common.addBotToSpace(framework, testInfo, /*shouldFail = */ true)
        .then((b) => {
          testInfo.config.botUnderTest = b;
        });
      });

    // Bot leaves rooms
    after(() => {
      testInfo.config.testName = 'Bot Leaves Space';
      return common.botLeaveSpace(framework, testInfo);
    });

    // User deletes room -- cleanup
    after(() => {
      delete testInfo.config.botUnderTest;
      return disallowedUser.rooms.remove(testInfo.config.roomUnderTest)
        .catch((reason) => {
          console.error('Failed to cleanup test room', reason);
          throw reason;
        });
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

    describe('Bot adds guide user to space and iteracts with bot', () => {
      before(() => {
        testInfo.config.testName = 'bot adds a guide user to the room';
        return common.botAddUsersToSpace(framework, testInfo,
          [common.userPerson.emails[0]]);
      });

      describe('User sends message and bot should respond', () => {
        // loop through user message tests..
        tm.runUserMessageTests(framework, testInfo, tm.testMessages,
          /* botShouldRespond = */true);
      });
    });


    describe('Bot removes guide user from space and other user iteracts with it', () => {

      before(() => {
        testName = "removes guide user from the room";
        return common.botRemoveUserFromSpace(framework, testInfo,
          common.userPerson.emails[0], 1, /* numDisallowedUsersInSpace */
          false, /* isDisallowedUser */);
      });


      describe('User sends message and bot should no longer respond', () => {
        // loop through user message tests..
        tm.runUserMessageTests(framework, testInfo, tm.testMessages,
          /* botShouldRespond = */false);
      });
    });

  });  
});

