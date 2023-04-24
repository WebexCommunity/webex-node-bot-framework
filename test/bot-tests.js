/* bot-tests.js
 *
 * A set of tests to validate framework functionality
 * when framework is created using a bot token
 */

const Framework = require('../lib/framework');
const Webex = require('webex');
let MongoStore = {}

// Initialize the framework and user objects once for all the tests
let framework, userWebex;
require('dotenv').config();
// Run tests using bot token by default
let frameworkOptions = { token: process.env.BOT_API_TOKEN };

if (process.env.RUN_TEST_AS_USER) {
  console.log('***********************************');
  console.log('* Framework tests with user token...');
  console.log('***********************************\n');
  if ((typeof process.env.AUTHORIZED_USER_API_TOKEN !== 'string') &&
  (typeof process.env.USER_API_TOKEN !== 'string') &&
  (typeof process.env.HOSTED_FILE !== 'string')) {
    console.error('Missing required environment variables:\n' +
    '- AUTHORIZED_USER_API_TOKEN -- token associatd with a user who authorized a framework based integration\n' +
    '- USER_API_TOKEN -- token associated with an existing user\n' +
    '- HOSTED_FILE -- url to a file that can be attached to test messages\n' +
    'The tests will create a new space with the bot and the user');
    process.exit(-1);
  }
  frameworkOptions.token = process.env.AUTHORIZED_USER_API_TOKEN;
} else {
  if (process.env.RUN_MONGO_TESTS) {
    console.log('******************************************');
    console.log('* Framework mongo storage adapter tests...');
    console.log('******************************************\n');
    MongoStore = require('../storage/mongo');

    if (process.env.MONGO_URI) {
      var mConfig = {};
      mConfig.mongoUri = process.env.MONGO_URI;
      if (process.env.MONGO_BOT_STORE) { mConfig.storageCollectionName = process.env.MONGO_BOT_STORE; }
      if (process.env.MONGO_BOT_METRICS) { mConfig.metricsCollectionName = process.env.MONGO_BOT_METRICS; }
      if (process.env.MONGO_SINGLE_INSTANCE_MODE) { mConfig.singleInstance = true; }
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
    } else {
      console.error('The mongo storage driver requires the following environment variables:\n' +
        '* MONGO_URI -- mongo connection URL see https://docs.mongodb.com/manual/reference/connection-string' +
        '\n\nThe following optional environment variables will also be used if set:\n' +
        '* MONGO_BOT_STORE -- name of collection for bot storage elements (will be created if does not exist).  Will use "webexBotFrameworkStorage" if not set\n' +
        '* MONGO_BOT_METRICS -- name of a collection to write bot metrics to (will be created if does not exist). bot.writeMetric() calls will fail if not set\n' +
        '* MONGO_INIT_STORAGE -- stringified ojbect aassigned as the default startup config if non exists yet\n' +
        '* MONGO_SINGLE_INSTANCE_MODE -- Optimize lookups speeds when only a single bot server instance is running\n\n' +
        'Also note, the mongodb module v3.4 or higher must be available (this is not included in the framework\'s default dependencies)');
      process.exit();
    }
  } else {
  console.log('***********************************');
  console.log('* Framework tests with bot token...');
  console.log('***********************************\n');
  }
  if ((typeof process.env.BOT_API_TOKEN !== 'string') &&
  (typeof process.env.USER_API_TOKEN !== 'string') &&
  (typeof process.env.HOSTED_FILE !== 'string')) {
    console.error('Missing required environment variables:\n' +
    '- BOT_API_TOKEN -- token associatd with an existing bot\n' +
    '- USER_API_TOKEN -- token associated with an existing user\n' +
    '- HOSTED_FILE -- url to a file that can be attached to test messages\n' +
    'The tests will create a new space with the bot and the user');
    process.exit(-1);
  }
}
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

// Load the common module which includes functions and variables
// shared by multiple tests
var common = require("./common/common");
common.setFramework(framework);
common.setUser(userWebex);

// Start up an instance of framework that we will use across multiple tests
describe('#framework', function()  { // don't use arrow so this binds to mocha
  common.setMochaTimeout(this.timeout())
  if (process.env.RUN_MONGO_TESTS) {
    before(() => {
      if ('mongoUri' in mConfig) {
        // Load and initalize the mongo storage driver
        mongoStore = new MongoStore(mConfig);
        // Wait for the connection to the DB to initialize before starting framework
        return mongoStore.initialize()
          .then(() => framework.storageDriver(mongoStore))
          .catch((e) => {
            framework.debug(`Initialization with mongo storage failed: ${e.message}`);
            return Promise.reject(e);
          });
      } else {
        return Promise.reject(new Error(`Invalid mongo configuration`));
      }
    });
  }

  // Validate that framework starts and that we have a valid user
  before(() => common.initFramework('framework init', framework, userWebex));

  //Stop framework to shut down the event listeners
  after(() => common.stopFramework('shutdown framework', framework));

  // Test bot's ability to hear and send messages in user and bot created test spaces
  require('./common/bot-message-and-hear-tests.js');

  // Test bot's storage and membership functions
  require('./common/bot-membership-tests.js');

  // Test bot functions for direct messaging
  require('./common/bot-direct-message-tests.js');

});

// gracefully shutdown (ctrl-c)
process.on('SIGINT', function () {
  framework.debug('stoppping...');
  framework.stop().then(function () {
    process.exit();
  });
});

