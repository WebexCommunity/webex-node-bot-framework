/* late-discovery-tests.js
 *
 * A set of tests to validate framework functionality
 * to create bot objects on the fly as opposed
 * to on startup.
 * 
 * These tests require that the bot exist in a one on one
 * space with the test user
 */

const Framework = require('../lib/framework');
const Webex = require('webex');

console.log('**********************************************');
console.log('* Framework tests with late space discovery...');
console.log('**********************************************\n');

// Initialize the framework and user objects once for all the tests
let framework, userWebex;
require('dotenv').config();
if ((typeof process.env.BOT_API_TOKEN === 'string') &&
  (typeof process.env.USER_API_TOKEN === 'string') &&
  (typeof process.env.HOSTED_FILE === 'string')) {
  frameworkOptions = { token: process.env.BOT_API_TOKEN };
  // This is the key to these tests, we wont discover any spaces on 
  // startup, just when a message:created event occurs
  frameworkOptions.maxStartupSpaces = 0;
  // Enable Message Process Speed Profiling in tests
  frameworkOptions.profileMsgProcessingTime = true;

  framework = new Framework(frameworkOptions);
  let userOptions = {credentials: {access_token: process.env.USER_API_TOKEN}};
  userWebex = Webex.init(userOptions);
} else {
  console.error('Missing required environment variables:\n' +
    '- BOT_API_TOKEN -- token associatd with an existing bot\n' +
    '- USER_API_TOKEN -- token associated with an existing user\n' +
    '- HOSTED_FILE -- url to a file that can be attached to test messages\n' +
    'The tests will create a new space with the bot and the user');
  process.exit(-1);
}


// Load the common module which includes functions and variables
// shared by multiple tests
var common = require("./common/common");
common.setFramework(framework);
common.setUser(userWebex);
let assert = common.assert;
let validator = common.validator;
let when = common.when;



// Start up an instance of framework that we will use across multiple tests
describe('#framework', () => {
  let testName = 'creates a bot just in time after message';
  // Validate that framework starts and that we have a valid user
  before(() => common.initFramework('framework init', framework, userWebex));

  // Setup the promises for the events that come from user input that mentions a bot
  // beforeEach(() => {
  //   message = {};
  //   // Wait for the events associated with a new message before completing test..
  //   eventsData = {};
  //   messageCreatedEvent = new Promise((resolve) => {
  //     common.frameworkMessageCreatedEventHandler(testName, framework, eventsData, resolve);
  //   });
  //   frameworkMessageEvent = new Promise((resolve) => {
  //     common.frameworkMessageHandler(testName, framework, eventsData, resolve);
  //   });
  // });

  //Stop framework to shut down the event listeners
  after(() => common.stopFramework('shutdown framework', framework));

  // Test bot functions for direct messaging
  // These only work if the test bot and test user already have a direct space
  it('creates a bot just in time after message', () => {
    // Wait for the hears event associated with the input text
    const heard = new Promise((resolve) => {
      framework.hears(/^hi.*/igm, (b, t) => {
        framework.debug('Bot heard message  that user posted');
        resolve(true);
      });
    });

    // As the user, send the message, mentioning the bot
    return userWebex.messages.create({
      toPersonId: framework.person.id,
      markdown: `Hi, this is a message with **no mentions**.`
    })
      .then((m) => {
        message = m;
        assert(validator.isMessage(message),
          'create message did not return a valid message');
        // Wait for all the event handlers and the heard handler to fire
        return when(heard);
        //return when.all([messageCreatedEvent, frameworkMessageEvent, heard]);
      })
      .catch((e) => {
        console.error(`${testName} failed: ${e.message}`);
        return Promise.reject(e);
      });
  });
});

// gracefully shutdown (ctrl-c)
process.on('SIGINT', function () {
  framework.debug('stoppping...');
  framework.stop().then(function () {
    process.exit();
  });
});

