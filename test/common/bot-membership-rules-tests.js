// Variables an functions shared by all tests
var common = require("../common/common");
let framework = common.framework;
let userWebex = common.userWebex;
let User_Test_Space_Title = common.User_Test_Space_Title;

let assert = common.assert;
let validator = common.validator;
let when = common.when;

describe('User Created Room to create a Test Bot', () => {
  let userCreatedTestRoom, userCreatedRoomBot;
  let eventsData = {};

  // Create a room as user to have test bot which will create other rooms
  before(() => userWebex.rooms.create({title: User_Test_Space_Title})
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
    let testName = 'Bot Membership Tests';
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
        common.frameworkMembershipDeletedHandler(testName, framework, eventsData, resolve);
      });
      let despawned, stopped;
      if (botCreatedRoomBot.active) {
        stopped = new Promise((resolve) => {
          botCreatedRoomBot.stopHandler('testName', resolve);
        });
        despawned = new Promise((resolve) => {
          common.frameworkDespawnHandler(testName, framework, eventsData, resolve);
        });
      } else {
        // Our real despawn event will be "swallowed" if membership rules already did it
        stopped = Promise.resolve(true);
        despawned = new Promise((resolve) => {
          common.frameworkMembershipRulesEventHandler(testName, framework, ['despawn'], eventsData, false, resolve);
        });
      }


      return botCreatedRoomBot.implode()
        .then(() => when.all([membershipDeleted, stopped, despawned]))
        .catch((reason) => {
          console.error('Bot failed to exit room', reason);
        });
    });

    describe('Add allowed user to space with bot and interact with it', () => {
      let triggers = [];
      let messages = [];

      // Setup the promises for the events that come from user input that mentions a bot
      beforeEach(() => {
        testName = 'Bot performs membership actions';
        membership = {};
        eventsData = {bot: botCreatedRoomBot};
        bot = botCreatedRoomBot;
      });

      it('adds the allowed user to the room', () => {
        testName = 'adds an allowed user to the room';
        return common.botAddUsersToSpace(testName, framework, botCreatedRoomBot,
          [common.userInfo.emails[0]], eventsData);
      });

      describe('#send messages while the bot is active', () => {
        // Setup the promises for the events that come from user input that mentions a bot
        beforeEach(() => {
          testName = 'User posts message to bot created room';
          message = {};
          eventsData = {bot: bot};
        });

        afterEach(() => {
          messages.push(eventsData.message);
          triggers.push(eventsData.trigger);
          assert(validator.objIsEqual(message, eventsData.message),
            'message returned by API did not match the one from the messageCreated event');

        });

        it('hears the user say hi', () => {
          let testName = 'hears the user say hi';
          let hearsInfo = {
            phrase: 'hi'
          };
          return common.userSendMessage(testName, framework, userWebex, bot,
            eventsData, hearsInfo, `hi`)
            .then((m) => {
              hearsHi = hearsInfo.functionVar;
              message = m;
            });
        });

      });

      describe('#bot respond using triggers from previous test', () => {
        let trigger, message;
        // Setup the promises for the events that come from user input that mentions a bot
        beforeEach(() => {
          testName = 'Bot posts message to room';
          message = {};
          eventsData = {bot: bot};
          framework.messageFormat = 'markdown';

          // Wait for the events associated with a new message before completing test..
          messageCreatedEvent = new Promise((resolve) => {
            common.frameworkMessageCreatedEventHandler(testName, framework, eventsData, resolve);
          });
        });

        // Build a message with the trigger
        beforeEach(() => {
          trigger = triggers.shift();
          userMessage = messages.shift();
          if (trigger) {
            message = `I heard the entry from ${trigger.person.displayName}:\n`;
            message += (trigger.message.text) ? `* text: ${trigger.message.text}\n` : '';
            message += (trigger.message.html) ? `* html: ${trigger.message.html}\n` : '';
            framework.debug(message);
          } else {
            message = '';
          }
        });

        it('responds to the first trigger', () => {
          if (!message) {
            // This can occur if the previous tests failed
            return new Error('Test didn\'t run.  No trigger to respond to');
          }
          return bot.say(message)
            .then((m) => {
              message = m;
              assert(validator.isMessage(message),
                'create message did not return a valid message');
              return when.all([messageCreatedEvent]);
            })
            .then(() => {
              assert(validator.objIsEqual(message, eventsData.message),
                'message returned by API did not match the one from the messageCreated event');
              return when(true);
            })
            .catch((e) => {
              console.error(`${testName} failed: ${e.message}`);
              return Promise.reject(e);
            });
        });

      });

      describe('Adds and removes a disallowed user to the space', () => {

        //it('adds the disallowed users', () => {
        before(() => {
          testName = 'adds a disallowed user to the room';
          return common.botAddUsersToSpace(testName, framework, botCreatedRoomBot,
            [common.disallowedUserPerson.emails[0]], eventsData);
        });

        after(() => {
          testName = "removes a disallowed user from the room";
          return common.botRemoveUserFromSpace(testName, framework, botCreatedRoomBot,
            common.disallowedUserPerson.emails[0], eventsData);

        });

        it('user say hi after bot was deactivated', () => {
          let testName = 'user say hi after bot was deactivated';
          let hearsInfo = {
            phrase: 'hi'
          };
          return common.userSendMessage(testName, framework, userWebex, botCreatedRoomBot,
            eventsData, hearsInfo, `hi`);
        });

      });

    });
  });
});