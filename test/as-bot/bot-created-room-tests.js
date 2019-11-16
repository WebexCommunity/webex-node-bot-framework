// Variables an functions shared by all tests
var common = require("../common/common");
let flint = common.flint;
let userWebex = common.userWebex;
let Bot_Test_Space_Title = common.Bot_Test_Space_Title;
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
  before(() => common.addBotToSpace('Add Bot to Space', flint, userCreatedTestRoom, eventsData)
    .then((b) => {
      userCreatedRoomBot = b;
      return validator.isBot(b);
    }));

  // Bot leaves rooms
  after(() => {
    if ((!userCreatedRoomBot) || (!userCreatedTestRoom)) {
      return Promise.resolve();
    }
    return common.botLeaveRoom('Bot Leaves Space', flint, userCreatedRoomBot, userCreatedTestRoom, eventsData);
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

  describe('Bot Created Rooms Tests', () => {
    let botCreatedRoomBot;
    let testName = 'Default Test Name';
    let message, eventsData = {};
    let triggers = [], messages = [];
    let messageCreatedEvent;
    let hearsHi, hearsFile, hearsAnything, hearsSomeStuff;
    // Create a room as user to have test bot which will create other rooms
    before(() => {
      let testName = 'bot.newRoom() with user as member test';
      return common.botCreateRoom(testName, flint, userCreatedRoomBot, eventsData, common.userInfo.emails[0])
        .then((b) => {
          botCreatedRoomBot = b;
          return validator.isBot(b);
        });
    });

    // Bot deletes room
    after(() => {
      if (!botCreatedRoomBot) {
        return Promise.resolve();
      }
      const membershipDeleted = new Promise((resolve) => {
        common.flintMembershipDeletedHandler('delete room', flint, eventsData, resolve);
      });
      const stopped = new Promise((resolve) => {
        botCreatedRoomBot.stopHandler('delete room', resolve);
      });
      const despawned = new Promise((resolve) => {
        common.flintDespawnHandler('flint init', flint, eventsData, resolve);
      });


      return botCreatedRoomBot.implode()
        .then(() => when.all([membershipDeleted, stopped, despawned]))
        .catch((reason) => {
          console.error('Bot failed to exit room', reason);
        });
    });

    // remove the hears handlers we set up for these tests
    after(() => {
      flint.clearHears(hearsHi);
      flint.clearHears(hearsFile);
      flint.clearHears(hearsAnything);
      flint.clearHears(hearsSomeStuff);
    });

    describe('#user.webex.message.create()', () => {
      // Setup the promises for the events that come from user input that mentions a bot
      beforeEach(() => {
        testName = 'User posts message to bot created room';
        message = {};
        eventsData = { bot: botCreatedRoomBot };
        bot = botCreatedRoomBot;
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
        return common.userSendMessage(testName, flint, userWebex, bot,
          eventsData, hearsInfo, `<@personId:${bot.person.id}> hi`)
          .then((m) => {
            hearsHi = hearsInfo.functionVar;
            message = m;
          });
      });

      it('hears news about a file', () => {
        let testName = 'hears news about a file';
        let hearsInfo = {
          phrase: /.*file.*/igm,
        };
        // Wait for the `files` events (as well as the others)
        flintFilesEvent = new Promise((resolve) => {
          common.flintFilesHandler(testName, flint, eventsData, resolve);
        });
        botFilesEvent = new Promise((resolve) => {
          bot.filesHandler(testName, eventsData, resolve);
        });

        return common.userSendMessage(testName, flint, userWebex, bot,
          eventsData, hearsInfo,
          `<@personId:${bot.person.id}> Here is a file for ya`,
          process.env.HOSTED_FILE)
          .then((m) => {
            message = m;
            hearsFile = hearsInfo.functionVar;
            return when.all([flintFilesEvent, botFilesEvent]);
          });
      });

      it('hears anything via a regex', () => {
        let testName = 'hears anything via a regex';
        let hearsInfo = {
          phrase: /.*/igm,
          helpString: '',
          priority: 99
        };

        return common.userSendMessage(testName, flint, userWebex, bot,
          eventsData, hearsInfo,
          `<@personId:${bot.person.id}>Here is a whole mess of stuff for ya`)
          .then((m) => {
            hearsAnything = hearsInfo.functionVar;
            message = m;
            return when.all([flintFilesEvent, botFilesEvent]);
          });
      });

      it('hears a higher priority regex', () => {
        let testName = 'hears a higher priority regex';
        let hearsInfo = {
          phrase: /.*Some Stuf.*/igm,
          helpString: '',
          priority: 2 // lower number == higher priority
        };

        return common.userSendMessage(testName, flint, userWebex, bot,
          eventsData, hearsInfo,
          `<@personId:${bot.person.id}>Here is a Some Stuff for ya`)
          .then((m) => {
            hearsSomeStuff = hearsInfo.functionVar;
            message = m;
            return when.all([flintFilesEvent, botFilesEvent]);
          });
      });

    });

    describe('#bot.say() using triggers from previous test', () => {
      let trigger, message;
      // Setup the promises for the events that come from user input that mentions a bot
      beforeEach(() => {
        testName = 'Bot posts message to room';
        message = {};
        eventsData = { bot: botCreatedRoomBot };
        flint.messageFormat = 'markdown';

        // Wait for the events associated with a new message before completing test..
        messageCreatedEvent = new Promise((resolve) => {
          common.flintMessageCreatedEventHandler(testName, flint, eventsData, resolve);
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
          if (trigger.message.files) {
            message += `There are also ${trigger.message.files.length} files\n`;
            for (let i = 0; i < trigger.message.files.length; i++) {
              message += `* File${i} Link: ${trigger.message.files[i]}`;
            }
          }
          if (trigger.phrase) {
            message += `\nIt matched the flint.hears() phrase: ${trigger.phrase}`;
          }
          flint.debug(message);
        } else {
          message = '';
        }
      });

      // TODO handle this more eleganty, reading each trigger and message until there are no more
      // Perhaps use the it.each package
      it('responds to the first trigger', () => {
        if (!message) {
          // This can occur if the previous tests failed
          return new Error('Test didn\'t run.  No trigger to respond to');
        }
        return botCreatedRoomBot.say(message)
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

      it('responds to the second trigger', () => {
        if (!message) {
          // This can occur if the previous tests failed
          return new Error('Test didn\'t run.  No trigger to respond to');
        }
        return botCreatedRoomBot.say(message)
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

      it('responds to the third trigger', () => {
        if (!message) {
          // This can occur if the previous tests failed
          return new Error('Test didn\'t run.  No trigger to respond to');
        }
        return botCreatedRoomBot.say(message)
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

      it('responds to the fourth trigger', () => {
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

    describe('bot.sendCard', () => {
      it('sends a card', () => {
        let testName = 'bot sends a card';
        let cardJson = require('../common/input-card.json');

        // Wait for the events associated with a new message before completing test..
        messageCreatedEvent = new Promise((resolve) => {
          common.flintMessageCreatedEventHandler(testName, flint, eventsData, resolve);
        });

        return botCreatedRoomBot.sendCard(cardJson, 'What is your name?')
          .then((m) => {
            message = m;
            assert(validator.isMessage(message),
              `${testName} did not return a valid message`);
            assert((typeof m.attachments === 'object'),
              `${testName} did not return a message with a card attachment`);
            return when(messageCreatedEvent);
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

  });

});