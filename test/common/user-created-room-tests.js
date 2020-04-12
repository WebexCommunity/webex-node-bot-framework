// Variables an functions shared by all tests
var common = require("../common/common");
let framework = common.framework;
let userWebex = common.userWebex;
let User_Test_Space_Title = common.User_Test_Space_Title;

let assert = common.assert;
let validator = common.validator;
let when = common.when;

describe('User Created Rooms Tests', () => {
  let userCreatedTestRoom, bot;
  let testName = 'Default Test Name';
  let eventsData = {};
  let messageCreatedEvent;

  // Create a room as user to run tests in
  before(() => userWebex.rooms.create({title: User_Test_Space_Title})
    .then((r) => {
      userCreatedTestRoom = r;
      return validator.isRoom(r);
    }));

  // Add our bot to the room and validate that it is spawned properly
  before(() => common.addBotToSpace('Add bot to user created room', framework, userCreatedTestRoom, eventsData)
    .then((b) => {
      bot = b;
      assert((eventsData.addedBy === common.userInfo.id),
        'after user added bot to test space, addedBy ID did not match the test webex user\'s');
      return validator.isBot(b);
    }));

  // // remove the hears handlers we set up for these tests
  // after(() => {
  //   framework.clearHears(hearsHi);
  //   framework.clearHears(hearsFile);
  //   framework.clearHears(hearsAnything);
  //   framework.clearHears(hearsSomeStuff);
  // });

  // Bot leaves rooms
  after(() => {
    if ((!bot) || (!userCreatedTestRoom)) {
      return Promise.resolve();
    }
    return common.botLeaveRoom('Remove bot from user created room', framework, bot, userCreatedTestRoom, eventsData);
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
      });
  });

  describe('#user.webex.message.create()', () => {
    // Define the messages we want to try sending to the bot
    let testMessages = [
      {msgText: 'hi', hearsInfo: {phrase: 'hi'}},
      {
        msgText: `Here is a file for ya`,
        msgFiles: process.env.HOSTED_FILE,
        hearsInfo: {phrase: /.*file.*/im}
      },
      {
        msgText: `Here is a whole mess of stuff for ya`,
        hearsInfo: {
          phrase: /.*/im,
          helpString: '',
          priority: 99
        }
      },
      {
        msgText: `Here is a Some Stuff for ya`,
        hearsInfo: {
          phrase: /.*Some Stuf.*/im,
          helpString: '',
          priority: 2 // lower number == higher priority
        }
      }
    ];

    after(() => {
      testMessages.forEach((testData) => {
        framework.clearHears(testData.hearsInfo.functionId);
      });
    });

    // loop through message tests..
    testMessages.forEach((testData) => {
      eventsData = {bot: bot};

      it(`user says ${testData.msgText}`, () => {
        let testName = `user says ${testData.msgText}`;
        return common.userSendMessage(testName, framework, userWebex,
          bot, eventsData, testData.hearsInfo,
          testData.msgText, testData.msgFiles);
      });

      it(`bot responds to ${testData.msgText}`, () => {
        let testName = `bot responds to ${testData.msgText}`;
        return common.botRespondsToTrigger(testName, framework,
          bot, eventsData);
      });
    });

  });

  describe('#bot.say() tests', () => {
    let message;
    // Setup test variables and promises for the events that come when a bot posts messages
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

    it('sends a file attachment', () => {
      testName = 'sends a file attachment';
      framework.messageFormat = 'text';
      messageText = 'Here is your file!';
      return bot.say({text: messageText, file: process.env.HOSTED_FILE})
        .then((m) => {
          message = m;
          assert(validator.isMessage(message),
            'create message did not return a valid message');
          assert(message.text === messageText);
          assert((message.hasOwnProperty('files')));
          assert(message.files.length === 1);
          assert(!(message.hasOwnProperty('html')));
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

    it('sends a framework.format=text message', () => {
      testName = 'sends a framework.format=text message';
      framework.messageFormat = 'text';
      messageText = 'This message is plain text, inferred from framework\'s messageFormat';
      return bot.say(messageText)
        .then((m) => {
          message = m;
          assert(validator.isMessage(message),
            'create message did not return a valid message');
          assert(message.text === messageText);
          assert(!(message.hasOwnProperty('html')));
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

    it('sends a framework.format=markdown message', () => {
      testName = 'sends a framework.format=markdown message';
      framework.messageFormat = 'markdown';
      messageText = 'This message is **markdown** text, inferred from framework\'s messageFormat';
      return bot.say(messageText)
        .then((m) => {
          message = m;
          assert(validator.isMessage(message),
            'create message did not return a valid message');
          assert(message.markdown === messageText);
          assert((message.hasOwnProperty('html')));
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

    it('sends an explicitly formatted text message', () => {
      testName = 'sends an explicitly formatted text message';
      framework.messageFormat = 'markdown';
      messageText = 'This message is plain text, explicitly set in the bot.say() call';
      return bot.say('text', messageText)
        .then((m) => {
          message = m;
          assert(validator.isMessage(message),
            'create message did not return a valid message');
          assert(message.text === messageText);
          assert(!(message.hasOwnProperty('html')));
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

    it('sends an explicitly formatted markdown message', () => {
      testName = 'sends a framework.format=markdown message';
      framework.messageFormat = 'text';
      messageText = 'This message is **markdown**, explicitly set in the bot.say() call';
      return bot.say('markdown', messageText)
        .then((m) => {
          message = m;
          assert(validator.isMessage(message),
            'create message did not return a valid message');
          assert(message.markdown === messageText);
          assert((message.hasOwnProperty('html')));
          return when.all([messageCreatedEvent]);
        })
        .then(() => {
          // Set this back to our default
          framework.messageFormat = 'markdown';
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

