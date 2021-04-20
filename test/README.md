# Framework Tests

There are a number of mocha tests designed to test various aspects of the framework.  Each test instantiates (at least one) instance of the framework, and many also initialize the Webex SDK as another user so that the tests can emulate interaction between the user and the bot.

The tests use the mocha framework and require that `npm install` is run without the `--production` flag so that all of the devDependencies are installed

The tests are typically run from the room directory of the package using an `npm run ...` command.

Each test requires the following environment variables, which are commonly set in a .env file in the root directory of the package:

- BOT_API_TOKEN - a webex token belonging to a bot
- USER_API_TOKEN - a webex token belong to another webex user
- HOSTED_FILE - a url to a file that can be posted as a message attachment

## Bot Tests

The bot tests exercise the most common framework functionality, with a user creating a space, adding a bot, and then sending a variety of messages that include mention of the bot to trigger various responses.

In addition, the tests are also run in a space created by the bot.

To start the basic bot test run `npm run test`

## Invalid Config Tests

These tests validate that the framework generates usable error messages when the configuration object used to create the framework has invalid configuration options.

To start the invalid config test run `npm run test-invalid-config`

## Test As User

These test expect that the framework is initialized with a user token (as opposed to a bot token), and and validate that the framework gets notifications for messages posted in spaces even when the user is not explicitly mentioned.

The user tests require the following environment variables:

- AUTHORIZED_USER_API_TOKEN - a token for a non bot user (who is not the same as the user associated with the USER_API_TOKEN


To start the framework as user test, run `npm run test-as-user`

## Mongo DB Storage Tests

These tests validate the framework's storage methods such as `bot.store()` and `bot.recall()` using the Mongo storage provider.  They require the following additional environment variables:

- MONGO_URI - a fully qualified url (including username/password) to the Mongo DB to user
- MONGO_BOT_STORE - the name of the collection to use for the bot storage
- MONGO_BOT_METRICS - the name of the collection to write bot metrics to
  
The test also expect the following environment variable and value:
- INIT_STORAGE='{"initKey":"initVal","initCount":0,"subObj":{"subKey":"subVal"}}'

To run the storage test, run `npm run test-mongo`

## Late Discovery Tests

For popular bots that are members of hundreds or thousands of spaces, the framework can speed up initialization by requesting only a subset of spaces, specified via the configuration parameter `maxStartupSpaces`. Later if the bot is mentioned in a space that it has not previously discovered, it can create a bot instance for that space "just in time".

The late discovery tests, validate this behavior.  To run these tests, run `npm run test-late-discovery`

## Membership Rules Tests

The framework can be configured to disallow bots from interacting in spaces where users don't meet certain [Membership-Rules](../docs/membership-rules-readme.md).

The membership rules tests, validate this behavior, and require the following environment variables:

- ALLOWED_DOMAINS - a comma separated list of email domains that the bot can interact with
- VALID_USER_API_TOKEN - a token for a user who's email address is in the allowed domain list (other than the user associated with the USER_API_TOKEN)
- DISALLOWED_USER_API_TOKEN - a token for a user who's email address is not in the allowed domain list
- ANOTHER_DISALLOWED_USERS_EMAIL - an email address for another valid webex user who is not in the allowed domain list
- AUTHORIZED_USER_API_TOKEN - a token for a user who's email address is in the allowed domain list

To run the membership rules tests, run `npm run test-membership-rules`

## Guide mode tests

"Guide mode" is a membership rules variant that is useful during the early stages of bot development.  When guide mode is activated the bot will only run in spaces that have at least one member who's email is in the configuration parameter `guideEmails`

The Guide mode tests require the same environment variables as the membership rules tests.   The "guide" is set to the user who's token is specified via the `AUTHORIZED_USER_API_TOKEN`.

To run the guide mode tests, run `npm run test-guide-mode-rules`

## Run All Tests

I tried to create an `npm run test-all` command to run all the tests, but it runs them all in paralell.  Perhaps someone who understands how mocha tests (or maybe just basic npm and shell), can figure this out.

The [package.json](./package.json) includes a command `npm run test-all` that shows how I tried to do this.
