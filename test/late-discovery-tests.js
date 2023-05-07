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
var common = require('./common/common');
let testInfo  = common.testInfo;
let assert = common.assert;
let when = common.when;
const _ = require('lodash');


console.log('**********************************************');
console.log('* Framework tests with late space discovery...');
console.log('**********************************************\n');

// Initialize the framework and user objects once for all the tests
let framework;
let frameworkOptions = {};
require('dotenv').config();
if ((typeof process.env.BOT_API_TOKEN === 'string') &&
  (typeof process.env.USER_API_TOKEN === 'string') &&
  (typeof process.env.HOSTED_FILE === 'string')) {
  frameworkOptions.token = process.env.BOT_API_TOKEN;
  // This is the key to these tests, we wont discover any spaces on 
  // startup, just when a message:created event occurs
  frameworkOptions.maxStartupSpaces = 0;
  // Enable Message Process Speed Profiling in tests
  frameworkOptions.profileMsgProcessingTime = true;

  framework = new Framework(frameworkOptions);
} else {
  console.error('Missing required environment variables:\n' +
    '- BOT_API_TOKEN -- token associatd with an existing bot\n' +
    '- USER_API_TOKEN -- token associated with an existing user\n' +
    '- HOSTED_FILE -- url to a file that can be attached to test messages\n' +
    'The tests will create a new space with the bot and the user');
  process.exit(-1);
}

// Initialize the SDK for the user and set them in the test's common object
let userOptions = {credentials: {access_token: process.env.USER_API_TOKEN}};
let userWebex = Webex.init(userOptions);
common.setFramework(framework);
common.setUser(userWebex);

// Initialize the instance of framework that we will use across multiple tests
describe('#framework', function() {
  common.setMochaTimeout(this.timeout());

  before(() => {
    return common.initFramework('framework init', framework, userWebex)
      .then(() => {
        // Validate that the framework has no spawned bots initially
        if (framework.bots.length) {
          return when.reject(new Error('Framework.init() spawned bots despite maxStartupSpaces=0'));
        }
        console.log('Validated that framework initialized with no spawned bots as expected');
        // Set a spawn handler to track the just-in-time spawned bot
        framework.on('spawn', (bot, frameworkId) => {
          console.log('Validated that a spawn event occurred after message was sent.');
          assert((frameworkId === framework.id),
            `In ${testInfo.config.testName}, the frameworkId passed to the spawned handler was not as expected`);
        });
      });
  });

  before(() => {
    // Before starting the test validate that the test user has an
    // existing 1-1 space with the test bot
    let directSpaceExists = false;
    return userWebex.memberships.list()
      .then((m) => {
        let directSpaces = _.filter(m.items, space => (space.roomType === 'direct'));
        if (!directSpaces.length) {
          return when.reject(new Error('Late Discovery tests only work if the test user and bot have an existing 1-1 space.'));
        }
        // Build a call to get memberships for all direct spaces
        let lookupMemberships = _.map(directSpaces, s => {
          return userWebex.memberships.list({roomId: s.roomId})
            .then((m) => {
              let theBot = _.filter(m.items, member => (member.personId == framework.person.id));
              if (theBot.length) {
                // Found a direct space with the bot, lets proceed!
                directSpaceExists = true;
              }
              return when(true);
            }).catch(() => when(true));
        });
        return when.all(lookupMemberships);
      }).then(() => {
        if (directSpaceExists) {
          console.log('Validated that 1-1 Space exists between test user and bot.');
          return when(true);
        }
        return when.reject(new Error('Late Discovery tests only work if the test user and bot have an existing 1-1 space.'));
      });
  });

  //Stop framework to shut down the event listeners
  after(() => common.stopFramework('shutdown framework', framework));

  // Test bot functions for direct messaging
  // These only work if the test bot and test user already have a direct space
  it('Sends a message to bot to force a just-in-time spawn', () => {
    testInfo.config.testName = 'creates a bot just in time after message';
    testInfo.config.userUnderTest = userWebex;
    testInfo.out = {};
    // Wait for the hears event associated with the input text
    const heard = new Promise((resolve) => {
      framework.hears(/^hi.*/igm, (b, t) => {
        framework.debug('Bot heard message  that user posted');
        assert((b.id == testInfo.out.newBot.id),
          'Bot returned in framework.hears() does not match one returend in framework.on("spawn")');
        assert((t.id == testInfo.out.messageId),
          'Trigger returned in framework.hears() does not match the test message sent.');
        console.log('Validated that framework.hears() was called with newly spawned bot from test message.');
        resolve(true);
      });
    });

    // As the user, send a direct message to the bot
    return common.userSendsDMToBot(framework, testInfo,
      'Hi, this is a message with **no mentions**.', heard);
  });
});

// gracefully shutdown (ctrl-c)
process.on('SIGINT', function () {
  framework.debug('stoppping...');
  framework.stop().then(function () {
    process.exit();
  });
});

