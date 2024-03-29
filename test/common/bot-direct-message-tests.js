// Variables an functions shared by all tests
var common = require('../common/common');
let framework = common.framework;
let userWebex = common.userWebex;
let testInfo = common.testInfo;
let tm = require('../common/test-messages');
let btm = require('../common/bot-test-messages');

let assert = common.assert;
let validator = common.validator;
let when = common.when;


describe('Bot interacts with user in 1-1 space', () => {
  let frameworkTestRuns = 0;
  let testName = 'Bot 1-1 Space Test';
  let message;
  let trigger = {};

  // // Let's use markdown by default for these test
  let origFormat = framework.messageFormat;
  framework.messageFormat = 'markdown';

  let messageCreatedEvent, frameworkMessageEvent, botMessageEvent;
  // Before running tests check if the test bot exists in a 1-1 space with test user
  // If not generate an info message that 1-1 tests will be skipped
  before(() => {
    testInfo.config.isDirectTest = true;
    if (!common.botForUser1on1Space) {
      console.error('No 1-1 space to run direct message tests.  This isn\'t bad, it just is...');
      console.error('Since 1-1 spaces can never be removed the tests will not create one.');
      console.error('If you want to run the direct message tests, manually create a 1-1 space with your test bot and test user.');
      console.error('Otherwise, seeing a bunch of skipped tests is the expected result.');
      return;
    } else {
      testInfo.config.botUnderTest = common.botForUser1on1Space;
      testInfo.config.roomUnderTest = common.botForUser1on1Space.room;  
      testInfo.config.userUnderTest = userWebex;
      common.createBotEventHandlers(common.botForUser1on1Space);
    }
  });

  after(() =>{
    delete testInfo.config.roomUnderTest;
    delete testInfo.config.userUnderTest;
    delete testInfo.config.isDirectTest;
  });

  // Note that each test will be skipped if no 1-1 space
  // this.skip syntax does not work with arrow functions, 
  // hence function() syntax for thes tests
  it('checks for persistent storage from previous tests', function () {
    if (!common.botForUser1on1Space) {
      this.skip();
    }
    
    let bot = common.botForUser1on1Space;
    if (process.env.MONGO_USER) {
      return bot.recall('frameworkTestRuns')
        .then((count) => {
          frameworkTestRuns = count;
          framework.debug(`Found persistent config "frameworkTestRuns": ${count}`);
          return Promise.resolve(true);
        })
        .catch((e) => {
          return Promise.reject(new Error(`Did not find persistent config "frameworkTestRuns": ${e.message}` +
            ' This is expected the first time the test is run'));
        });
    } else {
      framework.debug('Skipping persistent storage test for non Mongo storage provider');
      return Promise.resolve(true);
    }
  });


  // TODO - Add code to skip these if no 1-1 space exists
  testInfo;
  describe('Run standard user and bot message tests in 1-1 space', () => {
    describe('User sends message and bot may respond', () => {
      // loop through user message tests..
      tm.runUserMessageTests(framework, testInfo, tm.testMessages);
      ///* botShouldRespond = */true);
    });
  
    describe('bot sends messages', () => {
      // loop through bot message tests..
      btm.runBotMessageTests(framework, testInfo, btm.botTestMessages); 
      ///* shouldFail = */false);
    });
  
  });
 

  describe('Run direct message only tests in 1-1 space', () => {
    // Setup the promises for the events that come from user input that mentions a bot
    beforeEach(() => {
      message = {};

      if (!common.botForUser1on1Space) {
        return;
      }
        
      // Wait for the events associated with a new message before completing test..
      messageCreatedEvent = new Promise((resolve) => {
        common.frameworkMessageCreatedEventHandler(framework, testInfo, resolve);
      });
      frameworkMessageEvent = new Promise((resolve) => {
        common.frameworkMessageHandler(framework, testInfo, resolve);
      });
      botMessageEvent = new Promise((resolve) => {
        common.botForUser1on1Space.messageHandler(testInfo, resolve);
      });
    });

    after(() => 
      // restore the default framework message format
      framework.messageFormat = origFormat
    );

    it('hears the user without needing to be mentioned', function () {
      if (!common.botForUser1on1Space) {
        this.skip();
      }

      testName = 'hears the user without needing to be mentioned';
      // Wait for the hears event associated with the input text
      const heard = new Promise((resolve) => {
        framework.hears(/^DM: hi, /i, (b, t) => {
          testInfo.out.got.push('hears(/^DM: hi, /i)');
          assert((b.id === common.botForUser1on1Space.id),
            'bot returned in fint.hears("hi") is not the one expected');
          assert(validator.objIsEqual(t, testInfo.out.trigger),
            'trigger returned in framework.hears(/^hi.*/) was not as expected');
          assert(t.command == 'DM: Hi, ',
            'trigger.command returned in framework.hears(/^DM: hi, /) was not as expected');
          assert(t.prompt == 'this is a message with no mentions.',
            'trigger.prompt returned in framework.hears(/^DM: hi, /) was not as expected');
          trigger = t;
          framework.debug('Bot heard message  that user posted');
          resolve(true);
        });
      });

      // As the user, send the message, mentioning the bot
      return userWebex.messages.create({
        roomId: common.botForUser1on1Space.room.id,
        markdown: 'DM: Hi, this is a message with **no mentions**.'
      })
        .then((m) => {
          message = m;
          assert(validator.isMessage(message),
            'create message did not return a valid message');
          // Wait for all the event handlers and the heard handler to fire
          return when.all([messageCreatedEvent, frameworkMessageEvent, botMessageEvent, heard]);
        })
        .catch((e) => {
          console.error(`${testName} failed: ${e.message}`);
          return Promise.reject(e);
        });
    });

    it('bot responds with a direct mention via email', function () {
      if (!common.botForUser1on1Space) {
        this.skip();
      }

      testName = 'bot responds with a direct mention';
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

    it('bot responds with a direct mention via personId', function () {
      if (!common.botForUser1on1Space) {
        this.skip();
      }

      testName = 'bot responds with a direct mention via personId';
      // send the bots response
      let msg = 'I heard you - by personId this time -';
      let personId = common.userPerson.id;
      if ((trigger.message) && (trigger.person) && (trigger.message.markdown)) {
        msg += ` say: "${trigger.message.markdown}"`;
      } else {
        console.error('Could not read previous test trigger object.  Did the test fail?');
      }

      return common.botForUser1on1Space.dm(personId, msg)
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

    it('bot sends a plain text message in the 1-1 space', function () {
      if (!common.botForUser1on1Space) {
        this.skip();
      }

      testName = 'bot sends a plain text message in the 1-1 space';
      // send the bots response
      let msg = 'This is a **plain text** message.';
      let personId = common.userPerson.id;
      return common.botForUser1on1Space.dm(personId, 'text', msg)
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

    it('bot sends a plain text message using a message object in the 1-1 space', function () {
      if (!common.botForUser1on1Space) {
        this.skip();
      }

      testName = 'bot sends a plain text message using a message object in the 1-1 space';
      // send the bots response
      let msg = 'This is a **plain text** message sent in the markdown fields of a message request.';
      let personId = common.userPerson.id;
      return common.botForUser1on1Space.dm(personId, 'text', {markdown: msg})
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

    it('bot sends a card in the 1-1 space', function () {
      if (!common.botForUser1on1Space) {
        this.skip();
      }

      testName = 'bot sends a card in the 1-1 space';
      // send the bots response
      let cardJson = require('../common/input-card.json');
      let personEmail = common.userPerson.emails[0];
      return common.botForUser1on1Space.dmCard(personEmail, cardJson, 'What is your name')
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

  it('updates persistent storage for the next tests', function () {
    if (!common.botForUser1on1Space) {
      this.skip();
    }

    let bot = common.botForUser1on1Space;
    if (process.env.MONGO_USER) {
      return bot.store('frameworkTestRuns', frameworkTestRuns + 1)
        .catch((e) => {
          return Promise.reject(new Error(`Failed to update persistent config "frameworkTestRuns": ${e.message}`));
        });
    } else {
      framework.debug('Skipping persistent storage test for non Mongo storage provider');
      return Promise.resolve(true);
    }
  });

});
