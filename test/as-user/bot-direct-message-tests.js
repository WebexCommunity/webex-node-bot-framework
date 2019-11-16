// Variables an functions shared by all tests
var common = require("../common/common");
let flint = common.flint;
let userWebex = common.userWebex;

let assert = common.assert;
let validator = common.validator;
let when = common.when;


describe('Bot interacts with user in 1-1 space', () => {

  let testName = 'Bot 1-1 Space Test';
  let message;
  let eventsData = {};
  let trigger = {};
  let messageCreatedEvent, flintMessageEvent, botMessageEvent;
  // Setup the promises for the events that come from user input that mentions a bot
  beforeEach(() => {
    message = {};
    if (!common.botForUser1on1Space) {
      return when(true);
    }

    // Wait for the events associated with a new message before completing test..
    eventsData = { bot: common.botForUser1on1Space };
    common.createBotEventHandlers(common.botForUser1on1Space);
    messageCreatedEvent = new Promise((resolve) => {
      common.flintMessageCreatedEventHandler(testName, flint, eventsData, resolve);
    });
    flintMessageEvent = new Promise((resolve) => {
      common.flintMessageHandler(testName, flint, eventsData, resolve);
    });
    botMessageEvent = new Promise((resolve) => {
      common.botForUser1on1Space.messageHandler(testName, eventsData, resolve);
    });
  });


  it('hears the user without needing to be mentioned', () => {
    testName = 'hears the user without needing to be mentioned';
    if (!common.botForUser1on1Space) {
      console.error('No 1-1 space to run direct message tests.  This isn\'t bad, it just is...');
      console.error('If you want to run the direct message tests, manually create a 1-1 space with your test bot and test user.');
      return this.skip();
    }
    // Wait for the hears event associated with the input text
    const heard = new Promise((resolve) => {
      flint.hears(/^DM: hi.*/igm, (b, t) => {
        assert((b.id === common.botForUser1on1Space.id),
          'bot returned in fint.hears("hi") is not the one expected');
        assert(validator.objIsEqual(t, eventsData.trigger),
          'trigger returned in flint.hears(/^hi.*/) was not as expected');
        trigger = t;
        flint.debug('Bot heard message  that user posted');
        resolve(true);
      });
    });

    // As the user, send the message, mentioning the bot
    return userWebex.messages.create({
      roomId: common.botForUser1on1Space.room.id,
      markdown: `DM: Hi, this is a message with **no mentions**.`
    })
      .then((m) => {
        message = m;
        assert(validator.isMessage(message),
          'create message did not return a valid message');
        // Wait for all the event handlers and the heard handler to fire
        return when.all([messageCreatedEvent, flintMessageEvent, botMessageEvent, heard]);
      })
      .catch((e) => {
        console.error(`${testName} failed: ${e.message}`);
        return Promise.reject(e);
      });
  });

  it('bot responds with a direct mention', () => {
    testName = 'bot responds with a direct mention';
    if (!common.botForUser1on1Space) {
      return this.skip();
    }
    // send the bots response
    let msg = 'I heard you';
    let email = common.botForUser1on1Space.isDirectTo;
    if ((trigger.message) && (trigger.person) &&
      (trigger.message.markdown) && (trigger.person.emails[0])) {
      msg += ` say: "${trigger.message.markdown}"`;
      email = trigger.person.emails[0];
    } else {
      console.error('Could not read previous test trigger object.  Did the test fail?');
    }

    return common.botForUser1on1Space.dm(email, msg)
      .then((m) => {
        message = m;
        // messages.push(m); 
        assert(validator.isMessage(message),
          'create message did not return a valid message');
        // Wait for all the event handlers and the heard handler to fire
        return when(messageCreatedEvent);
      })
      .catch((e) => {
        console.error(`${testName} failed: ${e.message}`);
        return Promise.reject(e);
      });
  });

});
