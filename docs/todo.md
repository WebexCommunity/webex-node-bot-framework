# Webex-node-bot-framework TO-DO

While this project is inspired by the awesome [node-flint](https://github.com/flint-bot/flint/) framework by [Nick Marus](https://github.com/nmarus), there are aspects of that project that have not been tested yet.

Contributions to make this fully formed are welcome please see the [Contribution Guide](./contributing.md)

## Basic functionality
The initial goal of the project was to support the basic framework initiation and support the .hears() and basic bot funtionality.  This work is primarily complete but the following functions need more testing and validation

- [ ] Add tests for the Teams functions
- [ ] Remove code that prevents bots from making moderator status changes
- [ ] Add tests for moderator functions using integration token
- [ ] Add tests for bot.getMessages using integration token
- [x] Add tests for bot.dm (only if test bot and user already have a 1-1 space)
- [x] Add tests for bot.uploadStream, bot.messageStreamRoom, bot.upload
- [x] Add tests for bot.censor
- [x] Add tests for bot.roomRename
- [ ] Expand tests for bot.newRoom to exercise an array of users to be added, and with the moderator flag on
- [ ] Add convenience functions promised in the migration readme
- [ ] Re-add support for retries after 429, was in sparky, but is not in webex sdk
- [ ] Validate that pagination works the same way with webex sdk

## Documentation

- [x] Ensure all the samples work
- [ ] Update the core readme to discuss how the framework starts up
- [x] Update the core readme to discuss websockets vs. webhooks

## Modifications to the framework

- [x] Rename from flint to framework
- [x] Get rid fo flint pass through functions that are natively supported by the webex sdk
- [x] Update contribution doc to explain how to run tests
- [x] Add retry logic for pagination
- [ ] Add retry logic for 429s
- [ ] Build a webex-node-integration-framework around this framework that demonstrates OAuth token management and creates a unique framework instance for each authorized user

## New functions
A goal of this project was to extend the framework to support new functionality that becomes avaialble on Webex

- [x] Add bot.sayCard()
- [x] Add bot.reply

## Storage
node-flint provides a storage system to allow developers to store and retrieve data associated with individual bot/space combinations.   This framework has not modified that code, but has also not tested it to see if it has broken.

- [x] Add storage tests
- [x] Add mongo storage
- [x] Document that redis is likely broken

## Migrating from node-flint
- [x] Add a chart in the readme that shows the difference in the bot and trigger structures
- [ ] figure out how to format dates with 3 msecs

## Improving the tests

- [ ] Add an ability to create a bot and user on the fly for the tests so tester doesn't have to set tokens first
- [x] Add test case for attachmentAction events
- [x] Refactor the tests so the framework.isBotAccount variable is used to determine if mentions are needed in the user messages
- [x] Break out the tests so they aren't in one monolithic file but don't create a new framework each time
- [ ] Track and report the number of times each flint event was tested, to catch gaps in event validation
- [ ] Add test for setAuthorizer and clearAuthorizer.  Clean up authorizer logic in framework.js so it's more readable.
- [x] Configure tests to add the bot mention in places other than the beginning of the message
- [x] Ensure tests with multiple hears handlers are called in the order of the specified priority
- [ ] Add a test to validate generated help messages
- [x] Refactor tests to reduce redundant code
- [x] Update tests to provide more info on which events did not occur when tests timeout
- [x] Add code to handle unexpected events and fail tests when unexpected events occur
