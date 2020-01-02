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
  let message, eventsData = {};
  let triggers = [], messages = [];
  let messageCreatedEvent;
  let hearsHi, hearsFile, hearsAnything, hearsSomeStuff;


  // Create a room as user to run tests in
  before(() => userWebex.rooms.create({ title: User_Test_Space_Title })
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

  // remove the hears handlers we set up for these tests
  after(() => {
    framework.clearHears(hearsHi);
    framework.clearHears(hearsFile);
    framework.clearHears(hearsAnything);
    framework.clearHears(hearsSomeStuff);
  });

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
    // Setup the promises for the events that come from user input that mentions a bot
    beforeEach(() => {
      testName = 'User posts message to bot created room';
      message = {};
      eventsData = { bot: bot };
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
        eventsData, hearsInfo, `Here is a file for ya`,
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
      eventsData = { bot: bot };
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


    // TODO figure out how to do this more elegently perhapss with it.each
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

    it('responds to the second trigger', () => {
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

    it('responds to the third trigger', () => {
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

  describe('#bot.say() tests', () => {
    let message;
    // Setup test variables and promises for the events that come when a bot posts messages
    beforeEach(() => {
      testName = 'Bot posts message to room';
      message = {};
      eventsData = { bot: bot };
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
      return bot.say({ text: messageText, file: process.env.HOSTED_FILE })
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

