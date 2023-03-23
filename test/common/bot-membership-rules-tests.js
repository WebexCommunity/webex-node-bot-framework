// Variables an functions shared by all tests
const { doesNotMatch } = require("assert");
var common = require("../common/common");
let tm = require("../common/test-messages")
let framework = common.framework;
let userWebex = common.userWebex;
let testInfo = common.eventsData;
let disallowedUser = common.getDisallowedUser();
let User_Test_Space_Title = common.User_Test_Space_Title;

let assert = common.assert;
let validator = common.validator;
let when = common.when;

describe('User Created Room to create a Test Bot', () => {
  let userCreatedTestRoom, userCreatedRoomBot;
  // Create a room as user to have test bot which will create other rooms
  before(() => userWebex.rooms.create({title: User_Test_Space_Title})
    .then((r) => {
      userCreatedTestRoom = r;
      return validator.isRoom(r);
    }));

  // Add our bot to the room and validate that it is spawned properly
  before(() => {
    testInfo.config.testName = 'Add Bot to Space';
    testInfo.config.roomUnderTest = userCreatedTestRoom;
    return common.addBotToSpace(framework, testInfo)
      .then((b) => {
        userCreatedRoomBot = b;
        return validator.isBot(b);
      })
  });

  // Bot leaves rooms
  after(() => {
    if ((!userCreatedRoomBot) || (!userCreatedTestRoom)) {
      return Promise.resolve();
    }
    testInfo.testName = 'Bot Leaves Space';
    testInfo.bot = userCreatedRoomBot;
    return common.botLeaveRoom('Bot Leaves Space', framework, userCreatedRoomBot, testInfo);
  });

  // User deletes room -- cleanup
  after(() => {
    if (!userCreatedTestRoom) {
      return Promise.resolve();
    }
    return userWebex.rooms.remove(userCreatedTestRoom)
      //        .then(() => when.all([membershipDeleted, stopped, despawned]))
      .catch((reason) => {
        console.error('Failed to cleanup test room', reason);
        throw reason;
      });
  });

  describe('Bot Creates Room and Adds Member', () => {
    let botCreatedTestRoom, botCreatedRoomBot;
    // Create a room as user to have test bot which will create other rooms
    before(() => {
      testInfo.testName = 'Bot creates new room test';
      return common.botCreateRoom(testInfo.testName, framework, userCreatedRoomBot, testInfo)
        .then((b) => {
          botCreatedRoomBot = b;
          botCreatedTestRoom = b.room;
          testInfo.bot = b;
          return when(botCreatedRoomBot);
        });
    });

    // Bot deletes room
    after(() => {
      if ((!botCreatedRoomBot) || (!botCreatedTestRoom)) {
        return Promise.resolve();
      }
      testInfo.testName = 'bot deletes room it created'
      return common.botDeletesRoom(testInfo.testName, framework, 
        botCreatedRoomBot, testInfo, /*numOtherUsers == */1);
    });

    describe('Bot adds and removes allowed user to space who iteracts with bot', () => {
      before(() => {
        testInfo.testName = 'bot adds an allowed user to the room';
        return common.botAddUsersToSpace(testInfo.testName, framework, botCreatedRoomBot,
          [common.userInfo.emails[0]], testInfo);
      });

      after(() => {
        testInfo.testName = "removes allowed user from the room";
        return common.botRemoveUserFromSpace(testInfo.testName, framework, botCreatedRoomBot,
          common.userInfo.emails[0], testInfo, 
          0, /* numDisallowedUsersInSpace */
          false, /* isDisallowedUser */);
      });


      // loop through message tests..
        common.runMessages(tm.testMessages,framework, testInfo, 
          userWebex, /* botShouldRespond = */true);

      describe('Adds and removes a disallowed user to the space', () => {
        before(() => {
          testInfo.testName = 'adds a disallowed user to the room';
          return common.botAddUsersToSpace(testInfo.testName, framework, botCreatedRoomBot,
            [common.disallowedUserPerson.emails[0]], testInfo)
            .then(() => {
              assert((!botCreatedRoomBot.active),
                "After adding dissallowed user, bot did move to inactive state.");
            });
        });

        // TODO -- replace this with a botDeletesRoom to test deleting a room with an inactive bot
        // If I do this I have to repeat having the bot create the room again
        after('removes the disallowed user to re-enable room',() => {
          testInfo.testName = 'removes the disallowed user to re-enable room';
          return common.botRemoveUserFromSpace(testInfo.testName, framework, botCreatedRoomBot,
            common.disallowedUserPerson.emails[0], testInfo,
            1, /* numDisallowedUsersInSpace */
            true, /* isDisallowedUser */);
        });

      // loop through message tests..
      common.runMessages(tm.testMessages,framework, testInfo, 
        userWebex, /* botShouldRespond = */false);
      // // loop through message tests..
      //   tm.testMessages.forEach((testData) => {

      //     it(`user says "${testData.msgText}" to disallowed bot`, () => {
      //       testInfo.testName = `user says ${testData.msgText} to disallowed bot`;
      //       framework.debug(`${testInfo.testName} test starting...`);
      //       return common.userSendMessage(testInfo.testName, framework, userWebex,
      //         botCreatedRoomBot, testInfo, testData);
      //     });

      //     it(`bot shouldn't respond to ${testData.msgText}`, () => {
      //       testInfo.testName = `bot shouldn't respond to "${testData.msgText}"`;
      //       let shouldBeAllowed = false;
      //       framework.debug(`${testInfo.testName} test starting...`);
      //       return common.botRespondsToTrigger(testInfo.testName, framework,
      //         botCreatedRoomBot, testInfo, shouldBeAllowed);
      //     });

      //     it(`clears framework.hears for ${testData.msgText}`, () => {
      //       testData.hearsInfo.forEach((info) => {
      //         framework.clearHears(info.functionId);
      //       });
      //     });
      //   });

        it(`validates that bot.say() fails in disallowed state`, () => {
          botCreatedRoomBot.say('This message should never be seen')
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
          botCreatedRoomBot.reply(testInfo.message, 'This message should never be seen')
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
          return botCreatedRoomBot.sendCard(cardJson, 'What is your name?')
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
          return botCreatedRoomBot.sayWithLocalFile('This is a file', filename)
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
          return botCreatedRoomBot.uploadStream(stream)
            .then(() => {
              return when.reject('bot.uploadStream() should have failed but did not');
            })
            .catch((e) => {
              framework.debug(`Got expected error response: ${e.message}`);
              return when(true);
            });
        });

        it(`validates that bot.dm fails with disallowed user email`, () => {
          return botCreatedRoomBot.dm(common.disallowedUserPerson.emails[0])
            .then(() => {
              return when.reject('bot.dm() should have failed but did not');
            })
            .catch((e) => {
              framework.debug(`Got expected error response: ${e.message}`);
              return when(true);
            });
        });

        it(`validates that bot.dm fails with disallowed personId`, () => {
          return botCreatedRoomBot.dm(common.disallowedUserPerson.id)
            .then(() => {
              return when.reject('bot.dm() should have failed but did not');
            })
            .catch((e) => {
              framework.debug(`Got expected error response: ${e.message}`);
              return when(true);
            });
        });

      });
    });

    describe('Bot adds allowed and 2 disallowed users to space who iteract with bot', () => {

      before(() => {
        testInfo.testName = 'adds one allowed to disallowed users to the room';
        return common.botAddUsersToSpace(testInfo.testName, framework, botCreatedRoomBot,
          [common.userInfo.emails[0], common.disallowedUserPerson.emails[0],
            process.env.ANOTHER_DISALLOWED_USERS_EMAIL], testInfo);
      });

      // loop through message tests..
      common.runMessages(tm.testMessages,framework, testInfo, 
        disallowedUser, /* botShouldRespond = */false);
    // // loop through message tests from disallowed user
    //   tm.testMessages.forEach((testData) => {

    //     it(`allowed user says ${testData.msgText}`, () => {
    //       testInfo.testName = `allowed user says ${testData.msgText}`;
    //       return common.userSendMessage(testInfo.testName, framework, disallowedUser,
    //         botCreatedRoomBot, testInfo, testData);
    //     });

    //     it(`bot shouldn't respond to ${testData.msgText} from allowed user`, () => {
    //       testInfo.testName = `bot shouldn't respond to ${testData.msgText} from allowed user`;
    //       let shouldBeAllowed = false;
    //       return common.botRespondsToTrigger(testInfo.testName, framework,
    //         botCreatedRoomBot, testInfo, shouldBeAllowed);
    //     });

    //     it(`clears framework.hears for ${testData.msgText}`, () => {
    //       testData.hearsInfo.forEach((info) => {
    //         framework.clearHears(info.functionId);
    //       });
    //     });

    //   });


      describe('Removes the first disallowed user to the space', () => {

        before(() => {
          testInfo.testName = 'Removes the first disallowed user to the space';
          return common.botRemoveUserFromSpace(testInfo.testName, framework, botCreatedRoomBot,
            process.env.ANOTHER_DISALLOWED_USERS_EMAIL, testInfo,
            2, /* numDisallowedUsersInSpace */
            true, /* isDisallowedUser */)
            .then(() => {
              assert((!botCreatedRoomBot.active),
                "After removing only the first dissallowed user, bot returned to active state.");
            });
        });

      // loop through message tests..
      common.runMessages(tm.testMessages,framework, testInfo, 
        userWebex, /* botShouldRespond = */false);
      // // loop through message tests..
      //   tm.testMessages.forEach((testData) => {

      //     it(`user says "${testData.msgText}" to disallowed bot`, () => {
      //       testInfo.testName = `user says ${testData.msgText} to disallowed bot`;
      //       framework.debug(`${testInfo.testName} test starting...`);
      //       return common.userSendMessage(testInfo.testName, framework, userWebex,
      //         botCreatedRoomBot, testInfo, testData);
      //     });

      //     it(`bot should not respond to ${testData.msgText}`, () => {
      //       testInfo.testName = `bot should not respond to "${testData.msgText}"`;
      //       let shouldBeAllowed = false;
      //       framework.debug(`${testInfo.testName} test starting...`);
      //       return common.botRespondsToTrigger(testInfo.testName, framework,
      //         botCreatedRoomBot, testInfo, shouldBeAllowed);
      //     })

      //     it(`clears framework.hears for ${testData.msgText}`, () => {
      //       testData.hearsInfo.forEach((info) => {
      //         framework.clearHears(info.functionId);
      //       });
      //     });
      //   });

      });

      describe('Removes the last disallowed user to the space', () => {

        before(() => {
          testInfo.testName = 'Removes the last disallowed user to the space';
          return common.botRemoveUserFromSpace(testInfo.testName, framework, botCreatedRoomBot,
            common.disallowedUserPerson.emails[0], testInfo,
            1, /* numDisallowedUsersInSpace */
            true, /* isDisallowedUser */)
            .then(() => {
              assert(botCreatedRoomBot.active,
                "After removing dissallowed user, bot did not return to active state.");
            });
        });

      // loop through message tests..
      common.runMessages(tm.testMessages,framework, testInfo, 
        userWebex, /* botShouldRespond = */true);
      // loop through message tests..
        // tm.testMessages.forEach((testData) => {

        //   it(`user says "${testData.msgText}" to allowed bot`, () => {
        //     testInfo.testName = `user says ${testData.msgText} to disallowed bot`;
        //     framework.debug(`${testInfo.testName} test starting...`);
        //     return common.userSendMessage(testInfo.testName, framework, userWebex,
        //       botCreatedRoomBot, testInfo, testData);
        //   });

        //   it(`bot should respond to ${testData.msgText}`, () => {
        //     testInfo.testName = `bot should respond to "${testData.msgText}"`;
        //     let shouldBeAllowed = true;
        //     framework.debug(`${testInfo.testName} test starting...`);
        //     return common.botRespondsToTrigger(testInfo.testName, framework,
        //       botCreatedRoomBot, testInfo, shouldBeAllowed);
        //   });

        //   it(`clears framework.hears for ${testData.msgText}`, () => {
        //     testData.hearsInfo.forEach((info) => {
        //       framework.clearHears(info.functionId);
        //     });
        //   });  

        // });

      });
    });
  });
});

