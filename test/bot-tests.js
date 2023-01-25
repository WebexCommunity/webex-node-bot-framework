/* bot-tests.js
 *
 * A set of tests to validate framework functionality
 * when framework is created using a bot token
 */

const Framework = require('../lib/framework');
const Webex = require('webex');

console.log('***********************************');
console.log('* Framework tests with bot token...');
console.log('***********************************\n');

// Initialize the framework and user objects once for all the tests
let framework, userWebex;
require('dotenv').config();
if ((typeof process.env.BOT_API_TOKEN === 'string') &&
  (typeof process.env.USER_API_TOKEN === 'string') &&
  (typeof process.env.HOSTED_FILE === 'string')) {
  frameworkOptions = { token: process.env.BOT_API_TOKEN };
  if (typeof process.env.INIT_STORAGE === 'string') {
    try {
      frameworkOptions.initBotStorageData = JSON.parse(process.env.INIT_STORAGE);
    } catch (e) {
      console.error(`Unable to parse INIT_STORAGE value:${process.env.INIT_STORAGE}`);
      console.error(`${e.message}`);
      console.error('Make sure to set this to optional environment to a ' +
        'properly stringified JSON object in order to test that the storage adapter properly adds it to new bots.');
      process.exit(-1);
    }
  }
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

//require('./common/invalid-config-tests.js');

// Start up an instance of framework that we will use across multiple tests
describe('#framework', () => {
  // Validate that framework starts and that we have a valid user
  before(() => common.initFramework('framework init', framework, userWebex));

  //Stop framework to shut down the event listeners
  after(() => common.stopFramework('shutdown framework', framework));

  // Test bot interactions in a user created test space
  require('./common/user-created-room-tests.js');

  // Test bot interactions in a bot created test space
  require('./common/bot-created-room-tests.js');

  // Test bot's membership functions
  require('./common/bot-membership-tests.js');

  // Test bot functions for direct messaging
  // These only work if the test bot and test user already have a direct space
  require('./common/bot-direct-message-tests.js');
});

// gracefully shutdown (ctrl-c)
process.on('SIGINT', function () {
  framework.debug('stoppping...');
  framework.stop().then(function () {
    process.exit();
  });
});

