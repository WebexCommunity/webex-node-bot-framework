const assert = require('assert');
const when = require('when');
const Flint = require('../lib/flint');
const validator = require('../lib/validator');
const Webex = require('webex');
var _ = require('lodash');
// Read in environment variables
require('dotenv').config();

let User_Test_Space_Title = 'Flint User Created Test Room';
let Bot_Test_Space_Title = 'Flint Bot Created Test Room';

let flint, userWebex;
if ((typeof process.env.BOT_API_TOKEN === 'string') &&
  (typeof process.env.USER_API_TOKEN === 'string') &&
  (typeof process.env.HOSTED_FILE === 'string')) {
  flint = new Flint({ token: process.env.BOT_API_TOKEN });
  // flint = new Flint({ token: process.env.BOT_API_TOKEN, webhookUrl: "http://jpshipherd.ngrok.io"});
  userWebex = new Webex({ credentials: process.env.USER_API_TOKEN });
} else {
  console.error('Missing required evnvironment variables:\n' +
    '- BOT_API_TOKEN -- token associatd with an existing bot\n' +
    '- USER_API_TOKEN -- token associated with an existing user\n' +
    '- HOSTED_FILE -- url to a file that can be attached to test messages\n' +
    'The tests will create a new space with the bot and the user');
  process.exit(-1);
}


describe('#flint', () => {
  let roomList, bot;

  // Validate that flint starts and that we have a valid user
  before(() => {
    const started = new Promise((resolve) => {
      flintStartHandler('flint init', flint, resolve);
    });
    const initialized = new Promise((resolve) => {
      flintInitializedHandler('flint init', flint, resolve);
    });

    flint.start();
    // While we wait for flint, lets validate the user
    return userWebex.people.get('me')
      .then((person) => {
        user = person;
        return assert(validator.isPerson(person),
          'getPerson did not return a valid person');
      })
      // Now wait until flint is initialized
      .then(() => when.all([started, initialized])
        .then(() => {
          assert(validator.isFlint(flint),
            'Flint did not initialize succesfully');
          flint.debug(`${flint.email} is in ${flint.bots.length} at the start of the tests.`);
          cleanupFromPreviousTests(flint, userWebex);
          if (process.env.CLEANUP_USER_ROOMS) {
            asUserCeanupFromPreviousTests(userWebex);
          }
          return initialized;
        })
        .catch((e) => {
          console.error(`Setup failed: ${e.message}`);
          return Promise.reject(e);
        }));
  });

  //Stop flint to shut down the event listeners
  after(() => {
    if (flint) {
      const stopped = new Promise((resolve) => {
        flintStopHandler('flint init', flint, resolve);
      });

      return flint.stop()
        .then(() => when(stopped))
        .catch((e) => console.error(`Failled during flint.stop(): ${e.message}`));
    }
  });

  // Run some basic validation against the flint methods
  // Could probably get rid of these if they are used internally by the other tests
  describe('#Flint API Checks', () => {
    it('flint.getPerson("me") returns info about my bot', () => flint.getPerson('me')
      .then((person) => {
        bot = person;
        return when(validator.objIsEqual(bot, flint.person),
          'bot.getPerson(\'me\') does not match flint.person');
      }));

    it('returns an array of spaces', () => flint.getRooms()
      .then((rooms) => {
        roomList = rooms;
        // We have a bot for each existing room
        assert(roomList.length === flint.bots.length);
        return when(assert(validator.isRooms(rooms),
          'getRooms did not return a list of rooms'));
      }));
  });

  describe('User Created Rooms Tests', () => {
    let userCreatedTestRoom, userCreatedRoomBot;
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
        flintMembershipCreatedHandler(testName, flint, eventsData, resolve);
      });
      const spawned = new Promise((resolve) => {
        flintSpawnedHandler(testName, eventsData, resolve);
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
            userCreatedRoomBot = eventsData.bot;
            createBotEventHandlers(userCreatedRoomBot);
            assert(_.find(flint.bots, bot => bot.room.id === userCreatedRoomBot.room.id),
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


    // Bot leaves rooms
    after(() => {
      if ((!userCreatedRoomBot) || (!userCreatedTestRoom)) {
        return Promise.resolve();
      }
      const membershipDeleted = new Promise((resolve) => {
        flintMembershipDeletedHandler('flint init', flint, eventsData, resolve);
      });
      const stopped = new Promise((resolve) => {
        userCreatedRoomBot.stopHandler('flint init', resolve);
      });
      const despawned = new Promise((resolve) => {
        flintDespawnHandler('flint init', flint, eventsData, resolve);
      });


      return userCreatedRoomBot.exit()
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
        eventsData = { bot: userCreatedRoomBot };

        // Wait for the events associated with a new message before completing test..
        messageCreatedEvent = new Promise((resolve) => {
          flintMessageCreatedEventHandler(testName, flint, eventsData, resolve);
        });
        flintMentionedEvent = new Promise((resolve) => {
          flintMentionedHandler(testName, flint, eventsData, resolve);
        });
        botMentionedEvent = new Promise((resolve) => {
          userCreatedRoomBot.mentionedHandler(testName, eventsData, resolve);
        });
        flintMessageEvent = new Promise((resolve) => {
          flintMessageHandler(testName, flint, eventsData, resolve);
        });
        botMessageEvent = new Promise((resolve) => {
          userCreatedRoomBot.messageHandler(testName, eventsData, resolve);
        });
      });

      afterEach(() => {
        messages.push(eventsData.message);
        triggers.push(eventsData.trigger);
        assert(validator.objIsEqual(message, eventsData.message),
          'message returned by API did not match the one from the messageCreated event');

      });

      it('hears the user say hi', () => {
        // Wait for the hears event associated with the input text
        const heard = new Promise((resolve) => {
          flint.hears('test1: hi', (b, t) => {
            assert((b.id === userCreatedRoomBot.id),
              'bot returned in fint.hears("hi") is not the one expected');
            assert(validator.objIsEqual(t, eventsData.trigger),
              'trigger returned in flint.hears("hi") was not as expected');
            flint.debug('Bot heard message "hi" that user posted');
            resolve(true);
          });
        });

        // As the user, send the message, mentioning the bot
        return userWebex.messages.create({
          roomId: userCreatedTestRoom.id,
          markdown: `<@personId:${bot.id}|Bot> test1: hi`
        })
          .then((m) => {
            message = m;
            assert(validator.isMessage(message),
              'create message did not return a valid message');
            // Wait for all the event handlers and the heard handler to fire
            return when.all([messageCreatedEvent, flintMentionedEvent, botMentionedEvent, flintMessageEvent, botMessageEvent, heard]);
          })
          .then(() => {
            // triggers.push(eventsData.trigger);
            // assert(validator.objIsEqual(message, eventsData.message),
            //   'message returned by API did not match the one from the messageCreated event');
            return heard;
          })
          .catch((e) => {
            console.error(`${testName} failed: ${e.message}`);
            return Promise.reject(e);
          });
      });

      it('hears news about a file', () => {
        // set up a flint.hears for this input
        const heard = new Promise((resolve) => {
          flint.hears(/test2:.*file.*/igm, (b, t) => {
            assert((b.id === userCreatedRoomBot.id),
              'bot returned in fint.hears() is not the one expected');
            trigger = t;
            flint.debug(`Bot heard message ${trigger.text} that user posted`);
            resolve(true);
          });
        });

        // send the users input
        return userWebex.messages.create({
          roomId: userCreatedTestRoom.id,
          markdown: `<@personId:${bot.id}|Bot> test2: Here is a file for ya`,
          files: process.env.HOSTED_FILE
        })
          .then((m) => {
            message = m;
            messages.push(m);
            assert(validator.isMessage(message),
              'create message did not return a valid message');
            // Wait for all the event handlers and the heard handler to fire
            return when.all([messageCreatedEvent, flintMentionedEvent, botMentionedEvent, flintMessageEvent, botMessageEvent, heard]);
          })
          .then(() => {
            triggers.push(eventsData.trigger);
            assert(validator.objIsEqual(message, eventsData.message),
              'message returned by API did not match the one from the messageCreated event');
            return heard;
          })
          .catch((e) => {
            console.error(`${testName} failed: ${e.message}`);
            return Promise.reject(e);
          });
      });

      it('hears anything via a regex', () => {
        // set up a flint.hears for this input
        const heard = new Promise((resolve) => {
          flint.hears(/test3: .*/, (b, t) => {
            assert((b.id === userCreatedRoomBot.id),
              'bot returned in fint.hears() is not the one expected');
            trigger = t;
            flint.debug(`Bot heard message ${trigger.text} that user posted`);
            resolve(true);
          });
        });

        // send the users input
        return userWebex.messages.create({
          roomId: userCreatedTestRoom.id,
          markdown: `<@personId:${bot.id}|Bot> test3: Here is a whole mess of stuff for ya`

        })
          .then((m) => {
            message = m;
            assert(validator.isMessage(message),
              'create message did not return a valid message');
            // Wait for all the event handlers and the heard handler to fire
            return when.all([messageCreatedEvent, flintMentionedEvent, botMentionedEvent, flintMessageEvent, botMessageEvent, heard]);
          })
          .then(() => {
            triggers.push(eventsData.trigger);
            assert(validator.objIsEqual(message, eventsData.message),
              'message returned by API did not match the one from the messageCreated event');
            return heard;
          })
          .catch((e) => {
            console.error(`${testName} failed: ${e.message}`);
            return Promise.reject(e);
          });
      });
    });

    describe('#bot.say() using triggers from previous test', () => {
      let trigger, message;
      // Setup the promises for the events that come from user input that mentions a bot
      beforeEach(() => {
        testName = 'Bot posts message to room';
        message = {};
        eventsData = { bot: userCreatedRoomBot };
        flint.messageFormat = 'markdown';

        // Wait for the events associated with a new message before completing test..
        messageCreatedEvent = new Promise((resolve) => {
          flintMessageCreatedEventHandler(testName, flint, eventsData, resolve);
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
        return userCreatedRoomBot.say(message)
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
        return userCreatedRoomBot.say(message)
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
        return userCreatedRoomBot.say(message)
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
      //       assert((b.id === userCreatedRoomBot.id),
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
        eventsData = { bot: userCreatedRoomBot };
        flint.messageFormat = 'markdown';

        // Wait for the events associated with a new message before completing test..
        messageCreatedEvent = new Promise((resolve) => {
          flintMessageCreatedEventHandler(testName, flint, eventsData, resolve);
        });
      });

      it('sends a file attachment', () => {
        testName = 'sends a file attachment';
        flint.messageFormat = 'text';
        messageText = 'Here is your file!';
        return userCreatedRoomBot.say({ text: messageText, file: process.env.HOSTED_FILE })
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
        return userCreatedRoomBot.say(messageText)
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
        return userCreatedRoomBot.say(messageText)
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
        return userCreatedRoomBot.say('text', messageText)
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
        return userCreatedRoomBot.say('markdown', messageText)
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

  describe('User Created Room to create a Test Bot', () => {
    let userCreatedTestRoom, userCreatedRoomBot;
    let testName = 'Default Test Name';
    let eventsData = {};

    // Create a room as user to have test bot which will create other rooms
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
        flintMembershipCreatedHandler(testName, flint, eventsData, resolve);
      });
      const spawned = new Promise((resolve) => {
        flintSpawnedHandler(testName, eventsData, resolve);
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
            userCreatedRoomBot = eventsData.bot;
            createBotEventHandlers(userCreatedRoomBot);
            assert(_.find(flint.bots, bot => bot.room.id === userCreatedRoomBot.room.id),
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

    // Bot leaves rooms
    after(() => {
      if ((!userCreatedRoomBot) || (!userCreatedTestRoom)) {
        return Promise.resolve();
      }
      const membershipDeleted = new Promise((resolve) => {
        flintMembershipDeletedHandler('flint init', flint, eventsData, resolve);
      });
      const stopped = new Promise((resolve) => {
        userCreatedRoomBot.stopHandler('flint init', resolve);
      });
      const despawned = new Promise((resolve) => {
        flintDespawnHandler('flint init', flint, eventsData, resolve);
      });


      return userCreatedRoomBot.exit()
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
          throw reason;
        });
    });

    describe('Bot Created Rooms Tests', () => {
      let botCreatedTestRoom, botCreatedRoomBot;
      let testName = 'Default Test Name';
      let message, eventsData = {};
      let triggers = [], messages = [];
      let messageCreatedEvent, flintMentionedEvent, botMentionedEvent, flintMessageEvent, botMessageEvent;
      // Create a room as user to have test bot which will create other rooms
      before(() => {
        let testName = 'bot.newRoom() test';
        // Wait for the events associated with a new membership before completing test..
        const roomCreated = new Promise((resolve) => {
          flintRoomCreatedHandler(testName, flint, eventsData, resolve);
        });
        const membershipCreatedEvent = new Promise((resolve) => {
          flintMembershipCreatedHandler(testName, flint, eventsData, resolve);
        });
        const spawned = new Promise((resolve) => {
          flintSpawnedHandler(testName, eventsData, resolve);
        });


        return userCreatedRoomBot.newRoom(Bot_Test_Space_Title, user.emails[0])
          .then((bot) => {
            botCreatedRoomBot = bot;
            botCreatedTestRoom = bot.room;
            assert(validator.isBot(bot),
              `Bot returned by bot.newRoom is not valid.`);
            assert(validator.isRoom(botCreatedTestRoom),
              `Room returned by bot.newRoom is not valid.`);
            createBotEventHandlers(botCreatedRoomBot);
            return when(roomCreated);
          })
          // Wait for flint's membershipCreated event
          .then(() => {
            assert((eventsData.room.id == botCreatedTestRoom.id),
              'Room from flint roomCreated event does not match ' +
              'the one in the bot returned by newRoom()');
            return when(membershipCreatedEvent);
          })
          .then(() => {
            assert((eventsData.membership.id === botCreatedRoomBot.membership.id),
              'Membership from flint membershipCreated event does not match ' +
              'the one in the bot returned by newRoom()');
            return when(spawned);
          })
          // Wait for flint's spawned event
          .then(() => {
            assert((eventsData.bot.id == botCreatedRoomBot.id),
              'Bot from flint spawned event does not match the one returned by newRoom()');
            assert(_.find(flint.bots, bot => bot.room.id === botCreatedRoomBot.room.id),
              'After spawn new bot is not in flint\'s bot array');
            return spawned;
          })
          .catch((e) => {
            console.error(`Bot newRoom() test failed: ${e.message}`);
            return Promise.reject(e);
          });
      });

      // Bot deletes room
      after(() => {
        if ((!botCreatedRoomBot) || (!botCreatedTestRoom)) {
          return Promise.resolve();
        }
        const membershipDeleted = new Promise((resolve) => {
          flintMembershipDeletedHandler('flint init', flint, eventsData, resolve);
        });
        const stopped = new Promise((resolve) => {
          botCreatedRoomBot.stopHandler('flint init', resolve);
        });
        const despawned = new Promise((resolve) => {
          flintDespawnHandler('flint init', flint, eventsData, resolve);
        });


        return botCreatedRoomBot.implode()
          .then(() => when.all([membershipDeleted, stopped, despawned]))
          .catch((reason) => {
            console.error('Bot failed to exit room', reason);
          });
      });

      describe('#user.webex.message.create()', () => {
        // Setup the promises for the events that come from user input that mentions a bot
        beforeEach(() => {
          testName = 'User posts message to bot created room';
          message = {};
          eventsData = { bot: botCreatedRoomBot };
          bot = botCreatedRoomBot;

          // Wait for the events associated with a new message before completing test..
          messageCreatedEvent = new Promise((resolve) => {
            flintMessageCreatedEventHandler(testName, flint, eventsData, resolve);
          });
          flintMentionedEvent = new Promise((resolve) => {
            flintMentionedHandler(testName, flint, eventsData, resolve);
          });
          botMentionedEvent = new Promise((resolve) => {
            botCreatedRoomBot.mentionedHandler(testName, eventsData, resolve);
          });
          flintMessageEvent = new Promise((resolve) => {
            flintMessageHandler(testName, flint, eventsData, resolve);
          });
          botMessageEvent = new Promise((resolve) => {
            botCreatedRoomBot.messageHandler(testName, eventsData, resolve);
          });
        });

        afterEach(() => {
          messages.push(eventsData.message);
          triggers.push(eventsData.trigger);
          assert(validator.objIsEqual(message, eventsData.message),
            'message returned by API did not match the one from the messageCreated event');

        });

        it('hears the user say hi', () => {
          // Wait for the hears event associated with the input text
          const heard = new Promise((resolve) => {
            flint.hears('hi', (b, t) => {
              assert((b.id === botCreatedRoomBot.id),
                'bot returned in fint.hears("hi") is not the one expected');
              assert(validator.objIsEqual(t, eventsData.trigger),
                'trigger returned in flint.hears("hi") was not as expected');
              flint.debug('Bot heard message "hi" that user posted');
              resolve(true);
            });
          });

          // As the user, send the message, mentioning the bot
          return userWebex.messages.create({
            roomId: botCreatedTestRoom.id,
            markdown: `<@personId:${bot.person.id}> hi`
          })
            .then((m) => {
              message = m;
              assert(validator.isMessage(message),
                'create message did not return a valid message');
              // Wait for all the event handlers and the heard handler to fire
              return when.all([messageCreatedEvent, flintMentionedEvent, botMentionedEvent, flintMessageEvent, botMessageEvent, heard]);
              //              return when(messageCreatedEvent);
            })
            .then(() => {
              // triggers.push(eventsData.trigger);
              // assert(validator.objIsEqual(message, eventsData.message),
              //   'message returned by API did not match the one from the messageCreated event');
              return heard;
            })
            .catch((e) => {
              console.error(`${testName} failed: ${e.message}`);
              return Promise.reject(e);
            });
        });

        it('hears news about a file', () => {
          // set up a flint.hears for this input
          const heard = new Promise((resolve) => {
            flint.hears(/.*file.*/igm, (b, t) => {
              assert((b.id === botCreatedRoomBot.id),
                'bot returned in fint.hears() is not the one expected');
              trigger = t;
              flint.debug(`Bot heard message ${trigger.text} that user posted`);
              resolve(true);
            });
          });

          // send the users input
          return userWebex.messages.create({
            roomId: botCreatedTestRoom.id,
            markdown: `<@personId:${bot.person.id}> Here is a file for ya`,
            files: process.env.HOSTED_FILE
          })
            .then((m) => {
              message = m;
              messages.push(m);
              assert(validator.isMessage(message),
                'create message did not return a valid message');
              // Wait for all the event handlers and the heard handler to fire
              return when.all([messageCreatedEvent, flintMentionedEvent, botMentionedEvent, flintMessageEvent, botMessageEvent, heard]);
            })
            .then(() => {
              triggers.push(eventsData.trigger);
              assert(validator.objIsEqual(message, eventsData.message),
                'message returned by API did not match the one from the messageCreated event');
              return heard;
            })
            .catch((e) => {
              console.error(`${testName} failed: ${e.message}`);
              return Promise.reject(e);
            });
        });

        it('hears anything via a regex', () => {
          // set up a flint.hears for this input
          const heard = new Promise((resolve) => {
            flint.hears(/.*/, (b, t) => {
              assert((b.id === botCreatedRoomBot.id),
                'bot returned in fint.hears() is not the one expected');
              trigger = t;
              flint.debug(`Bot heard message ${trigger.text} that user posted`);
              resolve(true);
            });
          });

          // send the users input
          return userWebex.messages.create({
            roomId: botCreatedTestRoom.id,
            markdown: `<@personId:${bot.person.id}> Here is a whole mess of stuff for ya`
          })
            .then((m) => {
              message = m;
              assert(validator.isMessage(message),
                'create message did not return a valid message');
              // Wait for all the event handlers and the heard handler to fire
              return when.all([messageCreatedEvent, flintMentionedEvent, botMentionedEvent, flintMessageEvent, botMessageEvent, heard]);
            })
            .then(() => {
              triggers.push(eventsData.trigger);
              assert(validator.objIsEqual(message, eventsData.message),
                'message returned by API did not match the one from the messageCreated event');
              return heard;
            })
            .catch((e) => {
              console.error(`${testName} failed: ${e.message}`);
              return Promise.reject(e);
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
            flintMessageCreatedEventHandler(testName, flint, eventsData, resolve);
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
        // });

        // describe('#user.webex.message.create(random)', () => {
        // it('hears anything via a regex', () => {
        //   // set up a flint.hears for this input
        //   const heard = new Promise((resolve) => {
        //     flint.hears(/.*/, (b, t) => {
        //       assert((b.id === userCreatedRoomBot.id),
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

    });

    describe('Bot Membership Tests', () => {
      let botCreatedTestRoom, botCreatedRoomBot;
      let testName = 'Default Test Name';
      let message, eventsData = {};
      let triggers = [], messages = [];
      let messageCreatedEvent, flintMentionedEvent, botMentionedEvent, flintMessageEvent, botMessageEvent;
      // Create a room as user to have test bot which will create other rooms
      before(() => {
        let testName = 'empty bot.newRoom() test';
        // Wait for the events associated with a new membership before completing test..
        const roomCreated = new Promise((resolve) => {
          flintRoomCreatedHandler(testName, flint, eventsData, resolve);
        });
        const membershipCreatedEvent = new Promise((resolve) => {
          flintMembershipCreatedHandler(testName, flint, eventsData, resolve);
        });
        const spawned = new Promise((resolve) => {
          flintSpawnedHandler(testName, eventsData, resolve);
        });

        //Temporarily put the user in the room to start
        //return userCreatedRoomBot.newRoom(Bot_Test_Space_Title, user.emails[0])
        return userCreatedRoomBot.newRoom(Bot_Test_Space_Title)
          .then((bot) => {
            botCreatedRoomBot = bot;
            botCreatedTestRoom = bot.room;
            assert(validator.isBot(bot),
              `Bot returned by bot.newRoom is not valid.`);
            assert(validator.isRoom(botCreatedTestRoom),
              `Room returned by bot.newRoom is not valid.`);
            createBotEventHandlers(botCreatedRoomBot);
            return when(roomCreated);
          })
          // Wait for flint's membershipCreated event
          .then(() => {
            assert((eventsData.room.id == botCreatedTestRoom.id),
              'Room from flint roomCreated event does not match ' +
              'the one in the bot returned by newRoom()');
            return when(membershipCreatedEvent);
          })
          .then(() => {
            assert((eventsData.membership.id === botCreatedRoomBot.membership.id),
              'Membership from flint membershipCreated event does not match ' +
              'the one in the bot returned by newRoom()');
            return when(spawned);
          })
          // Wait for flint's spawned event
          .then(() => {
            assert((eventsData.bot.id == botCreatedRoomBot.id),
              'Bot from flint spawned event does not match the one returned by newRoom()');
            assert(_.find(flint.bots, bot => bot.room.id === botCreatedRoomBot.room.id),
              'After spawn new bot is not in flint\'s bot array');
            return spawned;
          })
          .catch((e) => {
            console.error(`Bot newRoom() test failed: ${e.message}`);
            return Promise.reject(e);
          });
      });

      // Bot deletes room
      after(() => {
        if ((!botCreatedRoomBot) || (!botCreatedTestRoom)) {
          return Promise.resolve();
        }
        const membershipDeleted = new Promise((resolve) => {
          flintMembershipDeletedHandler('flint init', flint, eventsData, resolve);
        });
        const stopped = new Promise((resolve) => {
          botCreatedRoomBot.stopHandler('flint init', resolve);
        });
        const despawned = new Promise((resolve) => {
          flintDespawnHandler('flint init', flint, eventsData, resolve);
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

          // // Wait for the events associated with a new message before completing test..
          // messageCreatedEvent = new Promise((resolve) => {
          //   flintMessageCreatedEventHandler(testName, flint, eventsData, resolve);
          // });
          // flintMentionedEvent = new Promise((resolve) => {
          //   flintMentionedHandler(testName, flint, eventsData, resolve);
          // });
          // botMentionedEvent = new Promise((resolve) => {
          //   botCreatedRoomBot.mentionedHandler(testName, eventsData, resolve);
          // });
          // flintMessageEvent = new Promise((resolve) => {
          //   flintMessageHandler(testName, flint, eventsData, resolve);
          // });
          // botMessageEvent = new Promise((resolve) => {
          //   botCreatedRoomBot.messageHandler(testName, eventsData, resolve);
          // });
        });

        // afterEach(() => {
        //   messages.push(eventsData.message);
        //   triggers.push(eventsData.trigger);
        //   assert(validator.objIsEqual(message, eventsData.message),
        //     'message returned by API did not match the one from the messageCreated event');

        // });

        it('adds a user to the room', () => {
          testName = 'adds a user to the room';
          // Wait for the events associated with a new membership before completing test..
          membershipCreatedEvent = new Promise((resolve) => {
            flintMembershipCreatedHandler(testName, flint, eventsData, resolve);
          });
          flintMemberEntersEvent = new Promise((resolve) => {
            flintMemberEntersHandler(testName, flint, eventsData, resolve);
          });
          botMemberEntersEvent = new Promise((resolve) => {
            botCreatedRoomBot.memberEntersHandler(testName, eventsData, resolve);
          });

          // Add the non-bot user to the space with the bot
          return botCreatedRoomBot.add(user.emails[0])
            .then((emails) => {
              assert((emails[0] === user.emails[0]),
                'bot.add did not return the expected email');
              // Wait for all the event handlers to fire
              return when.all([membershipCreatedEvent, flintMemberEntersEvent, botMemberEntersEvent]);
            })
            // .then(() => {
            //   // triggers.push(eventsData.trigger);
            //   // assert(validator.objIsEqual(message, eventsData.message),
            //   //   'message returned by API did not match the one from the messageCreated event');
            //   return heard;
            // })
            .catch((e) => {
              console.error(`${testName} failed: ${e.message}`);
              return Promise.reject(e);
            });
        });

        // Need to research if this is still allowed (as the bot)
        // it.only('makes the user a moderator', () => {
        //   testName = 'makes user a moderator';
        //   // Wait for the events associated with a new membership before completing test..
        //   membershipUpdateEvent = new Promise((resolve) => {
        //     flintMembershipUpdatedHandler(testName, flint, eventsData, resolve);
        //   });
        //   flintMemberAddedAsModerator = new Promise((resolve) => {
        //     flintMemberAddedAsModeratorHandler(testName, flint, eventsData, resolve);
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
        //       return when.all([membershipUpdateEvent, flintMemberAddedAsModerator, botMemberAddedAsModerator]);
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
            flintMembershipDeletedHandler(testName, flint, eventsData, resolve);
          });
          flintMemberExitsEvent = new Promise((resolve) => {
            flintMemberExitsHandler(testName, flint, eventsData, resolve);
          });
          botMemberExitsEvent = new Promise((resolve) => {
            botCreatedRoomBot.memberExitsHandler(testName, eventsData, resolve);
          });

          // Add the non-bot user to the space with the bot
          return botCreatedRoomBot.remove(user.emails[0])
            .then((emails) => {
              assert((emails[0] === user.emails[0]),
                'bot.remove did not return the expected email');
              // Wait for all the event handlers to fire
              return when.all([membershipDeletedEvent, flintMemberExitsEvent, botMemberExitsEvent]);
            })
            // .then(() => {
            //   // triggers.push(eventsData.trigger);
            //   // assert(validator.objIsEqual(message, eventsData.message),
            //   //   'message returned by API did not match the one from the messageCreated event');
            //   return heard;
            // })
            .catch((e) => {
              console.error(`${testName} failed: ${e.message}`);
              return Promise.reject(e);
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
            flintMessageCreatedEventHandler(testName, flint, eventsData, resolve);
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
        // });

        // describe('#user.webex.message.create(random)', () => {
        // it('hears anything via a regex', () => {
        //   // set up a flint.hears for this input
        //   const heard = new Promise((resolve) => {
        //     flint.hears(/.*/, (b, t) => {
        //       assert((b.id === userCreatedRoomBot.id),
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

    });

  });
  //   flint.bots[0].newRoom('Flint Test Room')
  //     .then((room) => {
  //       return when(assert(validator.isRoom(room),
  //         'getRoom did not return a valid room'));
  //     }));
  //   //    } // else test the flint method of creating a new room with our bot?
  // });


  // describe('#bot.newRoom()', () => {
  //   // To do figure out a version of this if no bots exist yet
  //   //    if (flint.bots.length) {
  //   it('creates a new space for tests', () => flint.bots[0].newRoom('Flint Test Room')
  //     .then((room) => {
  //       return when(assert(validator.isRoom(room),
  //         'getRoom did not return a valid room'));
  //     }));
  //   //    } // else test the flint method of creating a new room with our bot?
  // });


  // describe('#Flint.getRoom()', () => {
  //   it('returns details for a space', () => flint.getRoom(roomList[0].id)
  //     .then((room) => {
  //       return when(assert(validator.isRoom(room),
  //         'getRoom did not return a valid room'));
  //     }));
  // });

  // describe('#Flint.getmemberships()', () => {
  //   it('returns a list of memberships for a space', () => flint.getMemberships(roomList[0].id)
  //     .then((memberships) => {
  //       membershipsList = memberships;
  //       assert(memberships[0].roomId === roomList[0].id,
  //         'membership.roomId not equal to input to getMemberships');
  //       return when(assert(validator.isMemberships(memberships),
  //         'getMemberships did not return a valid membershp'));
  //     }));
  // });

  // describe('#Flint.getmemberships()', () => {
  //   it('returns a list of my memberships', () => flint.getMemberships()
  //     .then((memberships) => {
  //       memberships;
  //       assert(memberships.length === roomList.length,
  //         'number of my memberships != number of my rooms');
  //       for (let membership of memberships) {
  //         assert(membership.personId === bot.id,
  //           'membership returned by getMemberships does not belong to me');
  //       }
  //       return when(assert(validator.isMemberships(memberships),
  //         'getMemberships did not return a valid membershp'));
  //     }));
  // });
});

//Flint event handlers
// To add start, log, personExits(bot and flint)
function flintStartHandler(testName, flint, promiseResolveFunction) {
  flint.once('start', (id) => {
    flint.debug(`Flint start event occurred in test ${testName}`);
    promiseResolveFunction(assert(id === flint.id));
  });
};

function flintInitializedHandler(testName, flint, promiseResolveFunction) {
  flint.once('initialized', (id) => {
    flint.debug(`Flint initiatlized event occurred in test:${testName}`);
    promiseResolveFunction(assert(id === flint.id));
  });
};

function flintSpawnedHandler(testName, eventsData, promiseResolveFunction) {
  flint.once('spawn', (bot) => {
    flint.debug(`Flint spawned  event occurred in test ${testName}`);
    eventsData.bot = bot;
    promiseResolveFunction(assert(validator.isBot(bot),
      'spawned event did not include a valid bot'));
  });
};

function flintRoomCreatedHandler(testName, flint, eventsData, promiseResolveFunction) {
  flint.once('roomCreated', (room, id) => {
    flint.debug(`Flint roomCreated event occurred in test ${testName}`);
    eventsData.room = room;
    assert((id === flint.id),
      'id returned in flint.on("roomCreated") is not the one expected');
    promiseResolveFunction(assert(validator.isRoom(room),
      'roomCreated event did not include a valid message'));
  });
};

function flintMembershipCreatedHandler(testName, flint, eventsData, promiseResolveFunction) {
  flint.once('membershipCreated', (membership, id) => {
    flint.debug(`Flint membershipCreated event occurred in test ${testName}`);
    eventsData.membership = membership;
    assert(validator.isMembership(membership),
      'membershipCreated event did not include a valid membership');
    promiseResolveFunction(assert(id === flint.id));
  });
};

function flintMembershipUpdatedHandler(testName, flint, eventsData, promiseResolveFunction) {
  flint.once('membershipUpdated', (membership, id) => {
    flint.debug(`Flint membershipUpdated event occurred in test ${testName}`);
    eventsData.membership = membership;
    assert(validator.isMembership(membership),
      'membershipUpdated event did not include a valid membership');
    promiseResolveFunction(assert(id === flint.id));
  });
};


function flintMessageCreatedEventHandler(testName, flint, eventsData, promiseResolveFunction) {
  flint.once('messageCreated', (message, id) => {
    flint.debug(`Flint messageCreated event occurred in test ${testName}`);
    eventsData.message = message;
    assert((id === flint.id),
      'id returned in flint.on("messageCreated") is not the one expected');
    promiseResolveFunction(assert(validator.isMessage(message),
      'memssageCreated event did not include a valid message'));
  });
};

function flintMentionedHandler(testName, flint, eventsData, promiseResolveFunction) {
  flint.once('mentioned', (bot, trigger, id) => {
    flint.debug(`Flint mentioned event occurred in test ${testName}`);
    assert(validator.isBot(bot),
      'mentioned event did not include a valid bot');
    assert((bot.id === eventsData.bot.id),
      'bot returned in flint.on("mentioned") is not the one expected');
    assert(validator.isTrigger(trigger),
      'mentioned event did not include a valid trigger');
    eventsData.trigger = trigger;
    assert((id === flint.id),
      'id returned in flint.on("mentioned") is not the one expected');
    promiseResolveFunction(true);
  });
};

function flintMessageHandler(testName, flint, eventsData, promiseResolveFunction) {
  flint.once('message', (bot, trigger, id) => {
    flint.debug(`Flint message event occurred in test ${testName}`);
    assert(validator.isBot(bot),
      'message event did not include a valid bot');
    assert((bot.id === eventsData.bot.id),
      'bot returned in flint.on("message") is not the one expected');
    assert(validator.isTrigger(trigger),
      'message event did not include a valid trigger');
    eventsData.trigger = trigger;
    assert((id === flint.id),
      'id returned in flint.on("message") is not the one expected');
    promiseResolveFunction(true);
  });
};

function flintMemberEntersHandler(testName, flint, eventsData, promiseResolveFunction) {
  flint.once('memberEnters', (bot, membership, id) => {
    flint.debug(`Flint memberEnters event occurred in test ${testName}`);
    assert(validator.isBot(bot),
      'bot in memberEnters event did not include a valid bot');
    assert((bot.id === eventsData.bot.id),
      'bot returned in flint.on("memberEnters") is not the one expected');
    // TODO validate membership
    assert((id === flint.id),
      'id returned in flint.on("memberEnters") is not the one expected');
    promiseResolveFunction(true);
  });
};

function flintMemberAddedAsModeratorHandler(testName, flint, eventsData, promiseResolveFunction) {
  flint.once('memberAddedAsModerator', (bot, membership, id) => {
    flint.debug(`Flint memberAddedAsModerator event occurred in test ${testName}`);
    assert(validator.isBot(bot),
      'bot in memberAddedAsModerator event did not include a valid bot');
    assert((bot.id === eventsData.bot.id),
      'bot returned in flint.on("memberAddedAsModerator") is not the one expected');
    assert((membership.id === eventsData.membership.id),
      'membership returned in flint.on("memberAddedAsModerator") is not the one expected');
    assert(validator.isMembership(membership),
      'membership returned in flint.on("memberAddedAsModerator") is not valid');
    assert((id === flint.id),
      'id returned in flint.on("personEmemberAddedAsModeratornters") is not the one expected');
    promiseResolveFunction(true);
  });
};

function flintMemberExitsHandler(testName, flint, eventsData, promiseResolveFunction) {
  flint.once('memberExits', (bot, membership, id) => {
    flint.debug(`Flint memberExits event occurred in test ${testName}`);
    assert(validator.isBot(bot),
      'bot in memberExits event did not include a valid bot');
    assert((bot.id === eventsData.bot.id),
      'bot returned in flint.on("memberExits") is not the one expected');
    assert((membership.id === eventsData.membership.id),
      'membership returned in flint.on("memberExits") is not the one expected');
    assert(validator.isMembership(membership),
      'membership returned in flint.on("memberExits") is not valid');
    assert((id === flint.id),
      'id returned in flint.on("memberExits") is not the one expected');
    promiseResolveFunction(true);
  });
};


function flintMembershipDeletedHandler(testName, flint, eventsData, promiseResolveFunction) {
  flint.once('membershipDeleted', (membership, id) => {
    flint.debug(`Flint membershipDeleted event occurred in test ${testName}`);
    assert(id === flint.id);
    assert(validator.isMembership(membership),
      'membership returned in flint.on("membershipDeleted") is not valid');
    eventsData.membership = membership;
    promiseResolveFunction(assert(validator.isMembership(membership),
      'membershipDeleted event did not include a valid membership'));
  });
};

function flintDespawnHandler(testName, flint, eventsData, promiseResolveFunction) {
  flint.once('despawn', (bot, id) => {
    flint.debug(`Flint despawn event occurred in test ${testName}`);
    assert(eventsData.bot.id === bot.id);
    assert((id === flint.id),
      'id returned in flint.on("despawn") is not the one expected');
    promiseResolveFunction(assert(validator.isBot(bot),
      'despawn event did not include a valid bot'));
  });
};

function flintStopHandler(testName, flint, promiseResolveFunction) {
  flint.once('stop', (id) => {
    flint.debug(`Flint stop event occurred in test ${testName}`);
    promiseResolveFunction(assert(id === flint.id));
  });
};

// Bot event handlers (set up when a new bot instance is created)
function createBotEventHandlers(activeBot) {
  activeBot.mentionedHandler = function (testName, eventsData, promiseResolveFunction) {
    activeBot.once('mentioned', (bot, trigger, id) => {
      flint.debug(`Bot mentioned event occurred in test ${testName}`);
      assert(validator.isBot(bot),
        'mentioned event did not include a valid bot');
      assert((bot.id === activeBot.id),
        'bot returned in bot.on("mentioned") is not the one expected');
      assert(validator.isTrigger(trigger),
        'mentioned event did not include a valid trigger');
      assert((id === activeBot.id),
        'id returned in flint.on("mentioned") is not the one expected');
      promiseResolveFunction(true);
    });
  };

  activeBot.messageHandler = function (testName, eventsData, promiseResolveFunction) {
    activeBot.once('message', (bot, trigger, id) => {
      flint.debug(`Bot message event occurred in test ${testName}`);
      assert(validator.isBot(bot),
        'message event did not include a valid bot');
      assert((bot.id === activeBot.id),
        'bot returned in bot.on("message") is not the one expected');
      assert(validator.isTrigger(trigger),
        'message event did not include a valid trigger');
      assert((id === activeBot.id),
        'id returned in flint.on("message") is not the one expected');
      promiseResolveFunction(true);
    });
  };

  activeBot.memberEntersHandler = function (testName, eventsData, promiseResolveFunction) {
    activeBot.once('memberEnters', (bot, membership) => {
      flint.debug(`Bot memberEnters event occurred in test ${testName}`);
      assert(validator.isBot(bot),
        'bot memberEnters event did not include a valid bot');
      assert((bot.id === activeBot.id),
        'bot returned in bot.on("memberEnters") is not the one expected');
      assert((membership.id === eventsData.membership.id),
        'membership returned in flint.on("memberEnters") is not the one expected');
      assert(validator.isMembership(membership),
        'membership returned in flint.on("memberEnters") is not valid');
      promiseResolveFunction(true);
    });
  };

  activeBot.memberAddedAsModerator = function (testName, eventsData, promiseResolveFunction) {
    activeBot.once('memberAddedAsModerator', (bot, membership) => {
      flint.debug(`Bot memberAddedAsModerator event occurred in test ${testName}`);
      assert(validator.isBot(bot),
        'bot memberAddedAsModerator event did not include a valid bot');
      assert((bot.id === activeBot.id),
        'bot returned in bot.on("memberAddedAsModerator") is not the one expected');
      assert((membership.id === eventsData.membership.id),
        'membership returned in flint.on("memberAddedAsModerator") is not the one expected');
      assert(validator.isMembership(membership),
        'membership returned in flint.on("memberAddedAsModerator") is not valid');
      promiseResolveFunction(true);
    });
  };

  activeBot.memberExitsHandler = function (testName, eventsData, promiseResolveFunction) {
    activeBot.once('memberExits', (bot, membership) => {
      flint.debug(`Bot memberExits event occurred in test ${testName}`);
      assert(validator.isBot(bot),
        'bot memberExits event did not include a valid bot');
      assert((bot.id === activeBot.id),
        'bot returned in bot.on("memberExits") is not the one expected');
      assert((membership.id === eventsData.membership.id),
        'membership returned in flint.on("memberExits") is not the one expected');
      assert(validator.isMembership(membership),
        'membership returned in flint.on("memberExits") is not valid');
      promiseResolveFunction(true);
    });
  };

  activeBot.stopHandler = function (testName, promiseResolveFunction) {
    activeBot.once('stop', (bot) => {
      flint.debug(`Bot stop event occurred in test ${testName}`);
      assert(validator.isBot(bot),
        'bot event did not include a valid bot');
      assert((bot.id === activeBot.id),
        'bot returned in bot.on("stop") is not the one expected');
      promiseResolveFunction(true);
    });
  };
};



// Additional flint events to-do
// attachmentAction
// files (and for bot)
// despawn



// Delete spaces leftover from previous test runs
function cleanupFromPreviousTests(flint) {
  for (let bot of flint.bots) {
    assert(validator.isBot(bot),
      'bot in flint.bots did not validate preoprly!');
    if ((bot.room.title === User_Test_Space_Title) ||
      (bot.room.title === Bot_Test_Space_Title)) {
      flint.debug('Removing room left over from previous test...');
      flint.webex.rooms.remove(bot.room);
    }
  }
}

function asUserCeanupFromPreviousTests(userWebex) {
  userWebex.rooms.list()
    .then((rooms) => {
      for (let room of rooms.items) {
        if ((room.title === User_Test_Space_Title) ||
          (room.title === Bot_Test_Space_Title)) {
          flint.debug('As user, removing room left over from previous test...');
          userWebex.rooms.remove(room);
        }
      }
    });
}
