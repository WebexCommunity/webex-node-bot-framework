/* integration-tests.js
 *
 * A set of tests to validate framework functionality
 * when framework is created using an authorized user token
 */

const Framework = require('../lib/framework');
const Webex = require('webex');

console.log('************************************');
console.log('* Framework tests with user token...');
console.log('************************************\n');

// Initialize the framework and user objects once for all the tests
// TODO support another Env variable for emails of users to add to a space in order to test framework batch APIs
let framework, userWebex;
// Read in environment variables
require('dotenv').config();
environmentEvaluated = true;
if ((typeof process.env.AUTHORIZED_USER_API_TOKEN === 'string') &&
  (typeof process.env.USER_API_TOKEN === 'string') &&
  (typeof process.env.HOSTED_FILE === 'string')) {

  // Enable Message Process Speed Profiling in tests
  let frameworkOptions = { token: process.env.AUTHORIZED_USER_API_TOKEN };
  frameworkOptions.profileMsgProcessingTime = true;

  framework = new Framework(frameworkOptions);
  userWebex = Webex.init({ credentials: {access_token: process.env.USER_API_TOKEN }});
} else {
  console.error('Missing required evnvironment variables:\n' +
    '- AUTHORIZED_USER_API_TOKEN -- token associatd with a user who authorized a framework based integrationt\n' +
    '- USER_API_TOKEN -- token associated with an existing user that integration will interact with\n' +
    '- HOSTED_FILE -- url to a file that can be attached to test messages\n' +
    'The tests will create a new space with the bot and the user');
  process.exit(-1);
}


// Load the common module which includes functions and variables
// shared by multiple tests
var common = require("./common/common");
common.setFramework(framework);
common.setUser(userWebex);

// Start up an instance of framework that we will use across multiple tests
describe('#framework', () => {
  // Validate that framework starts and that we have a valid user
  before(() => common.initFramework('framework init', framework, userWebex));

  //Stop framework to shut down the event listeners
  after(() => common.stopFramework('shutdown framework', framework));

  // Test app interactions in a user created test space
  require('./common/user-created-room-tests.js');

  // Test app interactions in a bot created test space
  require('./common/bot-created-room-tests.js');

  // Test app membership functions
  require('./common/bot-membership-tests.js');

  // Test app functions for direct messaging
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

