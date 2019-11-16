/* bot-tests.js
 *
 * A set of tests to validate flint functionality
 * when flint is created using a bot token
 */

const Flint = require('../lib/flint');
const Webex = require('webex');
console.log('Starting bot-tests...');

// Initialize the flint and user objects once for all the tests
let flint, userWebex;
require('dotenv').config();
if ((typeof process.env.BOT_API_TOKEN === 'string') &&
  (typeof process.env.USER_API_TOKEN === 'string') &&
  (typeof process.env.HOSTED_FILE === 'string')) {
  flint = new Flint({ token: process.env.BOT_API_TOKEN });
  userWebex = new Webex({ credentials: process.env.USER_API_TOKEN });
} else {
  console.error('Missing required evnvironment variables:\n' +
    '- BOT_API_TOKEN -- token associatd with an existing bot\n' +
    '- USER_API_TOKEN -- token associated with an existing user\n' +
    '- HOSTED_FILE -- url to a file that can be attached to test messages\n' +
    'The tests will create a new space with the bot and the user');
  process.exit(-1);
}

// Load the common module which includes functions and variables
// shared by multiple tests
var common = require("./common/common");
common.setFlint(flint);
common.setUser(userWebex);

// Start up an instance of flint that we will use across multiple tests
describe('#flint', () => {
  // Validate that flint starts and that we have a valid user
  before(() => common.initFlint('flint init', flint, userWebex));

  //Stop flint to shut down the event listeners
  after(() => common.stopFlint('shutdown flint', flint));

  // Run some basic validation against the flint methods
  // Could probably get rid of these if they are used internally by the other tests
  require('./common/flint-functions.js');

  // Test bot interactions in a user created test space
  require('./as-bot/user-created-room-tests.js');

  // Test bot interactions in a bot created test space
  require('./as-bot/bot-created-room-tests.js');

  // Test bot's membership functions
  require('./common/bot-membership-tests.js');

  // Test bot functions for direct messaging
  // These only work if the test bot and test user already have a direct space
  require('./common/bot-direct-message-tests.js');
});

// gracefully shutdown (ctrl-c)
process.on('SIGINT', function () {
  flint.debug('stoppping...');
  flint.stop().then(function () {
    process.exit();
  });
});

