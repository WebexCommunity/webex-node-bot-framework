// Variables an functions shared by all tests
var common = require("../common/common");
let flint = common.flint;
let userWebex = common.userWebex;
let User_Test_Space_Title = common.User_Test_Space_Title;

let assert = common.assert;
let validator = common.validator;
let when = common.when;
let _ = common._;

describe('User Created Rooms Tests', () => {
  let userCreatedTestRoom, bot;
  let testName = 'Default Test Name';
  let message, eventsData = {};
  let triggers = [], messages = [];
  let messageCreatedEvent, flintMentionedEvent, botMentionedEvent, flintMessageEvent, botMessageEvent;

  // Create a room as user to run tests in
  before(() => userWebex.rooms.create({ title: User_Test_Space_Title })
    .then((r) => {
      userCreatedTestRoom = r;
      return validator.isRoom(r);
    }));

  // Add our bot to the room and validate that it is spawned properly
  before(() => {
    let membership;
    testName = 'Add bot to space';
    // Wait for the events associated with a new membership before completing test..
    const membershipEvent = new Promise((resolve) => {
      common.flintMembershipCreatedHandler(testName, flint, eventsData, resolve);
    });
    const spawned = new Promise((resolve) => {
      common.flintSpawnedHandler(testName, eventsData, resolve);
    });

    // Add the bot to our user created space
    return userWebex.memberships.create({
      roomId: userCreatedTestRoom.id,
      personId: flint.person.id
    })
      .then((m) => {
        membership = m;
        return assert(validator.isMembership(membership),
          'create memebership did not return a valid membership');
      })
      // Wait for flint's membershipCreated event
      .then(() => when(membershipEvent)
        .then(() => {
          assert((eventsData.membership.id === membership.id),
            'Membership from flint event does not match the one returned by API');
          return when(spawned);
        })
        // Wait for flint's spawned event
        .then(() => {
          bot = eventsData.bot;
          common.createBotEventHandlers(bot);
          assert(_.find(flint.bots, bot => bot.room.id === bot.room.id),
            'After spawn new bot is not in flint\'s bot array');
          return spawned;
        })
        .catch((e) => {
          console.error(`Bot spawn test failed: ${e.message}`);
          return Promise.reject(e);
        }))
      .catch((e) => {
        console.error(`Spawn event never occured: ${e.message}`);
        return Promise.reject(e);
      });
  });

  // remove the hears handlers we set up for these tests
  after(() => {
    flint.clearHears(hearsHi);
    flint.clearHears(hearsFile);
    flint.clearHears(hearsAnything);
  });

  // Bot leaves rooms
  after(() => {
    if ((!bot) || (!userCreatedTestRoom)) {
      return Promise.resolve();
    }
    const membershipDeleted = new Promise((resolve) => {
      common.flintMembershipDeletedHandler('flint init', flint, eventsData, resolve);
    });
    const stopped = new Promise((resolve) => {
      bot.stopHandler('flint init', resolve);
    });
    const despawned = new Promise((resolve) => {
      common.flintDespawnHandler('flint init', flint, eventsData, resolve);
    });


    return bot.exit()
      .then(() => when.all([membershipDeleted, stopped, despawned]))
      .catch((reason) => {
        console.error('Bot failed to exit room', reason);
      });
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
      testName = 'User posts message to room';
      message = {};
      eventsData = { bot: bot };

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

      // // Wait for the hears event associated with the input text
      // const heard = new Promise((resolve) => {
      //   flint.hears('test1: hi', (b, t) => {
      //     assert((b.id === bot.id),
      //       'bot returned in fint.hears("hi") is not the one expected');
      //     assert(validator.objIsEqual(t, eventsData.trigger),
      //       'trigger returned in flint.hears("hi") was not as expected');
      //     flint.debug('Bot heard message "hi" that user posted');
      //     resolve(true);
      //   });
      // });

      // // As the user, send the message, mentioning the bot
      // return userWebex.messages.create({
      //   roomId: userCreatedTestRoom.id,
      //   markdown: `<@personId:${bot.person.id}|Bot> test1: hi`
      // })
      //   .then((m) => {
      //     message = m;
      //     assert(validator.isMessage(message),
      //       'create message did not return a valid message');
      //     // Wait for all the event handlers and the heard handler to fire
      //     return when.all([messageCreatedEvent, flintMentionedEvent, botMentionedEvent, flintMessageEvent, botMessageEvent, heard]);
      //   })
      //   .catch((e) => {
      //     console.error(`${testName} failed: ${e.message}`);
      //     return Promise.reject(e);
      //   });
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

      // // Wait for the `files` events (as well as the others)
      // flintFilesEvent = new Promise((resolve) => {
      //   common.flintFilesHandler(testName, flint, eventsData, resolve);
      // });
      // botFilesEvent = new Promise((resolve) => {
      //   bot.filesHandler(testName, eventsData, resolve);
      // });

      // // set up a flint.hears for this input
      // const heard = new Promise((resolve) => {
      //   flint.hears(/test2:.*file.*/igm, (b, t) => {
      //     assert((b.id === bot.id),
      //       'bot returned in fint.hears() is not the one expected');
      //     trigger = t;
      //     flint.debug(`Bot heard message ${trigger.text} that user posted`);
      //     resolve(true);
      //   });
      // });

      // // send the users input
      // return userWebex.messages.create({
      //   roomId: userCreatedTestRoom.id,
      //   markdown: `<@personId:${bot.person.id}|Bot> test2: Here is a file for ya`,
      //   files: process.env.HOSTED_FILE
      // })
      //   .then((m) => {
      //     message = m;
      //     messages.push(m);
      //     assert(validator.isMessage(message),
      //       'create message did not return a valid message');
      //     // Wait for all the event handlers and the heard handler to fire
      //     return when.all([messageCreatedEvent, flintMentionedEvent, botMentionedEvent,
      //       flintMessageEvent, botMessageEvent, flintFilesEvent, botFilesEvent, heard]);
      //   })
      //   .then(() => {
      //     triggers.push(eventsData.trigger);
      //     assert(validator.objIsEqual(message, eventsData.message),
      //       'message returned by API did not match the one from the messageCreated event');
      //     return heard;
      //   })
      //   .catch((e) => {
      //     console.error(`${testName} failed: ${e.message}`);
      //     return Promise.reject(e);
      //   });
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

    //   // set up a flint.hears for this input
    //   const heard = new Promise((resolve) => {
    //     flint.hears(/test3: .*/, (b, t) => {
    //       assert((b.id === bot.id),
    //         'bot returned in fint.hears() is not the one expected');
    //       trigger = t;
    //       flint.debug(`Bot heard message ${trigger.text} that user posted`);
    //       resolve(true);
    //     });
    //   });

    //   // send the users input
    //   return userWebex.messages.create({
    //     roomId: userCreatedTestRoom.id,
    //     markdown: `<@personId:${bot.person.id}|Bot> test3: Here is a whole mess of stuff for ya`

    //   })
    //     .then((m) => {
    //       message = m;
    //       assert(validator.isMessage(message),
    //         'create message did not return a valid message');
    //       // Wait for all the event handlers and the heard handler to fire
    //       return when.all([messageCreatedEvent, flintMentionedEvent, botMentionedEvent, flintMessageEvent, botMessageEvent, heard]);
    //     })
    //     .then(() => {
    //       triggers.push(eventsData.trigger);
    //       assert(validator.objIsEqual(message, eventsData.message),
    //         'message returned by API did not match the one from the messageCreated event');
    //       return heard;
    //     })
    //     .catch((e) => {
    //       console.error(`${testName} failed: ${e.message}`);
    //       return Promise.reject(e);
    //     });
    // });
  });

  describe('#bot.say() using triggers from previous test', () => {
    let trigger, message;
    // Setup the promises for the events that come from user input that mentions a bot
    beforeEach(() => {
      testName = 'Bot posts message to room';
      message = {};
      eventsData = { bot: bot };
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
    // });

    // describe('#user.webex.message.create(random)', () => {
    // it('hears anything via a regex', () => {
    //   // set up a flint.hears for this input
    //   const heard = new Promise((resolve) => {
    //     flint.hears(/.*/, (b, t) => {
    //       assert((b.id === bot.id),
    //         'bot returned in fint.hears() is not the one expected');
    //       trigger = t;
    //       flint.debug(`Bot heard message ${trigger.text} that user posted`);
    //       resolve(true);
    //     });
    //   });

    //   // send the users input
    //   return userWebex.messages.create({
    //     roomId: userCreatedTestRoom.id,
    //     markdown: `<@personId:${bot.id}|Bot> Here is a whole mess of stuff for ya`

    //   })
    //     .then((m) => {
    //       message = m;
    //       assert(validator.isMessage(message),
    //         'create message did not return a valid message');
    //       return when.all([messageCreatedEvent, flintMentionedEvent, botMentionedEvent, heard]);
    //     })
    //     .then(() => {
    //       triggers.push(eventsData.trigger);
    //       assert(validator.objIsEqual(message, eventsData.message),
    //         'message returned by API did not match the one from the messageCreated event');
    //       return heard;
    //     })
    //     .catch((e) => {
    //       console.error(`${testName} failed: ${e.message}`);
    //       return Promise.reject(e);
    //     });
    // });
  });

  describe('#bot.say() tests', () => {
    let message;
    // Setup test variables and promises for the events that come when a bot posts messages
    beforeEach(() => {
      testName = 'Bot posts message to room';
      message = {};
      eventsData = { bot: bot };
      flint.messageFormat = 'markdown';

      // Wait for the events associated with a new message before completing test..
      messageCreatedEvent = new Promise((resolve) => {
        common.flintMessageCreatedEventHandler(testName, flint, eventsData, resolve);
      });
    });

    it('sends a file attachment', () => {
      testName = 'sends a file attachment';
      flint.messageFormat = 'text';
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

    it('sends a flint.format=text message', () => {
      testName = 'sends a flint.format=text message';
      flint.messageFormat = 'text';
      messageText = 'This message is plain text, inferred from flint\'s messageFormat';
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

    it('sends a flint.format=markdown message', () => {
      testName = 'sends a flint.format=markdown message';
      flint.messageFormat = 'markdown';
      messageText = 'This message is **markdown** text, inferred from flint\'s messageFormat';
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
      flint.messageFormat = 'markdown';
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
      testName = 'sends a flint.format=markdown message';
      flint.messageFormat = 'text';
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
          flint.messageFormat = 'markdown';
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

