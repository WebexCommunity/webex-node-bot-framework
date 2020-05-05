// Variables an functions shared by all tests
var common = require("../common/common");
let framework = common.framework;
let userWebex = common.userWebex;
let User_Test_Space_Title = common.User_Test_Space_Title;

let assert = common.assert;
let validator = common.validator;
let when = common.when;
let _ = common._;

describe('User Created Room to create a Test Bot', () => {
  let userCreatedTestRoom, userCreatedRoomBot;
  let eventsData = {};

  // Create a room as user to have test bot which will create other rooms
  before(() => userWebex.rooms.create({ title: User_Test_Space_Title })
    .then((r) => {
      userCreatedTestRoom = r;
      return validator.isRoom(r);
    }));

  // Add our bot to the room and validate that it is spawned properly
  before(() => common.addBotToSpace('Add Bot to Space', framework, userCreatedTestRoom, eventsData)
    .then((b) => {
      userCreatedRoomBot = b;
      return validator.isBot(b);
    }));

  // Bot leaves rooms
  after(() => {
    if ((!userCreatedRoomBot) || (!userCreatedTestRoom)) {
      return Promise.resolve();
    }
    return common.botLeaveRoom('Bot Leaves Space', framework, userCreatedRoomBot, userCreatedTestRoom, eventsData);
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

  describe('Bot Membership Tests', () => {
    let botCreatedTestRoom, botCreatedRoomBot;
    let testName = 'Default Test Name';
    let eventsData = {};
    // Create a room as user to have test bot which will create other rooms
    before(() => {
      let testName = 'empty bot.newRoom() test';
      return common.botCreateRoom(testName, framework, userCreatedRoomBot, eventsData)
        .then((b) => {
          botCreatedRoomBot = b;
          botCreatedTestRoom = b.room;
          return when(botCreatedRoomBot);
        });
    });

    // Bot deletes room
    after(() => {
      if ((!botCreatedRoomBot) || (!botCreatedTestRoom)) {
        return Promise.resolve();
      }
      const membershipDeleted = new Promise((resolve) => {
        common.frameworkMembershipDeletedHandler('framework init', framework, eventsData, resolve);
      });
      const stopped = new Promise((resolve) => {
        botCreatedRoomBot.stopHandler('framework init', resolve);
      });
      const despawned = new Promise((resolve) => {
        common.frameworkDespawnHandler('framework init', framework, eventsData, resolve);
      });


      return botCreatedRoomBot.implode()
        .then(() => when.all([membershipDeleted, stopped, despawned]))
        .catch((reason) => {
          console.error('Bot failed to exit room', reason);
        });
    });

    describe('#bot.add, bot.remove, etc', () => {
      // Setup the promises for the events that come from user input that mentions a bot
      beforeEach(() => {
        testName = 'Bot performs membership actions';
        membership = {};
        eventsData = { bot: botCreatedRoomBot };
        bot = botCreatedRoomBot;
      });

      it('adds a user to the room', () => {
        testName = 'adds a user to the room';
        // Wait for the events associated with a new membership before completing test..
        membershipCreatedEvent = new Promise((resolve) => {
          common.frameworkMembershipCreatedHandler(testName, framework, eventsData, resolve);
        });
        frameworkMemberEntersEvent = new Promise((resolve) => {
          common.frameworkMemberEntersHandler(testName, framework, eventsData, resolve);
        });
        botMemberEntersEvent = new Promise((resolve) => {
          botCreatedRoomBot.memberEntersHandler(testName, eventsData, resolve);
        });

        // Add the non-bot user to the space with the bot
        return botCreatedRoomBot.add(common.userInfo.emails[0])
          .then((emails) => {
            assert((emails[0] === common.userInfo.emails[0]),
              'bot.add did not return the expected email');
            // Wait for all the event handlers to fire
            return when.all([membershipCreatedEvent, frameworkMemberEntersEvent, botMemberEntersEvent]);
          })
          .catch((e) => {
            console.error(`${testName} failed: ${e.message}`);
            return Promise.reject(e);
          });
      });

      // Need to research if this is still allowed (as the bot)
      // it('makes the user a moderator', () => {
      //   testName = 'makes user a moderator';
      //   // Wait for the events associated with a new membership before completing test..
      //   membershipUpdateEvent = new Promise((resolve) => {
      //     frameworkMembershipUpdatedHandler(testName, framework, eventsData, resolve);
      //   });
      //   frameworkMemberAddedAsModerator = new Promise((resolve) => {
      //     frameworkMemberAddedAsModeratorHandler(testName, framework, eventsData, resolve);
      //   });
      //   botMemberAddedAsModerator = new Promise((resolve) => {
      //     botCreatedRoomBot.memberAddedAsModerator(testName, eventsData, resolve);
      //   });

      //   // Add the non-bot user to the space with the bot
      //   return botCreatedRoomBot.moderatorSet(user.emails[0])
      //     .then((emails) => {
      //       assert((emails[0] === user.emails[0]),
      //         'bot.add did not return the expected email');
      //       // Wait for all the event handlers to fire
      //       return when.all([membershipUpdateEvent, frameworkMemberAddedAsModerator, botMemberAddedAsModerator]);
      //     })
      //     // .then(() => {
      //     //   // triggers.push(eventsData.trigger);
      //     //   // assert(validator.objIsEqual(message, eventsData.message),
      //     //   //   'message returned by API did not match the one from the messageCreated event');
      //     //   return heard;
      //     // })
      //     .catch((e) => {
      //       console.error(`${testName} failed: ${e.message}`);
      //       return Promise.reject(e);
      //     });
      // });

      it('removes a user from the room', () => {
        testName = 'removes a user from the room';
        // Wait for the events associated with a new membership before completing test..
        membershipDeletedEvent = new Promise((resolve) => {
          common.frameworkMembershipDeletedHandler(testName, framework, eventsData, resolve);
        });
        frameworkMemberExitsEvent = new Promise((resolve) => {
          common.frameworkMemberExitsHandler(testName, framework, eventsData, resolve);
        });
        botMemberExitsEvent = new Promise((resolve) => {
          botCreatedRoomBot.memberExitsHandler(testName, eventsData, resolve);
        });

        // Add the non-bot user to the space with the bot
        return botCreatedRoomBot.remove(common.userInfo.emails[0])
          .then((emails) => {
            assert((emails[0] === common.userInfo.emails[0]),
              'bot.remove did not return the expected email');
            // Wait for all the event handlers to fire
            return when.all([membershipDeletedEvent, frameworkMemberExitsEvent, botMemberExitsEvent]);
          })
          .catch((e) => {
            console.error(`${testName} failed: ${e.message}`);
            return Promise.reject(e);
          });
      });
    });
  });
});