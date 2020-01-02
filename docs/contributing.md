## Contributing

#### Build

## Rebuilding Docs

The `build.sh` script in this folder generates the README.md for the project.
This build script requires that you have installed the dev dependencies of this project.

To build the docs:
```bash
npm i --only=dev
npm run build
```
(note: the dependencies only need to be installed once)

#### Test

Before submitting a pull request, please validate that all tests work and are augmented as necessary, to test your new functionality.   It is reccomended that you familiarize yourself with the tests BEFORE begining any feature related work.

The tests require the following environment variables which will be read in from a .env file if one is available.
| Variable| Value | Purpose                    |
| --------------- | -------------- | ------------------------------ | 
|BOT_API_TOKEN             | Token of a bot created on [Webex For Developers](https://developer.webex.com/my-apps/new/bot)| Identity of bot to test framework with.  There is no need to have any actual bot code associated with this token, in fact its probably better if there isnt.|
|USER_API_TOKEN             | Token of a user that the test bot will interact with.  This can be grabbed from [Webex For Developers](https://developer.webex.com/docs/api/getting-started/accounts-and-authentication)| This user will create rooms with the bot, (and vice versa) and exchange messages with it.  Rooms will be deleted at the end of the test.|
|HOSTED_FILE             | URL for a file to upload in some of the message tests.| Any file suppported by Webex Teams will do, perhaps the one here: https://www.webex.com/content/dam/wbx/us/images/hp/hp_56565/Teams_Iconx2.png|
|DEBUG             | framework| Optionally set DEBUG=framework for extended debug output during the test run.|

When the environment is set, run the tests:
```bash
npm i --only=dev 
npm run test
```
(note: the dependencies only need to be installed once)

The test suite includes direct message tests.  These will run ONLY if an existing one-one space exists between the test bot and test user.  To run these tests, manually create this 1-1 space.

It is also possible to run the tests by instantiating the framework with an authorized user token (as an integration would do).  At this time the framework does not proivide any integration specific functionality (such as authorization or token management), but the framework CAN be used with these types of tokens.  These tests are similar but the user does not at-mention the bot.   

To run the user tests set the following environment variables:
| Variable| Value | Purpose                    |
| --------------- | -------------- | ------------------------------ | 
|AUTHORIZED_FLINT_USER_API_TOKEN            | Token of a user. This can be extracted from the developer portal or obtained by via an OAuth flow with an integration.| Identity of a non bot user to test framework with.  There is no need to have any actual integration code associated with this token, in fact its probably better if there isnt.|
|USER_API_TOKEN             | Token of a user that the test bot will interact with.  This can be grabbed from [Webex For Developers](https://developer.webex.com/docs/api/getting-started/accounts-and-authentication)| This user will create rooms with the bot, (and vice versa) and exchange messages with it.  Rooms will be deleted at the end of the test. **Make sure this is a different user from the AUTHORIZED_FLINT_USER**|
|HOSTED_FILE             | URL for a file to upload in some of the message tests.| Any file suppported by Webex Teams will do, perhaps the one here: https://www.webex.com/content/dam/wbx/us/images/hp/hp_56565/Teams_Iconx2.png|

When the environment is set, run the tests:
```bash
npm i --only=dev 
npm run test-as-user
```


# Support this Project

Find this project useful? Help suppport the continued development by submitting issues, feature requests, or code. 

For details on areas that may still require attention,please see the [To Do List](./todo.md)



