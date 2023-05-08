# Running the Tests

This pacakage includes a suite of [mocha](https://mochajs.org/) tests that validate the functionality of the framework.  Before submitting a pull request, please run at least the basic tests as described below.

All tests are in the tests directory.   The test/common directory includes mocha functionality that is shared by the different test scripts.

In general each test creates a Framework based app using a token specified in the environment and instantiates one or more [Webex JS SDK](https://webex.github.io/webex-js-sdk/) instances using the user API tokens specified in the environment.   Once properly setup the bot and the user(s) create and update spaces and memberships and interact with each other.

Most individual mocha tests correlate to an indivual API called by the test suite.  Depending on the expected behavior the test harness will wait for one or more framework events and/or hears() handlers to be called.   Most of this logic is implemented in the [common.js](../test/common/common.js) file shared by all tests.

## Environment variables used by the tests 

Each tests reads in an environment to discover how to configure itself.   The following is the complete set of variables that need to be set to run all the tests.  Note that only the first three are required to run the basic tests.

| Variable | Value | Purpose |
|---|---|---|
| BOT_API_TOKEN | Token of a bot created on [Webex For Developers](https://developer.webex.com/my-apps/new/bot) | Identity of bot to test framework with.  There is no need to have any actual bot code associated with this token, in fact its probably better if there isnt. |
| USER_API_TOKEN | Token of a user that the test bot will interact with.  This can be grabbed from [Webex For Developers](https://developer.webex.com/docs/getting-started) | This user will create rooms with the bot, (and vice versa) and exchange messages with it.  Rooms will be deleted at the end of the test. |
|HOSTED_FILE             | URL for a file to upload in some of the message tests.| Any file suppported by Webex Teams will do, perhaps the one here: https://www.webex.com/content/dam/wbx/us/images/hp/hp_56565/Teams_Iconx2.png  
|AUTHORIZED_USER_API_TOKEN | Token of a user that the framework will make calls on behalf of.  This can be grabbed from [Webex For Developers](https://developer.webex.com/docs/getting-started) or via an OAuth grant. | This variable is used exclusively by the framework as integration tests.   It must be a token that belongs to a different user than the one specified by the USER_API_TOKEN |
|ALLOWED_DOMAINS | A comma separated list (without spaces) of email domains | Only users with emails that belong in this list will be allowed to interact with the bot.  This value is set to the framework's `restrictedToEmailDomains` config option and is used by the membership-rules tests. |
|VALID_USER_API_TOKEN | Token of a user that the test bot is permitted to interact with.  This can be grabbed from [Webex For Developers](https://developer.webex.com/docs/getting-started) | This can be the same as USER_API_TOKEN if that user's email belongs in the set specified in ALLOWED_DOMAINS.  API calls will be made on behalf of this user during the membership-rules tests. |
|DISALLOWED_USER_API_TOKEN | Token of a user that the test bot is prohibited from interacting with.  This can be grabbed from [Webex For Developers](https://developer.webex.com/docs/getting-started) | This can be the token of any valid user that has an email with a domain not specified in ALLOWED_DOMAINS. API calls will be made on behalf of this user during the membership-rules tests. |
|ANOTHER_DISALLOWED_USERS_EMAIL | The email address of a valid webex user that the bot is not allowed to interact with. | This can be any valid user's email as long as does not belong to the set specified in ALLOWED_DOMAINS and is not the same as the email for the user who owns the DISALLOWED_USER_API_TOKEN. Tests in the membership-rules tests will attempt to add this user to rooms created and eventually destroyed during the test. |
|DEBUG             | framework| Optionally set DEBUG=framework for extended debug output during the test run.  

# Test Details
The following tests are available.  Before running the tests ensure that you have installed the dependencies needed to run them:

```bash
npm i --only=dev 
npm run test
```
(note: the dependencies only need to be installed once)


- ## bot-tests  
    - This is the bare minimum set of tests that should be run before submitting a PR.
	- These tests exercise the most common tasks in the framework including creating, deleting and modifying spaces and space memberships, responding to messages and validating all types of responses such as files, cards and replies.
		- This test set will exercise tests in a 1-1 space with the user specified via the USER_API_TOKEN and the test bot specified with the BOT_API_TOKEN if this space already exists, however it will not create this space since there is no way to "clean up" a 1-1 space.   To ensure that these tests run log into Webex Messaging as the test user and creating a 1-1 space with the test bot.  
	- Required environment variables  
		- BOT_API_TOKEN  
		- USER_API_TOKEN  
		- HOSTED_FILE  
	- Run command: `npm run test`  
    - Implementation: [bot-tests.js](../test/bot-tests.js)
    - VSCode Debug Config: `Mocha Tests`

- ## integration-tests  
	- These are the same tests as the bot-tests but all messages that are sent in group spaces do not include an @mention of the bot.  This validates that the framework based app working with an authorized user token is able to see these messages.  
	- The presence of an environment variable RUN_TEST_AS_USER causes the standard tests to be run with the AUTHORIZED_USER_API_TOKEN instead of the BOT_API_TOKEN.  This is set automatically if the associated `npm run` command is used.
	- Required environment variables:  
		- AUTHORIZED_USER_API_TOKEN  
		- USER_API_TOKEN  
		- HOSTED_FILE  
	- Run command: `npm run test-as-user` 
    - Implementation: [bot-tests.js](../test/bot-tests.js)

- ## late-discovery tests  
	- These tests validate the framework's ability to create bots "just in time" when all the existing spaces with the bot are not discovered at startup.   See the documentation on the `maxStartupSpaces` framework config option for more details.  
		- These tests **require** that the bot under test and the test user already exists in a 1-1 space together.  
	- Required environment variables:  
		- BOT_API_TOKEN  
		- USER_API_TOKEN  
	- Run Command: `npm run test-late-discovery`  
    - Implementation: [late-discovery-tests.js](../test/late-discovery-tests.js)
	
- ## mongo-storage tests  
	- These are the same tests as the bot-tests but the mongo storage adaptor is used instead of the memory storage adapter. 
	- The presence of an environment variable RUN_MONGO_TESTS causes the standard tests to be run with the mongo storage adapter.  This is set automatically if the associated `npm run` command is used.
	- Prior to running these, the tester needs to have a database set up in the mongo cloud service (aka: atlas)  
	- ### Setting up a mongo database for use with Framework  
		1) Create an (or us an existing) account on https://cloud.mongodb.com/  
		2) Create a new project (ie: WebexFrameworkTesting)  
			- The Mongo GUI may suggest adding your current IP address to the list of IPs allowed access.   If you are running your tests from a different machine than you are using to setup the database make sure to include that in the allowed IP address list.   (You can also disable IP security if you set 0.0.0.0 in the allowed IP list.)  
		3) Select **Build a Database**  
			- Choose to create the Free Shared Database  
			- Accept or update the default config options and select **Create Cluster**
			- Select **Username and Password authentication**  
				- Set a username and password -- this can be anything  
					- Make sure to save the password for future configuration  
				- Select **Create User**  
			- Click **Finish and Close**  
		4) On the Database Deployments screen, click **Connect**  
			- Select **Connect your Application**  
				- In the **Driver** dropdown select `Node.js`  
				- In the **Version** dropdown select `4.1 or later`  
				- Copy the connection string presented.   It should looks something like this: `mongodb+srv://frameworkTester:<password>@cluster0.08YSKkk.mongodb.net/?retryWrites=true&writeConcern=majority`  
	- ### Setting up the mongo environment variables  
		- Set MONGO_URI to the connection string.  If this was copied from the Mongo Cloud GUI using the steps above, replace `<password>` with the password you saved when you created the user for the database  
		- Set MONGO_BOT_STORE to the name of a collection to use as the storage adapter (ie: the place where data sent with `bot.store()` will be stored).   I typically set this to `frameworkTests-botStore` but it can be anything.   If this collection does not yet exist in your database it will be created automatically the first time the test runs.  
		- Set MONGO_BOT_METRICS to the name of the collection to use for the metrics written by the framework or by a framework based app via the `bot.writeMetric()` function.  I typically set this to `frameworkTests-botMetrics` but it can be anything.  
	- ### Running the test  
		- `npm run test-mongo`  
	- ### Viewing the Data  
		- After (or during) a test run it is possible to use the [Mongo Cloud Portal](https://cloud.mongodb.com/) to see changes in the database from the test run.   Navigate to the Project and Database created for the tests (you may already be here if you just set up your database using the steps above), and click Browse Collections  
			- You should see two collections with names that you set in the MONGO_BOT_STORE and MONGO_BOT_METRICS environment variables.  
			- In the botMetrics collection you should see three events that the framework test created.   These three metrics entries represent the three ways that metrics can be written:  
				- with a person object representing the "actor" that caused the event that is being recorded  
				- with the personId of the "actor" that cause the event that is being recorded  
				- with no actor information  
			- The botStore collection contains data that is written by the tests using the `bot.store()` function.   This data is cleaned up during the test.  

- ## guide-mode tests 
	- These tests exercise the "guided mode" functionality of the [membership rules feature](./membership-rules-readme.md).   They validate that the bot will work only in spaces that include at least one of the users specified in the `guideEmails` option in the framework config.  
	- Required environment variables  
		- BOT_API_TOKEN  
		- VALID_USER_API_TOKEN  
		- ALLOWED_DOMAINS  
		- DISALLOWED_USER_API_TOKEN  
		- ANOTHER_DISALLOWED_USERS_EMAIL  
		- HOSTED_FILE  
	- Run Command: `npm run test-guide-mode-rules`  
	- Implementation: [guide-rules-tests.js](../test/guide-rules-tests.js)
    - VSCode Debug Config: `Mocha Tests Guide Rules`

- ## membership-rules tests  
	- These tests exercise the email domain restriction functionality of the [membership rules feature](./membership-rules-readme.md).   They validate that the bot will not respond to messages sent to it in spaces that are not solely populated by members who's emails belong to the set of allowed email domains specified in the `restrictedToEmailDomains` option in the framework config.  
	- Required environment variables  
		- BOT_API_TOKEN  
		- VALID_USER_API_TOKEN  
		- ALLOWED_DOMAINS  
		- DISALLOWED_USER_API_TOKEN  
		- ANOTHER_DISALLOWED_USERS_EMAIL  
		- HOSTED_FILE  
	- Run Command: `npm run test-membership-rules`  
    - Implementation: [membership-rules-tests.js](../test/membership-rules-tests.js)
    - VSCode Debug Config: `Mocha Tests Membership Rules`

- ## invalid-config tests  
	- These tests validate that reasonable error messages are generated by the framework when invalid values are passed in with the framework config object.  
	- Required environment variables  
		- BOT_API_TOKEN  
	- Run Command: `npm run test-invalid-config`  
    - Implementation: [invalid-config-tests.js](../test/invalid-config-tests.js)

# Running all the tests with one command
`npm run test-all` will attempt to run all the tests one after the other.  In this case the `.env` file will need to populate all required environment variables, see the [sample .env](./sample.env) for an example.

The ideal contributor to this project will be able to report that they have run `npm run test-all` succesfully.

# How I create users and bots for the tests

In order to run all the tests, the tester needs access to API tokens for several users.  With the recent introduction of the [Webex Developer Sandbox](https://developer.webex.com/docs/developer-sandbox-guide) it is now easier to create multiple users for testing purposes.

While developers are encouraged to generate the tokens required for the tests using any method they are comfortable with, the following is the process I have recently adopted.  You will need to be able create users with multiple email addresses that you have access to.   For this purpose I use [GMail Plus Sign addresses](https://danq.me/2017/09/26/gmail-plus/).  If using this technique you will also need one or two non-gmail addresses to test the email domain membership rules.

## Create users for test

1) If necessary [Request a Developer Sandbox](https://developer.webex.com/docs/developer-sandbox-guide#)
2) With the supplied credentials login to the [Webex Control Hub](https://admin.webex.com/login) and create (as needed) the following users:
    - **Bot Creator**:  This user will login to developer.webex.com and create a bot. 
        - Example name: Sandbox BotCreator
        - Example email: myemail+botcreator@gmail.com  
    - **Sandbox Test User**:  This is the user whose token I will use to populate the USER_API_TOKEN and VALID_USER_API_TOKEN environment variables.  This is the primary user that the tests will make calls on behalf of.  
        - Example name: Sandbox BotUser
        - Example email: myemail+bottester@gmail.com
    - **Disallowed Test User**:  This is the user whose token I will use to populate the DISALLOWED_USER_API_TOKEN (used by the membership tests) and AUTHORIZED_USER_API_TOKEN (used by the integration token tests).
        - Example name: Disallowed User   
        - Example email: someoldemail@yahoo.com
    - **Another Disallowed Test User**: This is a second user whose email is not in the ALLOWED_DOMAIN set.  This user's token is not needed but they do need a valid webex account so they can be added to a space in the membership tests.  
        - Example name: Disallowed User2   
        - Example email: someoldemail@aol.com

3) After setting up the users, respond to the emails and complete logging in to the newly created accounts.   Make sure to save the user names, emails, and passwords in a safe location because you will need to login as these users in order to get their tokens before running the tests.
    - **TIP** - If possible use different browsers, especially for the Sandbox Test User and the Dissallowed User when creating accounts and then later when accessing their API tokens.   I've sometimes had trouble using incognito windows with the same browser.
    - **IMPORTANT**  I've found that in order for the tokens to work, the test users must login to webex and send at least one message.   Its actually not a bad idea to be logged into Webex Messages as the **Sandbox Test User** and/or the **Disallowed User** when the tests are run to see the messaging that is happening during the tests.

4) Login to [My Apps | Webex for Developers](https://developer.webex.com/my-apps/) using the credentials you created for the **Bot Creator**  and create a new bot to use for the tests:
    - Example Name: Framework Test Bot
    - Example Email: JPsFrameworkTestBot@webex.bot

    - Make sure to save the new Bot's API Token
    - Set BOT_API_TOKEN environment

5) Set the ALLOWED_DOMAINS environment variable to gmail.com (or a comma seperated list, without spaces, of whatever domains you used for the **Sandbox Test User**, and the **Bot Creator**)

6) Set the HOSTED_FILE environment variable to the URL for a hosted file, eg: https://www.webex.com/content/dam/wbx/us/images/hp/hp_56565/Teams_Iconx2.png

7) If running the mongo tests set the MONGO_* environment variables as described in [Setting up the mongo environment variables](#setting-up-the-mongo-environment-variables)  

8) Set ANOTHER_DISALLOWED_USERS_EMAIL to the email you used when you created **Another Disallowed Test User**

9) Login to [APIs - Getting Started | Webex for Developers](https://developer.webex.com/docs/getting-started) as **Sandbox Test User**.  Copy the API token and use it to set these environment variables:
    - USER_API_TOKEN
    - VALID_USER_API_TOKEN

10) Login to [APIs - Getting Started | Webex for Developers](https://developer.webex.com/docs/getting-started) as **Disallowed Test User**.  Copy the API token and use it to set these environment variables:
    - DISALLOWED_USER_API_TOKEN
    - AUTHORIZED_USER_API_TOKEN

After completing all of these steps you should have a .env file that will work for all the tests.  Here is an [sample.env](./sample.env) to start from.

Once this is setup running the tests becomes fairly easy, however note that because tokens copied from the Webex Developer Portal are only good for 12 hours, steps 9 and 10 will need to be repeated each time you start a new development/testing session.

# Understanding and modifying the tests

Most of the tests repeat a similar pattern of creating spaces and then running a series of tests where the user sends messages and the bot may or may not respond, and then running a set of tests where the bot sends messages to the space, exercising the various ways that a bot can do this (ie: `bot.say()`, `bot.reply()`, `bot.sendCard()`, etc).

Since many tests repeat the same patterns and are essentially attempting to validate expected behavior given certain framework configuration options, its helpful to understand the shared code that many of the tests leverage:

* [common.js](../test/common/common.js) provides a class that implements wrappers around most of the framework methods and webex API functions that are used by the tests.   Before calling any framework method or webex API, the wrapper functions will register handlers for any of the expected events that will be generated, and wait for each of those events to fire before succesfully returning.  In cases where unexpected events fire, the wrapper function will return a promise reject with information about the unexpected event that caused the test to fail.  In cases where the mocha tests are about to time out while waiting for the expected events, the functions will return a promise reject with details about which events were expected, which occured, and which ones were missing.   In order for all of this to work, the tests that use the common function must do the following:
	* call the `common.setMochaTimeout()` method before running any tests so that the wrapper functions can timeout before mocha would force a timeout.
	* instantiate a framework object with the appropriate configuration options, but instead of calling `framework.start()`, call `common.initFramework()`. This typically happens in the first mocha `before()` method within the very first `describe()` block of the test.
	* call `common.stopFramework()`, typically in the last mocha `after()` method in the outermost `describe()` block of the test.

* [before-after-user-created-room.js](../test/common/before-after-user-created-room.js) implements a class that provides common mocha `before()` and `after()` functions for having the test user create a new space, and adding a bot to that space.
* [before-after-bot-created-room.js](../test/common/before-after-bot-created-room.js) implements a class that provides common mocha `before()` and `after()` functions for having the the bot create a new space, and adding users to that space.
* [test-messages.js](../test/common/test-messages.js) - implements a class that includes an array of objects that describe messages that a user may send during the test.  For each test message, it's possible to define an array of `framework.hears()` methods that should be active during the tests, and to specify which ones are expected to fire. The testMessages class also includes a method that will allow the tests to loop through all of the test messages such that the user will send the message, the bot will (or will not) respond, and any `framework.hears()` handlers that were set are cleared before the next test runs.   Developers who wish to add new functionality that changes how the framework handles user messages would want to modify this class to include new test messages as appropriate.
* [bot-test-messages.js](../test/common/bot-test-messages.js) implements a class that includes an array of objects that define a set of tests that will exercise the various methods that a bot can use to send messages.  It also includes a method to loop through these tests and validate the expected behavior.  Developers who wish to add new functionality which enables a bot to send or modify messages in a space would want to modify this class to define new test cases.

Some of the simpler tests will then implement test logic within the top level mocha test script.  The ones that reuse similar logic will typically include one or more of the tests that reside in the common directory:

* [bot-message-and-hear-tests.js](../test/common/bot-message-and-hear-tests.js) creates a space on behalf of the test user, adds a bot to that room, and then loops through all of the user and bot messaging tests.  It then, has the bot create another space, add the user, and repeats the tests.
* [bot-membership-tests.js](../test/common/bot-membership-tests.js) creates a space on behalf of the user, adds the bot to that room and then exercises most of the bot methods that involve membership.  This file also exercises tests to validate the the storage adaptor is working properly.
* [bot-direct-message-tests.js](../test/common/bot-direct-message-tests.js) loops through all of the user and bot messaging tests in a direct message space between the test user and bot specified.  If no 1-1 space exists these tests are skipped.
* [guided-mode-rules-tests.js](../test/common/guided-mode-rules-tests.js) exercise a variety of framework configuration options that define how a bot should behave when it is a member of spaces that have or don't have the specified guide users.  For each configuration it runs all of the user message and bot message tests.
* [bot-membership-rules-tests.js](../test/common/bot-membership-rules-tests.js) modifies the membership of a test space so that it contains users that will/will not trigger the email based membership rules.  For each configuration it runs all of the user message and bot message tests.

Finally, its worth understanding a bit about an object `testInfo` that is passed to virtually every wrapper function exposed by the `common` class.   The `testInfo` object contains three sub-objects that are used throughout each test:
* `testInfo.config` is set up by the calling test function primarily to tell the class about the test user, bot instance, and space instance that will be active for a given test.   Typically, the key elements of the `testInfo.config` object, namely the `botUnderTest`, `userUnderTest`, and `roomUnderTest`, elements are set automatically by the common `before()` and `after()` handlers in the [before-after-user-created-room.js](../test/common/before-after-user-created-room.js) and [before-after-bot-created-room.js](../test/common/before-after-bot-created-room.js)
* `testInfo.in` is an object that is set up by the common wrapper functions as it evaluates how the request should behave based on the framework configuration and test state.  Test code outside of the common class implementation should not manipulate the `testInfo.in` class but it can be helpful to inspect it when tests fail to determine what went wrong.
* `testInfo.out` is an object that is setup and populated by the common wrapper functions as API calls return and events are processed.   Generally the tests will look to populate the `out` class so that it matches the `in` class.

## When to add tests

If you are contributing a PR to the project, it may also make sense to add or update the tests.

If you are fixing a bug, it's worth looking at the existing tests to see if coverage could be increased to cover the bug that you want to fix.  Ideally you would write your test case first, validate that it fails with the current (buggy) behavior, then make your fixes in the framework, re-run the test and validate that the bug is now fixed.

If you are adding new functionality, you would almost certainly want to add new tests cases to ensure that there is new coverage that covers your new functionality.  Try to write test cases that cover a variety of parameter combinations and ideally even exercise failure cases where invalid parameters are passed to your new configuration.

And of course, don't forget to commit your new or updated test files, along with any [newly generated documentation](./contributing.md#rebuild-the-docs) as part of your PR!

Digging into the tests can be daunting, but there is a community to help.   If you'd like assistance drop, a message in the ["Webex Node Bot Framework" space on Webex](https://eurl.io/#BJ7gmlSeU), or open an issue or contact the author on github.
