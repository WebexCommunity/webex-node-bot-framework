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

  describe('bot storage tests', () => {

    //If the framework options included and initial storage config
    // make sure these elements have been added to the newly created bot
    it('checks the initial bot storage config is correct', () => {
      let testName = 'checks the initial bot storage config is correct';
      let storagePromises = [];
      let initValues = [];
      bot = userCreatedRoomBot;

      if (typeof framework.initBotStorageData === 'object') {
      } else {
        framework.debug('Skipping init storage test as not initial storage was found');
        return when(true);
      }

      for (let entry of Object.entries(framework.initBotStorageData)) {
        storagePromises.push(bot.recall(entry[0]));
        initValues.push({ key: entry[0], value: entry[1] });
      }
      if (storagePromises.length === 0) {
        framework.debug('No initial config set, no values checked');
        return Promise.resolve(true);
      }

      return when.all(storagePromises)
        .then((storagePromises) => {
          assert(((initValues.length === storagePromises.length)),
            `bot initial storage tests did not find all ${initValues.length} key/value pairs`);
          let objCount = 0;
          for (result of initValues) {
            if (typeof result.value === 'object') {
              objCount += 1; //indexOf is sketchy with objects
              continue;
            }
            let foundIndex = storagePromises.indexOf(result.value);
            if (foundIndex == -1) {
              return Promise.reject(new Error(`${testName} failed: ` +
                `Did not find value "${result.value}" ` +
                `for key "${result.key}" in the inital bot storage.`));
            }
            storagePromises.splice(foundIndex, 1);
          }
          // Since we didn't lookup objects, at least confirm the number of objects match
          if (storagePromises.length !== objCount) {
            return Promise.reject(new Error(`${testName} failed: ` +
              `Expected to find ${objCount}` +
              `objects in bot's initial data but found ${storagePromises.length}`));
          }
          return when(true);
        })
        .catch((e) => {
          console.error(`${testName} failed: ${e.message}`);
          return when.reject(e);
        });
    });

    //If so check what data was avaiable after the spawn event
    it('sets and checks some storage elements', () => {
      let testName = 'sets and checks some storage elements';
      testString = 'testStringVal';
      testObject = { key1: 'val1', key2: 'val2' };
      bot = userCreatedRoomBot;

      return bot.store('testString', testString)
        .then(() => bot.store('testObject', testObject))
        .then(() => bot.recall('testString'))
        .then((result) => {
          assert((result === testString),
            `${testName}: Expected bot.recall('testString') to return ${testString}, got ${result}`);
          return bot.recall('testObject');
        })
        .then((result) => {
          assert((validator.objIsEqual(result, testObject)),
            `${testName}: Expected bot.recall('testObject') to return ${testObject}, got ${result}`);
          return bot.forget('testString');
        })
        .then(() => bot.forget('testObject'))
        .catch((e) => {
          console.error(`testname failed: ${e.message}`);
          return when.reject(e);
        });
    });

    it('checks for forgotten testString', () => {
      let element = 'testString';
      let testName = `check for non existent storage element ${element}`;
      bot = userCreatedRoomBot;

      return bot.recall(element)
        .then((result) => {
          let msg = `${testName} got a result of ${result} for bot.recall('${element}').  Expected a reject`;
          return when.reject(new Error(msg));
        })
        .catch((e) => {
          framework.debug(`Got expected reject: ${e.message}, for bot.recall('${element}') test.`);
          return when(true);
        });
    });

    it('sets elements without waiting', () => {
      let testName = 'sets elements without waiting';
      bot = userCreatedRoomBot;
      testString = 'testStringVal';
      testObject = { key1: 'val1', key2: 'val2' };
      let storagePromises = [];

      storagePromises.push(bot.store('testString', testString));
      storagePromises.push(bot.store('testObject', testObject));
      return when.all(storagePromises)
        .then(() => {
          storagePromises = [];
          storagePromises.push(bot.recall('testString'));
          storagePromises.push(bot.recall('testObject'));
          return when.all(storagePromises);
        })
        .then((storedValues) => {
          assert(((typeof storedValues === 'object') && (storedValues.length === 2)),
            'bot.recall tests did not resolve promises as expected!');
          for (result of storedValues) {
            if (typeof result === 'string') {
              assert((result === testString),
                `${testName}: Expected bot.recall('testString') to return ${testString}, got ${result}`);
            } else if (typeof result === 'object') {
              assert((validator.objIsEqual(result, testObject)),
                `${testName}: Expected bot.recall('testObject') to return ${testObject}, got ${result}`);
            } else {
              return when.reject(new Error('Got unexecpted return value in bot.recall tests'));
            }
          }
          storagePromises = [];
          storagePromises.push(bot.forget('testString'));
          storagePromises.push(bot.forget('testObject'));
          return when.all(storagePromises);
        })
        .catch((e) => {
          console.error(`testname failed: ${e.message}`);
          return when.reject(e);
        });
    });

    it('checks for forgotten testString', () => {
      let element = 'testString';
      let testName = `check for non existent storage element ${element}`;
      bot = userCreatedRoomBot;

      return bot.recall(element)
        .then((result) => {
          let msg = `${testName} got a result of ${result} for bot.recall('${element}').  Expected a reject`;
          return when.reject(new Error(msg));
        })
        .catch((e) => {
          framework.debug(`Got expected reject: ${e.message}, for bot.recall('${element}') test.`);
          return when(true);
        });
    });

    it('checks for forgotten testObject', () => {
      let element = 'testObject';
      let testName = `check for non existent storage element ${element}`;
      bot = userCreatedRoomBot;

      return bot.recall(element)
        .then((result) => {
          let msg = `${testName} got a result of ${result} for bot.recall('${element}').  Expected a reject`;
          return when.reject(new Error(msg));
        })
        .catch((e) => {
          framework.debug(`Got expected reject: ${e.message}, for bot.recall('${element}') test.`);
          return when(true);
        });
    });

    it('tries to forget a non existing storage element', () => {
      let element = 'testObject';
      let testName = `tries to forget a non existing storage element: ${element}`;
      bot = userCreatedRoomBot;

      return bot.forget(element)
        .then((result) => {
          let msg = `${testName} got a result of ${result} for bot.recall('${element}').  Expected a reject`;
          return when.reject(new Error(msg));
        })
        .catch((e) => {
          framework.debug(`Got expected reject: ${e.message}, for bot.forget('${element}') test.`);
          return when(true);
        });
    });

    it('tries to write bot metrics', () => {
      let testName = `tries to write bot metrics'`;
      bot = userCreatedRoomBot;

      return bot.writeMetric({ event: 'frameworkUnitTestWithActor' }, common.userInfo)
        .then((result) => {
          framework.debug('Succesfully wrote metrics data:');
          framework.debug(result);
        })
        .catch((e) => {
          if (typeof process.env.MONGO_USER !== 'string') {
            // Extend as other providers support this method
            framework.debug(`${testName}" Got expected reject when working ` +
              `with non Mongo storage provider: ${e.message}`);
            return when(true);
          } else if (typeof process.env.MONGO_BOT_METRICS !== 'string') {
            // Extend as other providers support this method
            framework.debug(`${testName}" Got expected reject when working ` +
              `with non Mongo storage provider with no metrics collection specific: ${e.message}`);
            return when(true);
          } else
            return when.reject(e);
        });
    });

    it('tries to write bot metrics with actorId', () => {
      let testName = `tries to write bot metrics with actorId`;
      bot = userCreatedRoomBot;

      return bot.writeMetric({ event: 'frameworkUnitTestWithActorId' }, common.userInfo.id)
        .then((result) => {
          framework.debug('Succesfully wrote metrics data:');
          framework.debug(result);
        })
        .catch((e) => {
          if (typeof process.env.MONGO_USER !== 'string') {
            // Extend as other providers support this method
            framework.debug(`${testName}" Got expected reject when working ` +
              `with non Mongo storage provider: ${e.message}`);
            return when(true);
          } else if (typeof process.env.MONGO_BOT_METRICS !== 'string') {
            // Extend as other providers support this method
            framework.debug(`${testName}" Got expected reject when working ` +
              `with non Mongo storage provider with no metrics collection specific: ${e.message}`);
            return when(true);
          } else
            return when.reject(e);
        });
    });

    it('tries to write bot metrics no actor info', () => {
      let testName = `tries to write bot metrics with actorId`;
      bot = userCreatedRoomBot;

      return bot.writeMetric({ event: 'frameworkUnitTestWithNoActorInfo' })
        .then((result) => {
          framework.debug('Succesfully wrote metrics data:');
          framework.debug(result);
        })
        .catch((e) => {
          if (typeof process.env.MONGO_USER !== 'string') {
            // Extend as other providers support this method
            framework.debug(`${testName}" Got expected reject when working ` +
              `with non Mongo storage provider: ${e.message}`);
            return when(true);
          } else if (typeof process.env.MONGO_BOT_METRICS !== 'string') {
            // Extend as other providers support this method
            framework.debug(`${testName}" Got expected reject when working ` +
              `with non Mongo storage provider with no metrics collection specific: ${e.message}`);
            return when(true);
          } else
            return when.reject(e);
        });
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
      return common.botCreateRoom(testName, framework, userCreatedRoomBot, eventsData, common.userInfo.emails[0])
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
        common.frameworkMembershipDeletedHandler('delete room', framework, eventsData, resolve);
      });
      const stopped = new Promise((resolve) => {
        botCreatedRoomBot.stopHandler('delete room', resolve);
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

    // remove the hears handlers we set up for these tests
    after(() => {
      framework.clearHears(hearsHi);
      framework.clearHears(hearsFile);
      framework.clearHears(hearsAnything);
      framework.clearHears(hearsSomeStuff);
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
        return common.userSendMessage(testName, framework, userWebex, bot,
//          eventsData, hearsInfo, `<@personId:${bot.person.id}> hi`)
          eventsData, hearsInfo, `hi`)
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
        frameworkFilesEvent = new Promise((resolve) => {
          common.frameworkFilesHandler(testName, framework, eventsData, resolve);
        });
        botFilesEvent = new Promise((resolve) => {
          bot.filesHandler(testName, eventsData, resolve);
        });

        return common.userSendMessage(testName, framework, userWebex, bot,
          eventsData, hearsInfo,
//          `<@personId:${bot.person.id}> Here is a file for ya`,
          `Here is a file for ya`,
          process.env.HOSTED_FILE)
          .then((m) => {
            message = m;
            hearsFile = hearsInfo.functionVar;
            return when.all([frameworkFilesEvent, botFilesEvent]);
          });
      });

      it('hears anything via a regex', () => {
        let testName = 'hears anything via a regex';
        let hearsInfo = {
          phrase: /.*/igm,
          helpString: '',
          priority: 99
        };

        return common.userSendMessage(testName, framework, userWebex, bot,
          eventsData, hearsInfo,
//          `<@personId:${bot.person.id}>Here is a whole mess of stuff for ya`)
          `Here is a whole mess of stuff for ya`)
          .then((m) => {
            hearsAnything = hearsInfo.functionVar;
            message = m;
            return when.all([frameworkFilesEvent, botFilesEvent]);
          });
      });

      it('hears a higher priority regex', () => {
        let testName = 'hears a higher priority regex';
        let hearsInfo = {
          phrase: /.*Some Stuf.*/igm,
          helpString: '',
          priority: 2 // lower number == higher priority
        };

        return common.userSendMessage(testName, framework, userWebex, bot,
          eventsData, hearsInfo,
          //`<@personId:${bot.person.id}>Here is a Some Stuff for ya`)
          `Here is a Some Stuff for ya`)
          .then((m) => {
            hearsSomeStuff = hearsInfo.functionVar;
            message = m;
            return when.all([frameworkFilesEvent, botFilesEvent]);
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
          if (trigger.message.files) {
            message += `There are also ${trigger.message.files.length} files\n`;
            for (let i = 0; i < trigger.message.files.length; i++) {
              message += `* File${i} Link: ${trigger.message.files[i]}`;
            }
          }
          if (trigger.phrase) {
            message += `\nIt matched the framework.hears() phrase: ${trigger.phrase}`;
          }
          framework.debug(message);
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
      let message;
      it('sends a card', () => {
        let testName = 'bot sends a card';
        let cardJson = require('../common/input-card.json');

        // Wait for the events associated with a new message before completing test..
        messageCreatedEvent = new Promise((resolve) => {
          common.frameworkMessageCreatedEventHandler(testName, framework, eventsData, resolve);
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

      it('presses a button on a card', () => {
        let testName = 'user presses a button on a card';
        let attachmentAction;
        let inputs = {
          myName: common.userInfo.displayName,
          myEmail: common.userInfo.emails[0],
          myTel: '555-555-1234'
        };

        // Wait for the events associated with a new button press before completing test..
        attachmentActionEvent = new Promise((resolve) => {
          common.frameworkAttachementActionEventHandler(testName, framework,
            botCreatedRoomBot, eventsData, resolve);
        });

        return userWebex.attachmentActions.create({
          // As the other user emulate an Action.Submit button press
          type: 'submit',
          messageId: message.id,
          inputs
        })
          .then((a) => {
            attachmentAction = a;
            assert(validator.isAttachmentAction(attachmentAction),
              'attachmentAction returned by sdk.attachmentActions.create() was not valid');
            return when(attachmentActionEvent);
          })
          .then(() => {
            assert(validator.objIsEqual(attachmentAction, eventsData.attachmentAction),
              'attachmentAction returned by API did not match the one from the attachmentAction event');
            // Wait for the events associated with a new message before completing test..
            messageCreatedEvent = new Promise((resolve) => {
              common.frameworkMessageCreatedEventHandler(testName, framework, eventsData, resolve);
            });
            return botCreatedRoomBot.say(`Thanks. Now I know your name is ${attachmentAction.inputs.myName}, ` +
              `your email is ${attachmentAction.inputs.myEmail}, and your phone is ${attachmentAction.inputs.myTel}.`);
          })
          .then(() => when(messageCreatedEvent))
          .catch((e) => {
            console.error(`${testName} failed: ${e.message}`);
            return Promise.reject(e);
          });
      });

    });

    describe('bot.reply', () => {
      it('sends a message and then replies to it', () => {
        let testName = 'bot sends a message and then a reply';
        let message = {};
        let messageFormat = framework.messageFormat;
        let bot = botCreatedRoomBot;

        // Wait for the events associated with a new message before completing test..
        messageCreatedEvent = new Promise((resolve) => {
          common.frameworkMessageCreatedEventHandler(testName, framework, eventsData, resolve);
        });

        return botCreatedRoomBot.say('This is the parent message')
          .then((m) => {
            message = m;
            assert(validator.isMessage(message),
              `${testName} did not return a valid message`);
            return when(messageCreatedEvent);
          })
          .then(() => {
            assert(validator.objIsEqual(message, eventsData.message),
              'message returned by API did not match the one from the messageCreated event');
            return bot.reply(message, 'This is the first reply');
          })
          .then((m) => {
            message = m;
            assert(validator.isMessage(message),
              `${testName} did not return a valid message`);
            assert((typeof m.parentId === 'string'),
              `${testName} did not return a message with a parentId`);
            return bot.reply(message, 'This is a reply to the reply!');
          })
          .then((m) => {
            message = m;
            assert(validator.isMessage(message),
              `${testName} did not return a valid message`);
            assert((typeof m.parentId === 'string'),
              `${testName} did not return a message with a parentId`);
            return bot.reply(message,
              {
                roomId: 'this will be ignored',
                markdown: 'This is a reply sent as a message object',
                parentId: 'this will be ignored'
              });
          })
          .then((m) => {
            message = m;
            assert(validator.isMessage(message),
              `${testName} did not return a valid message`);
            assert((typeof m.parentId === 'string'),
              `${testName} did not return a message with a parentId`);
            framework.messageFormat = 'text';
            return bot.reply(message,
              'This is **the final** reply, with the format set explicitly', 'markdown');
          })
          .then(() => when(framework.messageFormat = messageFormat))
          .catch((e) => {
            console.error(`${testName} failed: ${e.message}`);
            console.error('This test is of an EFT threaded reply feature, and your bot may not be configured for it.' +
              '  If this is the only test that fails, do not worry about it.');
            return Promise.reject(e);
          });
      });


    });
  });

});