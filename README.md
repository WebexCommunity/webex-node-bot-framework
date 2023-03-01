# webex-node-bot-framework

### Node JS Bot Framework for Cisco Webex

This project is inspired by, and provides an alternate implementation of, the awesome [node-flint](https://github.com/flint-bot/flint/) framework by [Nick Marus](https://github.com/nmarus).  The framework makes it easy to quickly develop a Webex messaging bot, abstracting away some of the complexity of Webex For Developers interfaces, such as registering for events and calling REST APIs. A bot developer can use the framework to focus primarily on how the bot will interact with users in Webex, by writing "handlers" for various message or membership events in spaces where the bot has been added.

The primary change in this implementation is that it is based on the [webex-jssdk](https://webex.github.io/webex-js-sdk) which continues to be supported as new features and functionality are added to Webex.  

For developers who are familiar with flint, or who wish to port existing bots built on node-flint to the webex-node-bot-framework, this implementation is NOT backwards compatible.  Please see [Migrating from the original flint framework](./docs/migrate-from-node-flint.md)

Feel free to join the ["Webex Node Bot Framework" space on Webex](https://eurl.io/#BJ7gmlSeU) to ask questions and share tips on how to leverage this framework.   This project is community supported so contributions are welcome.   If you are interested in making the framework better please see the [Contribution Guidelines](./docs/contributing.md).

## News
* May, 2020 - Version 2 introduces a some new configuration options designed to help developers restrict access to their bot.   This can be helpful during the development phase (`guideEmails` parameter) or for production bots that should be restricted for use to users that have certain email domains (`restrictedToEmailDomains` parameter).   See [Membership-Rules README](./docs/membership-rules-readme.md)
  
* October 31, 2020 - Earlier this year, a series of blog posts were published to help developers get started building bots with the framework:
  
  * [From zero to webex chatbot in 15 minutes](https://developer.webex.com/blog/from-zero-to-webex-teams-chatbot-in-15-minutes)
  * [Introducing the Webex bot framework for node.js](https://developer.webex.com/blog/introducing-the-webex-teams-bot-framework-for-node-js)
  * [A deeper dive into the framework](https://developer.webex.com/blog/a-deeper-dive-into-the-webex-bot-framework-for-node-js)
  * [Five tips for well behaved bots](https://developer.webex.com/blog/five-tips-for-well-behaved-webex-bots)

  For first timers, I strongly recommend following these, running the sample app, stepping through it in the debugger, and getting a sense of how the framework works.   Once you have done the detailed documentation here will make a lot more sense!


## [Full Version History](./docs/version-history.md)


## Contents

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

  - [Installation](#installation)
  - [Overview](#overview)
  - [Authentication](#authentication)
  - [Storage](#storage)
  - [Bot Accounts](#bot-accounts)
  - [Troubleshooting](#troubleshooting)
- [Framework Reference](#framework-reference)
  - [Classes](#classes)
  - [Objects](#objects)
  - [Events](#events)
  - [Framework](#framework)
  - [Bot](#bot)
  - [Trigger : <code>object</code>](#trigger--codeobjectcode)
  - ["log"](#log)
  - ["stop"](#stop)
  - ["start"](#start)
  - ["initialized"](#initialized)
  - ["roomLocked"](#roomlocked)
  - ["roomUnocked"](#roomunocked)
  - ["roomRenamed"](#roomrenamed)
  - ["memberEnters"](#memberenters)
  - ["botAddedAsModerator"](#botaddedasmoderator)
  - ["botRemovedAsModerator"](#botremovedasmoderator)
  - ["memberAddedAsModerator"](#memberaddedasmoderator)
  - ["memberRemovedAsModerator"](#memberremovedasmoderator)
  - ["memberExits"](#memberexits)
  - ["mentioned"](#mentioned)
  - ["message"](#message)
  - ["files"](#files)
  - ["spawn"](#spawn)
  - ["despawn"](#despawn)
- [Storage Driver Reference](#storage-driver-reference)
  - [MongoStore](#mongostore)
- [License](#license)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->
## Installation

#### Via Git
```bash
mkdir myproj
cd myproj
git clone https://github.com/WebexCommunity/webex-node-bot-framework
npm install ./webex-node-bot-framework
```

#### Via NPM
```bash
mkdir myproj
cd myproj
npm install webex-node-bot-framework
```
#### Example Template Using Express
```js
var Framework = require('webex-node-bot-framework'); 
var webhook = require('webex-node-bot-framework/webhook');

var express = require('express');
var bodyParser = require('body-parser');
var app = express();
app.use(bodyParser.json());

// framework options
var config = {
  webhookUrl: 'http://myserver.com/framework',
  token: 'Tm90aGluZyB0byBzZWUgaGVyZS4uLiBNb3ZlIGFsb25nLi4u',
  port: 80
};

// init framework
var framework = new Framework(config);
framework.start();

// An initialized event means your webhooks are all registered and the 
// framework has created a bot object for all the spaces your bot is in
framework.on("initialized", () => {
  framework.debug("Framework initialized successfully! [Press CTRL-C to quit]");
});

// A spawn event is generated when the framework finds a space with your bot in it
// You can use the bot object to send messages to that space
// The id field is the id of the framework
// If addedBy is set, it means that a user has added your bot to a new space
// Otherwise, this bot was in the space before this server instance started
framework.on('spawn', (bot, id, addedBy) => {
  if (!addedBy) {
    // don't say anything here or your bot's spaces will get 
    // spammed every time your server is restarted
    framework.debug(`Framework created an object for an existing bot in a space called: ${bot.room.title}`);
  } else {
    // addedBy is the ID of the user who just added our bot to a new space, 
    // Say hello, and tell users what you do!
    bot.say('Hi there, you can say hello to me.  Don\'t forget you need to mention me in a group space!');
  }
});

// say hello
framework.hears('hello', (bot, trigger) => {
  bot.say('Hello %s!', trigger.person.displayName);
}, '**hello** - say hello and I\'ll say hello back');

// get help
framework.hears('help', (bot, trigger) => {
  bot.say('markdown', framework.showHelp());
}, '**help** - get a list of my commands', 0); // zero is default priorty

// Its a good practice to handle unexpected input
// Setting a priority > 0 means this will be called only if nothing else matches
framework.hears(/.*/gim, (bot, trigger) => {
    bot.say('Sorry, I don\'t know how to respond to "%s"', trigger.message.text);
    bot.say('markdown', framework.showHelp());
}, 99999);

// define express path for incoming webhooks
app.post('/framework', webhook(framework));

// start express server
var server = app.listen(config.port, () => {
  framework.debug('Framework listening on port %s', config.port);
});

// gracefully shutdown (ctrl-c)
process.on('SIGINT', () => {
  framework.debug('stoppping...');
  server.close();
  framework.stop().then(() => {
    process.exit();
  });
});
```

[**Websocket Example**](./docs/example3.md)

[**Buttons and Cards Example**](./docs/buttons-and-cards-example.md)

[**Restify Example**](./docs/example2.md)

## Overview

The framework provides developers with some basic scaffolding to quickly get a bot up and running.  Once a framework object is created with a configuration that includes a bot token, calling the framework.start() method kicks of the setup of this scaffolding.   The framework registers for all Webex Teams events, and may discover existing Webex Teams spaces that the bot is already a member of.  

A `bot` object is created for each space, and the framework generates a `spawn` event each time it finds a new one.  When all existing bot objects are created the framework generates an `initialized` event signalling that it is ready to begin "listening" for user input.


```js
// init framework
var framework = new Framework(config);
framework.start();

// An initialized event means your webhooks are all registered and the 
// framework has created bot objects for the spaces your bot was found in
framework.on("initialized", () => {
  framework.debug("Framework initialized successfully! [Press CTRL-C to quit]");
});

// A spawn event is generated when the framework finds a space with your bot in it
// You can use the bot object to send messages to that space
// The id field is the id of the framework
// If addedBy is set, it means that a user has added your bot to a new space
// Otherwise, this bot was in the space before this server instance started
framework.on('spawn', (bot, id, addedBy) => {
  if (!addedBy) {
    // don't say anything here or your bot's spaces will get 
    // spammed every time your server is restarted
    framework.debug(`Framework created an object for an existing bot in a space called: ${bot.room.title}`);
  } else {
    // addedBy is the ID of the user who just added our bot to a new space, 
    // Say hello, and tell users what you do!
    bot.say('Hi there, you can say hello to me.  Don\'t forget you need to mention me in a group space!');
  }
});
```

Most of the framework's functionality is based around the `framework.hears()` function. This
defines the phrase or pattern the bot is listening for and what actions to take
when that phrase or pattern is matched. The `framework.hears()` function gets a callback
that includes three objects: the bot object, and the trigger object, and the id of the framework.

The bot object is a specific instance of the `bot` class associated with the Webex Teams space that triggered the `framework.hears()` call.  
The `trigger` object provides details about the message that was sent, and the person who sent it, which caused the `framework.hears()` function to be triggered.

A simple example of a framework.hears() function setup:

```js
let priority = 0;
framework.hears(phrase, (bot, trigger, id) => {
  bot.<command>
    .then((returnedValue) => {
      // do something with returned value
    })
    .catch((err) => {
      // handle errors
    });
},'This is text that describes what happens when user sends phrase to bot', priority);
```

* `phrase` : This can be either a string or a regex pattern.
If a string, the string is matched against the first word in the room message.
message.
If a regex pattern is used, it is matched against the entire message text.
* `bot` : The bot object that is used to execute commands when the `phrase` is
triggered.
* `bot.<command>` : The Bot method to execute.
* `then` : Node JS Promise keyword that invokes additional logic once the
previous command is executed.
* `catch` : handle errors that happen at either the original command or in any
of the chained 'then' functions.
* `trigger` : The object that describes the details around what triggered the
`phrase`.
* `commands` : The commands that are ran when the `phrase` is heard.
* `help text` : Optional help text can be supplied after the function.  This enables the `framework.showHelp()` method to automatically generate help messages for the bot.
* `priority` : Optional priority can be supplied after the function (or help text) to specify which function should be called when multiple phrases match.  The hears() method(s) with the lowest priorities are called if priorities are set.

## Authentication
The token used to authenticate the Framework with the Webex API is passed as part of the
options used when instantiating the Framework class. To change or update the
token, use the Framework#setWebexToken() method.

**Example:**

```js
var newToken = 'Tm90aGluZyB0byBzZWUgaGVyZS4uLiBNb3ZlIGFsb25nLi4u';

framework.setWebexToken(newToken)
.then((token) => {
  console.log('token updated to: ' + token);
});
```

## Storage
The storage system used in the framework is a simple key/value store and resolves around these 3 methods:

* `bot.store(key, value)` - Store a value to a bot instance where 'key' is a
  string and 'value' is a boolean, number, string, array, or object. *This does
  not not support functions or any non serializable data.* Returns the a promise
  with the value.
* `bot.recall(key)` - Recall a value by 'key' from a bot instance. Returns a
  resolved promise with the value or a rejected promise if not found.
* `bot.forget([key])` - Forget (remove) value(s) from a bot instance where 'key'
  is an optional property that when defined, removes the specific key, and when
  undefined, removes all keys. Returns a resolved promise if deleted or not found.

When a bot is first spawned, the framework calls the `bot.initStorage` method which attepts to load any previously existing bot storage elements (if using a persistent storage driver such as [MongoStore](#MongoStore)), or will create an optional initial set of key/value pairs that were specified in the framework's configuration options `initBotStorageData` element.   If this is not set, new bots start off with no key/value pairs until `bot.store()` is called.

When a bot despawns (is removed from a space), the key/value store for that bot
instance will automatically be removed from the store. Framework currently has an
in-memory store and a mongo based store. By default, the in-memory store is
used. Other backend stores are possible by replicating any one of the built-in
storage modules and passing it to the `framework.storeageDriver()` method. 

The [MongoStore](#MongoStore) (and potentially other stores that use a persistent storage mechanism), also support the following methods:

* `initialize()` -- this must be called before `framework.storageDriver()` and `framework.start()` are called, and will validate that the configuration is correct
* `writeMetrics()` -- is a new, optional, method for persistent storage adaptors that can be called to write breadcrumbs into the database that can be used to build reports on the bot's usage

See [MongoStore](#MongoStore), for details on how to configure this storage adaptor.

The redis adaptor is likely broken and needs to be updated to support the new functions.   It would be great if a flint user of redis wanted to [contribute](./contributing.md)!

## Bot Accounts

**When using "Bot Accounts" the major differences are:**

* Webhooks for message:created only trigger when the Bot is mentioned by name
* Unable to read messages in rooms using the Webex API

**Differences with trigger.args using Framework with a "Bot Account":**

The trigger.args array is a shortcut in processing the trigger.text string. It
consists of an array of the words that are in the trigger.message string split
by one or more spaces. Punctation is included if there is no space between the
symbol and the word. With bot accounts, this behaves a bit differently.

* If defining a `framework.hears()` using a string (not regex), `trigger.args` is a
  filtered array of words from the message that begins *after* the first match of
  bot mention.

* If defining a framework.hears() using regex, the trigger.args array is the entire
  message.

## Troubleshooting

A common complaint from new framework developers is "My bot is not responding to  messages!".  If this is happening to you, here are a few things to check:

1. Make sure you have configured your app with the token that belongs to the bot you are sending messages to.
2. Make sure your framework based app is up and running.
3. If using webhooks, make sure that your Webhook URL is reachable from the public internet.  If you aren't sure how to test this, remove the `webhookUrl` key from your framework config object.   This will use websockets which are more likely to work in development configurations.
4. If interacting with a bot in a group space, make sure to at-mention your bot when you send it a message.  Only messages that specifically at-mention a bot by name are sent to the bot logic.

If you are having intermittent problems with your bot failing to respond to messages this may be a problem with the Webex services itself, a problem with the framework, or a problem with the way you have configured your `framework.hears(...)` methods.   One way to isolate the problem is to add a handler for the internal framework log events, as follows

```javascript
framework.on('log', (msg) => {
  console.log(msg);
});
```

This will cause your app to include framework logging which provides details about every message received, and every `framework.hears()` handler that is invoked in response to those messages.   If you don't see the message you are sending to your bot, contact Webex developer support.  If you do see the message, check the logs to validate that your `framework.hears()` handler is being called.   You may need to modify the phrase. See the [framework.hears documentation](#Framework+hears)

# Framework Reference


## Classes

<dl>
<dt><a href="#Framework">Framework</a></dt>
<dd></dd>
<dt><a href="#Bot">Bot</a></dt>
<dd></dd>
</dl>

## Objects

<dl>
<dt><a href="#Trigger">Trigger</a> : <code>object</code></dt>
<dd><p>Trigger Object</p>
</dd>
</dl>

## Events

<dl>
<dt><a href="#event_log">"log"</a></dt>
<dd><p>Framework log event.</p>
<p>Applications may implement a framework.on(&quot;log&quot;) handler to process
log messags from the framework, such as details about events that were
not sent due to mebership rules.  See <a href="./doc/membership-rules-readme.md">Membership-Rules README</a></p>
</dd>
<dt><a href="#event_stop">"stop"</a></dt>
<dd><p>Framework stop event.</p>
</dd>
<dt><a href="#event_start">"start"</a></dt>
<dd><p>Framework start event.</p>
</dd>
<dt><a href="#event_initialized">"initialized"</a></dt>
<dd><p>Framework initialized event.</p>
</dd>
<dt><a href="#event_roomLocked">"roomLocked"</a></dt>
<dd><p>Room Locked event.</p>
</dd>
<dt><a href="#event_roomUnocked">"roomUnocked"</a></dt>
<dd><p>Room Unocked event.</p>
</dd>
<dt><a href="#event_roomRenamed">"roomRenamed"</a></dt>
<dd><p>Room Renamed event.</p>
</dd>
<dt><a href="#event_memberEnters">"memberEnters"</a></dt>
<dd><p>Member Enter Room event.</p>
</dd>
<dt><a href="#event_botAddedAsModerator">"botAddedAsModerator"</a></dt>
<dd><p>Bot Added as Room Moderator.</p>
</dd>
<dt><a href="#event_botRemovedAsModerator">"botRemovedAsModerator"</a></dt>
<dd><p>Bot Removed as Room Moderator.</p>
</dd>
<dt><a href="#event_memberAddedAsModerator">"memberAddedAsModerator"</a></dt>
<dd><p>Member Added as Moderator.</p>
</dd>
<dt><a href="#event_memberRemovedAsModerator">"memberRemovedAsModerator"</a></dt>
<dd><p>Member Removed as Moderator.</p>
</dd>
<dt><a href="#event_memberExits">"memberExits"</a></dt>
<dd><p>Member Exits Room.</p>
</dd>
<dt><a href="#event_mentioned">"mentioned"</a></dt>
<dd><p>Bot Mentioned.</p>
</dd>
<dt><a href="#event_message">"message"</a></dt>
<dd><p>Message Recieved.</p>
</dd>
<dt><a href="#event_files">"files"</a></dt>
<dd><p>File Recieved.</p>
</dd>
<dt><a href="#event_spawn">"spawn"</a></dt>
<dd><p>Bot Spawned.</p>
</dd>
<dt><a href="#event_despawn">"despawn"</a></dt>
<dd><p>Bot Despawned.</p>
</dd>
</dl>

<a name="Framework"></a>

## Framework
**Kind**: global class  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | Framework UUID |
| active | <code>boolean</code> | Framework active state |
| initialized | <code>boolean</code> | Framework fully initialized |
| isBotAccount | <code>boolean</code> | Is Framework attached to Webex using a bot account? |
| isUserAccount | <code>boolean</code> | Is Framework attached to Webex using a user account? |
| person | <code>object</code> | Framework person object |
| email | <code>string</code> | Framework email |
| webex | <code>object</code> | The Webex JSSDK instance used by Framework |


* [Framework](#Framework)
    * [new Framework(options)](#new_Framework_new)
    * [.options](#Framework+options) : <code>object</code>
    * [.setWebexToken(token)](#Framework+setWebexToken) ⇒ <code>Promise.&lt;String&gt;</code>
    * [.getWebexSDK()](#Framework+getWebexSDK) ⇒ <code>object</code>
    * [.stop()](#Framework+stop) ⇒ <code>Promise.&lt;Boolean&gt;</code>
    * [.start()](#Framework+start) ⇒ <code>Promise.&lt;Boolean&gt;</code>
    * [.restart()](#Framework+restart) ⇒ <code>Promise.&lt;Boolean&gt;</code>
    * [.getBotByRoomId(roomId)](#Framework+getBotByRoomId) ⇒ <code>object</code>
    * [.hears(phrase, action, [helpText], [preference])](#Framework+hears) ⇒ <code>String</code>
    * [.clearHears(id)](#Framework+clearHears) ⇒ <code>null</code>
    * [.showHelp([header], [footer])](#Framework+showHelp) ⇒ <code>String</code>
    * [.setAuthorizer(Action)](#Framework+setAuthorizer) ⇒ <code>Boolean</code>
    * [.clearAuthorizer()](#Framework+clearAuthorizer) ⇒ <code>null</code>
    * [.storageDriver(Driver)](#Framework+storageDriver) ⇒ <code>Promise.&lt;Boolean&gt;</code>
    * [.use(path)](#Framework+use) ⇒ <code>Boolean</code>
    * [.checkMembershipRules()](#Framework+checkMembershipRules)
    * [.myEmit()](#Framework+myEmit)

<a name="new_Framework_new"></a>

### new Framework(options)
Creates an instance of the Framework.


| Param | Type | Description |
| --- | --- | --- |
| options | <code>Object</code> | Configuration object containing Framework settings. |

**Example**  
```js
var options = {
  webhookUrl: 'http://myserver.com/framework',
  token: 'Tm90aGluZyB0byBzZWUgaGVyZS4uLiBNb3ZlIGFsb25nLi4u'
};
var framework = new Framework(options);
```
<a name="Framework+options"></a>

### framework.options : <code>object</code>
Options Object

**Kind**: instance namespace of [<code>Framework</code>](#Framework)  
**Properties**

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| token | <code>string</code> |  | Webex Token. |
| [webhookUrl] | <code>string</code> |  | URL that is used for Webex API to send callbacks.  If not set events are received via websocket |
| [webhookSecret] | <code>string</code> |  | If specified, inbound webhooks are authorized before being processed. Ignored if webhookUrl is not set. |
| [httpsProxy] | <code>string</code> |  | If specified the https proxy to route request to webex through.  Ie: "https://proxy.mycompany.com:8090" |
| [maxStartupSpaces] | <code>number</code> |  | If specified, the maximum number of spaces with our bot that the framework will discover during startup.           If not specified the framework will attempt to discover all the spaces the framework's identity is in and "spawn" a bot object for all of         them before emitting an "initiatialized" event.  For popular bots that belog to hundreds or thousands of spaces, this can result         in long startup times. Setting this to a number (ie: 100) will limit the number of bots spawned before initialization.         Bots that are driven by external events and rely on logic that checks if an appropriate bot object exists before sending a notification          should not modify the default.  Bots that are driven primarily by webex user commands to the bot may         set this to 0 or any positive number to facilitate a faster startup.  After initialization new bot objects are created ("spawned")         when the bot is added to a new space or, if the framework receives events in existing spaces that it did not discover during initialization.         In the case of these "late discoveries", bots objects are spawned "just in time".  This behavior is similar to the way         the webex teams clients work.  See the [Spawn Event docs](#"spawn") to discover how to handle the different types of spawn events. |
| [messageFormat] | <code>string</code> | <code>&quot;text&quot;</code> | Default Webex message format to use with bot.say(). |
| [profileMsgProcessingTime] | <code>string</code> | <code>false</code> | Set to true to profile time spent in franmework and hears() callbacks per message. |
| [initBotStorageData] | <code>object</code> | <code>{}</code> | Initial data for new bots to put into storage. |
| [id] | <code>string</code> | <code>&quot;random&quot;</code> | The id this instance of Framework uses. |
| [webhookRequestJSONLocation] | <code>string</code> | <code>&quot;body&quot;</code> | The property under the Request to find the JSON contents. |
| [removeWebhooksOnStart] | <code>Boolean</code> | <code>true</code> | If you wish to have the bot remove all account webhooks when starting. Ignored if webhookUrl is not set. |
| [removeDeviceRegistrationsOnStart] | <code>Boolean</code> | <code>false</code> | If you use websockets and get "excessive device registrations" during iterative development, this will delete ALL device registrations.  Use with caution! Ignored if webhookUrl is set. |
| [restrictedToEmailDomains] | <code>string</code> |  | Set to a comma seperated list of email domains the bot may interact with, ie "myco.com,myco2.com".           For more details see the [Membership-Rules README](./doc/membership-rules-readme.md) |
| [guideEmails] | <code>string</code> |  | Set to a comma seperated list of Webex users emails who MUST be in a space in order for the bot to work, ie "user1@myco.com,user2@myco2.com".           For more details see the [Membership-Rules README](./doc/membership-rules-readme.md) |
| [membershipRulesDisallowedResponse] | <code>string</code> |  | Message from bot when it detects it is in a space that does not conform to the membership rules          specified by the `restrictedToEmailDomains` and/or the `guideEmails` parameters.   Default messages is         "Sorry, my use is not allowed for all the members in this space. Will ignore any new messages to me.".         No message will be sent if this is set to an empty string. |
| [membershipRulesStateMessageResponse] | <code>string</code> |  | Message from bot when it is messaged in a space that does not conform to the membership rules         specified by the `restrictedToEmailDomains` and/or the `guideEmails` parameters.   Default messages is         "Sorry, because my use is not allowed for all the members in this space I am ignoring any input.".         No message will be sent if this is set to an empty string. |
| [membershipRulesAllowedResponse] | <code>string</code> |  | Message from bot when it detects that an the memberships of a space it is in have changed in         in order to conform with the membership rules specified by the The default messages is "I am now allowed to interact with all the members in this space and will no longer ignore any input.".         No message will be sent if this is set to an empty string. |
| [fedramp] | <code>Boolean</code> |  | If specified, enables the framework to support the Webex FedRAMP environment. |

<a name="Framework+setWebexToken"></a>

### framework.setWebexToken(token) ⇒ <code>Promise.&lt;String&gt;</code>
Tests, and then sets a new Webex Token.

**Kind**: instance method of [<code>Framework</code>](#Framework)  

| Param | Type | Description |
| --- | --- | --- |
| token | <code>String</code> | New Webex Token for Framework to use. |

**Example**  
```js
framework.setWebexToken('Tm90aGluZyB0byBzZWUgaGVyZS4uLiBNb3ZlIGFsb25nLi4u')
  .then((token) => {
     console.log('token updated to: ' + token);
  });
```
<a name="Framework+getWebexSDK"></a>

### framework.getWebexSDK() ⇒ <code>object</code>
Accessor for Webex SDK instance

Access SDK functionality described in [SDK Reference](https://developer.webex.com/docs/sdks/browser#sdk-api-reference)

**Kind**: instance method of [<code>Framework</code>](#Framework)  
**Returns**: <code>object</code> - - Framework's Webex SDK instance  
**Example**  
```js
let webex = framework.getWebexSDK();
webex.people.get(me)
  .then(person => {
    console.log('SDK instantiated by: ' + person.displayName);
  }).catch(e => {
    console.error('SDK failed to lookup framework user: ' + e.message);
  });
```
<a name="Framework+stop"></a>

### framework.stop() ⇒ <code>Promise.&lt;Boolean&gt;</code>
Stop Framework.

**Kind**: instance method of [<code>Framework</code>](#Framework)  
**Example**  
```js
framework.stop();
```
<a name="Framework+start"></a>

### framework.start() ⇒ <code>Promise.&lt;Boolean&gt;</code>
Start Framework.

**Kind**: instance method of [<code>Framework</code>](#Framework)  
**Example**  
```js
framework.start();
```
<a name="Framework+restart"></a>

### framework.restart() ⇒ <code>Promise.&lt;Boolean&gt;</code>
Restart Framework.

**Kind**: instance method of [<code>Framework</code>](#Framework)  
**Example**  
```js
framework.restart();
```
<a name="Framework+getBotByRoomId"></a>

### framework.getBotByRoomId(roomId) ⇒ <code>object</code>
Get bot object associated with roomId.
Returns null if no object exists

**Kind**: instance method of [<code>Framework</code>](#Framework)  
**Returns**: <code>object</code> - - found bot object or null  

| Param | Type | Description |
| --- | --- | --- |
| roomId | <code>string</code> | id of room to search for |

**Example**  
```js
let bot = framework.getBotByRoomId(roomId);
if (bot) {
  bot.say('Hi, I\'m the bot in this room!');
} else {
  console.log('Could not find bot for room ID: ' + roomId);
}
```
<a name="Framework+hears"></a>

### framework.hears(phrase, action, [helpText], [preference]) ⇒ <code>String</code>
Add action to be performed when bot hears a phrase.

**Kind**: instance method of [<code>Framework</code>](#Framework)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| phrase | <code>Regex</code> \| <code>String</code> |  | The phrase as either a regex or string. If regex, matches on entire message.If string, matches on first word. |
| action | <code>function</code> |  | The function to execute when phrase is matched. Function is executed with 2 variables. Trigger and Bot. The Trigger Object contains information about the person who entered a message that matched the phrase. The Bot Object is an instance of the Bot Class as it relates to the room the message was heard. |
| [helpText] | <code>String</code> |  | The string of text that describes how this command operates. |
| [preference] | <code>Number</code> | <code>0</code> | Specifies preference of phrase action when overlapping phrases are matched. On multiple matches with same preference, all matched actions are excuted. On multiple matches with difference preference values, only the lower preferenced matched action(s) are executed. |

**Example**  
```js
// using a string to match first word and defines help text
framework.hears('/say', (bot, trigger) {
  bot.say(trigger.args.slice(1, trigger.args.length - 1));
}, '/say <greeting> - Responds with a greeting');
```
**Example**  
```js
// using regex to match across entire message
framework.hears(/(^| )beer( |.|$)/i, (bot, trigger) => {
  bot.say('Enjoy a beer, %s! 🍻', trigger.person.displayName);
});
```
**Example**  
```js
// create hears handlers that use the helpText and preference params
// This handler has a lower preference than the catchall
// and inlcudes a built-in message for the showHelp command
framework.hears('help', (bot, trigger) => {
  bot.say('markdown', framework.showHelp());
}, 'help - shows information about commands I understand', 0);

// This catchall handler does not include a help  message, but it
// does set a high preference value so it will not be called if any
// handlers with a lower preference score match
framework.hears(/.*&#8205;/gim, (bot, trigger) => {
  bot.say('I didn\'t quite understand that.');
  bot.say('markdown;, framework.showHelp());
 }, 99999);
```
<a name="Framework+clearHears"></a>

### framework.clearHears(id) ⇒ <code>null</code>
Remove a "framework.hears()" entry.

**Kind**: instance method of [<code>Framework</code>](#Framework)  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>String</code> | The "hears" ID. |

**Example**  
```js
// using a string to match first word and defines help text
var hearsHello = framework.hears('/framework', (bot, trigger, id) => {
  bot.say('Hello %s!', trigger.person.displayName);
});
framework.clearHears(hearsHello);
```
<a name="Framework+showHelp"></a>

### framework.showHelp([header], [footer]) ⇒ <code>String</code>
Display help for registered Framework Commands.

**Kind**: instance method of [<code>Framework</code>](#Framework)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [header] | <code>String</code> | <code>Usage:</code> | String to use in header before displaying help message. |
| [footer] | <code>String</code> | <code>Powered by Webex Node Bot Framework - https://github.com/WebexCommunity/webex-node-bot-framework</code> | String to use in footer before displaying help message. |

**Example**  
```js
framework.hears('/help', (bot, trigger, id) => {
  bot.say('markdown', framework.showHelp());
});
```
<a name="Framework+setAuthorizer"></a>

### framework.setAuthorizer(Action) ⇒ <code>Boolean</code>
Attaches authorizer function.

**Kind**: instance method of [<code>Framework</code>](#Framework)  

| Param | Type | Description |
| --- | --- | --- |
| Action | <code>function</code> | The function to execute when phrase is matched to authenticate a user.  The function is passed the bot, trigger, and id and expects a return value of true or false. |

**Example**  
```js
function myAuthorizer(bot, trigger, id) {
  if(trigger.personEmail === 'john@test.com') {
    return true;
  }
  else if(trigger.personDomain === 'test.com') {
    return true;
  }
  else {
    return false;
  }
}
framework.setAuthorizer(myAuthorizer);
```
<a name="Framework+clearAuthorizer"></a>

### framework.clearAuthorizer() ⇒ <code>null</code>
Removes authorizer function.

**Kind**: instance method of [<code>Framework</code>](#Framework)  
**Example**  
```js
framework.clearAuthorizer();
```
<a name="Framework+storageDriver"></a>

### framework.storageDriver(Driver) ⇒ <code>Promise.&lt;Boolean&gt;</code>
Defines storage backend.

**Kind**: instance method of [<code>Framework</code>](#Framework)  
**Returns**: <code>Promise.&lt;Boolean&gt;</code> - - True if driver loaded succesfully  

| Param | Type | Description |
| --- | --- | --- |
| Driver | <code>function</code> | The storage driver. |

**Example**  
```js
// define memory store (default if not specified)
framework.storageDriver(new MemStore());
```
<a name="Framework+use"></a>

### framework.use(path) ⇒ <code>Boolean</code>
Load a Plugin from a external file.

**Kind**: instance method of [<code>Framework</code>](#Framework)  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>String</code> | Load a plugin at given path. |

**Example**  
```js
framework.use('events.js');
```
**Example**  
```js
// events.js
module.exports = (framework) => {
  framework.on('spawn', (bot) => {
    console.log('new bot spawned in room: %s', bot.myroom.title);
  });
  framework.on('despawn', (bot) => {
    console.log('bot despawned in room: %s', bot.myroom.title);
  });
  framework.on('messageCreated', (message, bot) => {
    console.log('"%s" said "%s" in room "%s"', message.personEmail, message.text, bot.myroom.title);
  });
};
```
<a name="Framework+checkMembershipRules"></a>

### framework.checkMembershipRules()
Private function to check for memembership rules in config

**Kind**: instance method of [<code>Framework</code>](#Framework)  
<a name="Framework+myEmit"></a>

### framework.myEmit()
Private emit functions that check the membership rules
before emitting and event

**Kind**: instance method of [<code>Framework</code>](#Framework)  
<a name="Bot"></a>

## Bot
**Kind**: global class  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | Bot UUID |
| active | <code>boolean</code> | Bot active state |
| person | <code>object</code> | Bot's Webex  Person Object |
| email | <code>string</code> | Bot email |
| room | <code>object</code> | Bot's Webex Room object |
| membership | <code>object</code> | Bot's Webex Membership object |
| isLocked | <code>boolean</code> | If bot is locked |
| isModerator | <code>boolean</code> | If bot is a moderator |
| isGroup | <code>boolean</code> | If bot is in Group Room |
| isDirect | <code>boolean</code> | If bot is in 1:1/Direct Room |
| isTeam | <code>boolean</code> | If bot is in a Room associated to a Team |
| isDirectTo | <code>string</code> | Recipient Email if bot is in 1:1/Direct Room |
| lastActivity | <code>date</code> | Last bot activity |


* [Bot](#Bot)
    * [new Bot(framework, options, webex)](#new_Bot_new)
    * [.exit()](#Bot+exit) ⇒ <code>Promise.&lt;Boolean&gt;</code>
    * [.getWebexSDK()](#Bot+getWebexSDK) ⇒ <code>object</code>
    * [.add(email(s), [moderator])](#Bot+add) ⇒ <code>Promise.&lt;Array&gt;</code>
    * [.remove(email(s))](#Bot+remove) ⇒ <code>Promise.&lt;Array&gt;</code>
    * [.getModerators()](#Bot+getModerators) ⇒ <code>Promise.&lt;Array&gt;</code>
    * [.newRoom(name, emails, isTeam)](#Bot+newRoom) ⇒ [<code>Promise.&lt;Bot&gt;</code>](#Bot)
    * [.newTeamRoom(name, emails)](#Bot+newTeamRoom) ⇒ [<code>Promise.&lt;Bot&gt;</code>](#Bot)
    * [.moderateRoom()](#Bot+moderateRoom) ⇒ [<code>Promise.&lt;Bot&gt;</code>](#Bot)
    * [.unmoderateRoom()](#Bot+unmoderateRoom) ⇒ [<code>Promise.&lt;Bot&gt;</code>](#Bot)
    * [.moderatorSet(email(s))](#Bot+moderatorSet) ⇒ [<code>Promise.&lt;Bot&gt;</code>](#Bot)
    * [.moderatorClear(email(s))](#Bot+moderatorClear) ⇒ [<code>Promise.&lt;Bot&gt;</code>](#Bot)
    * [.implode()](#Bot+implode) ⇒ <code>Promise.&lt;Boolean&gt;</code>
    * [.say([format], message)](#Bot+say) ⇒ <code>Promise.&lt;Message&gt;</code>
    * [.sayWithLocalFile(message, filename)](#Bot+sayWithLocalFile) ⇒ <code>Promise.&lt;Message&gt;</code>
    * [.reply(replyTo, message, [format])](#Bot+reply) ⇒ <code>Promise.&lt;Message&gt;</code>
    * [.dm(person, [format], message)](#Bot+dm) ⇒ <code>Promise.&lt;Message&gt;</code>
    * [.sendCard(cardJson, fallbackText)](#Bot+sendCard) ⇒ <code>Promise.&lt;Message&gt;</code>
    * [.dmCard(person, cardJson, fallbackText)](#Bot+dmCard) ⇒ <code>Promise.&lt;Message&gt;</code>
    * [.uploadStream(filename, stream)](#Bot+uploadStream) ⇒ <code>Promise.&lt;Message&gt;</code>
    * [.censor(messageId)](#Bot+censor) ⇒ <code>Promise.&lt;Message&gt;</code>
    * [.roomRename(title)](#Bot+roomRename) ⇒ <code>Promise.&lt;Room&gt;</code>
    * [.store(key, value)](#Bot+store) ⇒ <code>Promise.&lt;String&gt;</code> \| <code>Promise.&lt;Number&gt;</code> \| <code>Promise.&lt;Boolean&gt;</code> \| <code>Promise.&lt;Array&gt;</code> \| <code>Promise.&lt;Object&gt;</code>
    * [.recall([key])](#Bot+recall) ⇒ <code>Promise.&lt;String&gt;</code> \| <code>Promise.&lt;Number&gt;</code> \| <code>Promise.&lt;Boolean&gt;</code> \| <code>Promise.&lt;Array&gt;</code> \| <code>Promise.&lt;Object&gt;</code>
    * [.forget([key])](#Bot+forget) ⇒ <code>Promise.&lt;String&gt;</code> \| <code>Promise.&lt;Number&gt;</code> \| <code>Promise.&lt;Boolean&gt;</code> \| <code>Promise.&lt;Array&gt;</code> \| <code>Promise.&lt;Object&gt;</code>

<a name="new_Bot_new"></a>

### new Bot(framework, options, webex)
Creates a Bot instance that is then attached to a Webex Team Room.


| Param | Type | Description |
| --- | --- | --- |
| framework | <code>Object</code> | The framework object this Bot spawns under. |
| options | <code>Object</code> | The options of the framework object this Bot spawns under. |
| webex | <code>Object</code> | The webex sdk of the framework object this Bot spawns under. |

<a name="Bot+exit"></a>

### bot.exit() ⇒ <code>Promise.&lt;Boolean&gt;</code>
Instructs Bot to exit from room.

**Kind**: instance method of [<code>Bot</code>](#Bot)  
**Example**  
```js
bot.exit();
```
<a name="Bot+getWebexSDK"></a>

### bot.getWebexSDK() ⇒ <code>object</code>
Accessor for Webex SDK instance

This is a convenience and returns the same shared Webex SDK instance 
that is returned by a call to framework.getWebexSDK()

Access SDK functionality described in [SDK Reference](https://developer.webex.com/docs/sdks/browser#sdk-api-reference)

**Kind**: instance method of [<code>Bot</code>](#Bot)  
**Returns**: <code>object</code> - - Bot's Webex SDK instance  
**Example**  
```js
let webex = bot.getWebexSDK();
webex.people.get(me)
  .then(person => {
    console.log('SDK instantiated by: ' + person.displayName);
  }).catch(e => {
    console.error('SDK failed to lookup framework user: ' + e.message);
  });
```
<a name="Bot+add"></a>

### bot.add(email(s), [moderator]) ⇒ <code>Promise.&lt;Array&gt;</code>
Instructs Bot to add person(s) to room.

**Kind**: instance method of [<code>Bot</code>](#Bot)  
**Returns**: <code>Promise.&lt;Array&gt;</code> - Array of emails added  

| Param | Type | Description |
| --- | --- | --- |
| email(s) | <code>String</code> \| <code>Array</code> | Email Address (or Array of Email Addresses) of Person(s) to add to room. |
| [moderator] | <code>Boolean</code> | Add as moderator. |

**Example**  
```js
// add one person to room by email
bot.add('john@test.com');
```
**Example**  
```js
// add one person as moderator to room by email
bot.add('john@test.com', true)
  .catch((err) => {
    // log error if unsuccessful
    console.log(err.message);
  });
```
**Example**  
```js
// add 3 people to room by email
bot.add(['john@test.com', 'jane@test.com', 'bill@test.com']);
```
<a name="Bot+remove"></a>

### bot.remove(email(s)) ⇒ <code>Promise.&lt;Array&gt;</code>
Instructs Bot to remove person from room.

**Kind**: instance method of [<code>Bot</code>](#Bot)  
**Returns**: <code>Promise.&lt;Array&gt;</code> - Array of emails removed  

| Param | Type | Description |
| --- | --- | --- |
| email(s) | <code>String</code> \| <code>Array</code> | Email Address (or Array of Email Addresses) of Person(s) to remove from room. |

**Example**  
```js
// remove one person to room by email
bot.remove('john@test.com');
```
**Example**  
```js
// remove 3 people from room by email
bot.remove(['john@test.com', 'jane@test.com', 'bill@test.com']);
```
<a name="Bot+getModerators"></a>

### bot.getModerators() ⇒ <code>Promise.&lt;Array&gt;</code>
Get room moderators.

**Kind**: instance method of [<code>Bot</code>](#Bot)  
**Example**  
```js
bot.getModerators()
  .then((moderators) => {
    console.log(moderators);
  });
```
<a name="Bot+newRoom"></a>

### bot.newRoom(name, emails, isTeam) ⇒ [<code>Promise.&lt;Bot&gt;</code>](#Bot)
Create new room with people by email

**Kind**: instance method of [<code>Bot</code>](#Bot)  

| Param | Type | Description |
| --- | --- | --- |
| name | <code>String</code> | Name of room. |
| emails | <code>Array</code> | Emails of people to add to room. |
| isTeam | <code>Boolean</code> | - Create a team room (if bot is already in a team space) |

<a name="Bot+newTeamRoom"></a>

### bot.newTeamRoom(name, emails) ⇒ [<code>Promise.&lt;Bot&gt;</code>](#Bot)
Create new Team Room

This can also be done by passing an optional boolean 
isTeam param to the newRoom() function, but this function
is also kept for compatibility with node-flint

**Kind**: instance method of [<code>Bot</code>](#Bot)  

| Param | Type | Description |
| --- | --- | --- |
| name | <code>String</code> | Name of room. |
| emails | <code>Array</code> | Emails of people to add to room. |

<a name="Bot+moderateRoom"></a>

### bot.moderateRoom() ⇒ [<code>Promise.&lt;Bot&gt;</code>](#Bot)
Enable Room Moderation.

This function will not work when framework was created
using a bot token, it requires an authorized user token

**Kind**: instance method of [<code>Bot</code>](#Bot)  
**Example**  
```js
bot.moderateRoom()
  .then((err) => {
    console.log(err.message)
  });
```
<a name="Bot+unmoderateRoom"></a>

### bot.unmoderateRoom() ⇒ [<code>Promise.&lt;Bot&gt;</code>](#Bot)
Disable Room Moderation.

This function will not work when framework was created
using a bot token, it requires an authorized user token

**Kind**: instance method of [<code>Bot</code>](#Bot)  
**Example**  
```js
bot.unmoderateRoom()
  .then((err) => {
    console.log(err.message)
  });
```
<a name="Bot+moderatorSet"></a>

### bot.moderatorSet(email(s)) ⇒ [<code>Promise.&lt;Bot&gt;</code>](#Bot)
Assign Moderator in Room

This function will not work when framework was created
using a bot token, it requires an authorized user token

**Kind**: instance method of [<code>Bot</code>](#Bot)  

| Param | Type | Description |
| --- | --- | --- |
| email(s) | <code>String</code> \| <code>Array</code> | Email Address (or Array of Email Addresses) of Person(s) to assign as moderator. |

**Example**  
```js
bot.moderatorSet('john@test.com')
  .then((err) => {
    console.log(err.message)
  });
```
<a name="Bot+moderatorClear"></a>

### bot.moderatorClear(email(s)) ⇒ [<code>Promise.&lt;Bot&gt;</code>](#Bot)
Unassign Moderator in Room

This function will not work when framework was created
using a bot token, it requires an authorized user token

**Kind**: instance method of [<code>Bot</code>](#Bot)  

| Param | Type | Description |
| --- | --- | --- |
| email(s) | <code>String</code> \| <code>Array</code> | Email Address (or Array of Email Addresses) of Person(s) to unassign as moderator. |

**Example**  
```js
bot.moderatorClear('john@test.com')
  .then((err) => {
    console.log(err.message)
  });
```
<a name="Bot+implode"></a>

### bot.implode() ⇒ <code>Promise.&lt;Boolean&gt;</code>
Remove a room and all memberships.

**Kind**: instance method of [<code>Bot</code>](#Bot)  
**Example**  
```js
framework.hears('/implode', (bot, trigger) => {
  bot.implode();
});
```
<a name="Bot+say"></a>

### bot.say([format], message) ⇒ <code>Promise.&lt;Message&gt;</code>
Send text with optional file to room.

**Kind**: instance method of [<code>Bot</code>](#Bot)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [format] | <code>String</code> | <code>text</code> | Set message format. Valid options are 'text' or 'markdown'. |
| message | <code>String</code> \| <code>Object</code> |  | Message to send to room. This can be a simple string, or a object for advanced use. |

**Example**  
```js
// Simple example
framework.hears('/hello', (bot, trigger) => {
  bot.say('hello');
});
```
**Example**  
```js
// Simple example to send message and file
framework.hears('/file', (bot, trigger) => {
  bot.say({text: 'Here is your file!', file: 'http://myurl/file.doc'});
}, '**file** - ask bot to post a file to the space');
```
**Example**  
```js
// Markdown Method 1 - Define markdown as default
framework.messageFormat = 'markdown';
framework.hears('/hello', (bot, trigger) => {
  bot.say('**hello**, How are you today?');
}, '**hello** - say hello to the bot');
```
**Example**  
```js
// Markdown Method 2 - Define message format as part of argument string
framework.hears('/hello', (bot, trigger) => {
  bot.say('markdown', '**hello**, How are you today?');
}, '**hello** - say hello to the bot');
```
**Example**  
```js
// Mardown Method 3 - Use an object (use this method of bot.say() when needing to send a file in the same message as markdown text.
framework.hears('/hello', (bot, trigger) => {
  bot.say({markdown: '*Hello <@personEmail:' + trigger.personEmail + '|' + trigger.personDisplayName + '>*'});
}, '**hello** - say hello to the bot');
```
**Example**  
```js
// Send an Webex card by providing a fully formed message object.
framework.hears('/card please', (bot, trigger) => {
  bot.say({       
     // Fallback text for clients that don't render cards is required
     markdown: "If you see this message your client cannot render buttons and cards.",
     attachments: [{
       "contentType": "application/vnd.microsoft.card.adaptive",
       "content": myCardsJson
    }]
   });
  }, '**card please** - ask bot to post a card to the space');
```
<a name="Bot+sayWithLocalFile"></a>

### bot.sayWithLocalFile(message, filename) ⇒ <code>Promise.&lt;Message&gt;</code>
Send optional text message with a local file to room.

**Kind**: instance method of [<code>Bot</code>](#Bot)  

| Param | Type | Description |
| --- | --- | --- |
| message | <code>String</code> \| <code>Object</code> | Message to send to room. If null or empty string is ignored.  If set the default messageFormat is used |
| filename | <code>String</code> | name of local file to send to space |

**Example**  
```js
// Simple example
framework.hears('/file', (bot, trigger) => {
  bot.sayWithLocalFile('here is a file', './image.jpg);
}, '**file** - ask bot to send a file to the space');
```
<a name="Bot+reply"></a>

### bot.reply(replyTo, message, [format]) ⇒ <code>Promise.&lt;Message&gt;</code>
Send a threaded message reply

**Kind**: instance method of [<code>Bot</code>](#Bot)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| replyTo | <code>String</code> \| <code>Object</code> |  | MessageId or message object or attachmentAction object to send to reply to. |
| message | <code>String</code> \| <code>Object</code> |  | Message to send to room. This can be a simple string, or a message object for advanced use. |
| [format] | <code>String</code> | <code>text</code> | Set message format. Valid options are 'text' or 'markdown'. Ignored if message is an object |

**Example**  
```js
// Simple example
framework.hears('/hello', (bot, trigger) => {
  bot.reply(trigger.message, 'hello back at you');
}, '**hello** - say hello to the bot);
```
**Example**  
```js
// Markdown Method 1 - Define markdown as default
framework.messageFormat = 'markdown';
framework.hears('/hello', (bot, trigger) => {
  bot.reply(trigger.message, '**hello**, How are you today?');
}, '**hello** - say hello to the bot);
```
**Example**  
```js
// Markdown Method 2 - Define message format as part of argument string
framework.hears('/hello', (bot, trigger) => {
  bot.reply(trigger.message, '**hello**, How are you today?', 'markdown');
}, '**hello** - say hello to the bot);
```
**Example**  
```js
// Mardown Method 3 - Use an object (use this method of bot.reply() when needing to send a file in the same message as markdown text.
framework.hears('/hello', (bot, trigger) => {
  bot.reply(trigger.message, {markdown: '*Hello <@personEmail:' + trigger.personEmail + '|' + trigger.personDisplayName + '>*'});
}, '**hello** - say hello to the bot);
```
**Example**  
```js
// Reply to a card when a user hits an action.submit button
framework.on('attachmentAction', (bot, trigger) => {
  bot.reply(trigger.attachmentAction, 'Thanks for hitting the button');
});
```
<a name="Bot+dm"></a>

### bot.dm(person, [format], message) ⇒ <code>Promise.&lt;Message&gt;</code>
Send text with optional file in a direct message. 
This sends a message to a 1:1 room with the user (creates 1:1, if one does not already exist)

**Kind**: instance method of [<code>Bot</code>](#Bot)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| person | <code>String</code> |  | Email or personId of person to send Direct Message. |
| [format] | <code>String</code> | <code>text</code> | Set message format. Valid options are 'text' or 'markdown'. |
| message | <code>String</code> \| <code>Object</code> |  | Message to send to room. This can be a simple string, or a object for advanced use. |

**Example**  
```js
// Simple example
framework.hears('dm me', (bot, trigger) => {
  bot.dm(trigger.person.id, 'hello');
}, '**dm me** - ask the bot to send a message to you in a 1-1 space');
```
**Example**  
```js
// Simple example to send message and file
framework.hears('dm me a file', (bot, trigger) => {
  bot.dm(trigger.person.id, {text: 'Here is your file!', file: 'http://myurl/file.doc'});
}, '**dm me a file ** - ask the bot to send a file to you in a 1-1 space');
```
**Example**  
```js
// Markdown Method 1 - Define markdown as default
framework.messageFormat = 'markdown';
framework.hears('dm me some rich text', (bot, trigger) => {
  bot.dm(trigger.person.id, '**hello**, How are you today?');
}, '**dm me some rich text** - ask the bot to send a rich text message to you in a 1-1 space');
```
**Example**  
```js
// Markdown Method 2 - Define message format as part of argument string
framework.hears('dm someone', (bot, trigger) => {
  bot.dm('john@doe.com', 'markdown', '**hello**, How are you today?');
}, '**dm someone** - ask the bot to send a message to john@doe.com in a 1-1 space');
```
**Example**  
```js
// Mardown Method 3 - Use an object (use this method of bot.dm() when needing to send a file in the same message as markdown text.
framework.hears('dm someone', (bot, trigger) => {
  bot.dm('someone@domain.com', {markdown: '*Hello <@personId:' + trigger.person.id + '|' + trigger.person.displayName + '>*'});
}, '**dm someone** - ask the bot to send a message and file to someone@domain.com in a 1-1 space');
```
<a name="Bot+sendCard"></a>

### bot.sendCard(cardJson, fallbackText) ⇒ <code>Promise.&lt;Message&gt;</code>
Send a Webex Teams Card to room.

**Kind**: instance method of [<code>Bot</code>](#Bot)  
**See**

- [Buttons and Cards Guide](https://developer.webex.com/docs/api/guides/cards#working-with-cards) for further information.
- [Buttons and Cards Framework Example](./docs/buttons-and-cards-example.md)


| Param | Type | Description |
| --- | --- | --- |
| cardJson | <code>Object</code> | The card JSON to render.  This can come from the Webex Buttons and Cards Designer. |
| fallbackText | <code>String</code> | Message to be displayed on client's that can't render cards. |

**Example**  
```js
// Simple example
framework.hears('card please', (bot, trigger) => {
  bot.SendCard(
   {
      "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
      "type": "AdaptiveCard",
      "version": "1.0",
      "body": [
          {
              "type": "ColumnSet",
              "columns": [
                  {
                      "type": "Column",
                      "width": 2,
                      "items": [
                          {
                              "type": "TextBlock",
                              "text": "Card Sample",
                              "weight": "Bolder",
                              "size": "Medium"
                          },
                          {
                              "type": "TextBlock",
                              "text": "What is your name?",
                              "wrap": true
                          },
                          {
                              "type": "Input.Text",
                              "id": "myName",
                              "placeholder": "John Doe"
                          }
                      ]
                  }
              ]
          }
      ],
      "actions": [
          {
              "type": "Action.Submit",
              "title": "Submit"
          }
      ]
   },
   "This is the fallback text if the client can't render this card");
 }, '**card please** - ask the bot to post a card to the space');
```
<a name="Bot+dmCard"></a>

### bot.dmCard(person, cardJson, fallbackText) ⇒ <code>Promise.&lt;Message&gt;</code>
Send a Card to a 1-1 space.

**Kind**: instance method of [<code>Bot</code>](#Bot)  

| Param | Type | Description |
| --- | --- | --- |
| person | <code>String</code> | Email or ID of the user to 1-1 message. |
| cardJson | <code>Object</code> | The card JSON to render.  This can come from the Webex Buttons and Cards Designer. |
| fallbackText | <code>String</code> | Message to be displayed on client's that can't render cards. |

**Example**  
```js
// Simple example
framework.hears('card for joe please', (bot, trigger) => {
  bot.dmCard(
   'joe@email.com',
   {
      "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
      "type": "AdaptiveCard",
      "version": "1.0",
      "body": [
          {
            "type": "TextBlock",
            "text": "Joe, here is your card!",
            "weight": "Bolder",
            "size": "Medium"
          }
      ]
   },
   "This is the fallback text if the client can't render this card");
 }, '**card for john please** - ask the bot to send a card to joe@email.com in a 1-1 space');
```
<a name="Bot+uploadStream"></a>

### bot.uploadStream(filename, stream) ⇒ <code>Promise.&lt;Message&gt;</code>
Upload a file to a room using a Readable Stream

**Kind**: instance method of [<code>Bot</code>](#Bot)  

| Param | Type | Description |
| --- | --- | --- |
| filename | <code>String</code> | File name used when uploading to room |
| stream | <code>Stream.Readable</code> | Stream Readable |

**Example**  
```js
framework.hears('/file', (bot, trigger) => {

  // define filename used when uploading to room
  var filename = 'test.png';

  // create readable stream
  var stream = fs.createReadStream('/my/file/test.png');

  bot.uploadStream(stream);
}, '**\/file** - ask the bot to post a file to the space via the stream method');
```
<a name="Bot+censor"></a>

### bot.censor(messageId) ⇒ <code>Promise.&lt;Message&gt;</code>
Remove Message By Id.

**Kind**: instance method of [<code>Bot</code>](#Bot)  

| Param | Type |
| --- | --- |
| messageId | <code>String</code> | 

<a name="Bot+roomRename"></a>

### bot.roomRename(title) ⇒ <code>Promise.&lt;Room&gt;</code>
Set Title of Room.

**Kind**: instance method of [<code>Bot</code>](#Bot)  

| Param | Type |
| --- | --- |
| title | <code>String</code> | 

**Example**  
```js
bot.roomRename('My Renamed Room')
  .then((err) => {
    console.log(err.message)
  });
```
<a name="Bot+store"></a>

### bot.store(key, value) ⇒ <code>Promise.&lt;String&gt;</code> \| <code>Promise.&lt;Number&gt;</code> \| <code>Promise.&lt;Boolean&gt;</code> \| <code>Promise.&lt;Array&gt;</code> \| <code>Promise.&lt;Object&gt;</code>
Store key/value data.

**Kind**: instance method of [<code>Bot</code>](#Bot)  

| Param | Type | Description |
| --- | --- | --- |
| key | <code>String</code> | Key under id object |
| value | <code>String</code> \| <code>Number</code> \| <code>Boolean</code> \| <code>Array</code> \| <code>Object</code> | Value of key |

<a name="Bot+recall"></a>

### bot.recall([key]) ⇒ <code>Promise.&lt;String&gt;</code> \| <code>Promise.&lt;Number&gt;</code> \| <code>Promise.&lt;Boolean&gt;</code> \| <code>Promise.&lt;Array&gt;</code> \| <code>Promise.&lt;Object&gt;</code>
Recall value of data stored by 'key'.

**Kind**: instance method of [<code>Bot</code>](#Bot)  

| Param | Type | Description |
| --- | --- | --- |
| [key] | <code>String</code> | Key under id object (optional). If key is not passed, all keys for id are returned as an object. |

<a name="Bot+forget"></a>

### bot.forget([key]) ⇒ <code>Promise.&lt;String&gt;</code> \| <code>Promise.&lt;Number&gt;</code> \| <code>Promise.&lt;Boolean&gt;</code> \| <code>Promise.&lt;Array&gt;</code> \| <code>Promise.&lt;Object&gt;</code>
Forget a key or entire store.

**Kind**: instance method of [<code>Bot</code>](#Bot)  

| Param | Type | Description |
| --- | --- | --- |
| [key] | <code>String</code> | Key under id object (optional). If key is not passed, id and all children are removed. |

<a name="Trigger"></a>

## Trigger : <code>object</code>
Trigger Object

**Kind**: global namespace  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| type | <code>string</code> | type of trigger - message or attachmentAction |
| id | <code>string</code> | Message or attachentAction ID |
| message | <code>object</code> | message that caused this trigger (if type is 'message') |
| phrase | <code>string</code> \| <code>regex</code> | Matched lexicon phrase if any |
| args | <code>array</code> | Filtered array of words in message text. |
| attachmentAction | <code>object</code> | attachmentAction that caused this trigger (if type is 'attachmentAction') |
| person | <code>object</code> | Person object associated with user that sent the message or action |
| personId | <code>string</code> | ID of person |

<a name="event_log"></a>

## "log"
Framework log event.

Applications may implement a framework.on("log") handler to process
log messags from the framework, such as details about events that were
not sent due to mebership rules.  See [Membership-Rules README](./doc/membership-rules-readme.md)

**Kind**: event emitted  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| message | <code>string</code> | Log Message |

<a name="event_stop"></a>

## "stop"
Framework stop event.

**Kind**: event emitted  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | Framework UUID |

<a name="event_start"></a>

## "start"
Framework start event.

**Kind**: event emitted  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | Framework UUID |

<a name="event_initialized"></a>

## "initialized"
Framework initialized event.

**Kind**: event emitted  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | Framework UUID |

<a name="event_roomLocked"></a>

## "roomLocked"
Room Locked event.

**Kind**: event emitted  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| bot | <code>object</code> | Bot Object |
| room | <code>object</code> | Room Object |
| id | <code>string</code> | Framework UUID |

<a name="event_roomUnocked"></a>

## "roomUnocked"
Room Unocked event.

**Kind**: event emitted  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| bot | <code>object</code> | Bot Object |
| room | <code>object</code> | Room Object |
| id | <code>string</code> | Framework UUID |

<a name="event_roomRenamed"></a>

## "roomRenamed"
Room Renamed event.

**Kind**: event emitted  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| bot | <code>object</code> | Bot Object |
| room | <code>object</code> | Room Object |
| id | <code>string</code> | Framework UUID |

<a name="event_memberEnters"></a>

## "memberEnters"
Member Enter Room event.

**Kind**: event emitted  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| bot | <code>object</code> | Bot Object |
| membership | <code>object</code> | Membership Object |
| id | <code>string</code> | Framework UUID |

<a name="event_botAddedAsModerator"></a>

## "botAddedAsModerator"
Bot Added as Room Moderator.

**Kind**: event emitted  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| bot | <code>object</code> | Bot Object |
| id | <code>string</code> | Framework UUID |

<a name="event_botRemovedAsModerator"></a>

## "botRemovedAsModerator"
Bot Removed as Room Moderator.

**Kind**: event emitted  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| bot | <code>object</code> | Bot Object |
| id | <code>string</code> | Framework UUID |

<a name="event_memberAddedAsModerator"></a>

## "memberAddedAsModerator"
Member Added as Moderator.

**Kind**: event emitted  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| bot | <code>object</code> | Bot Object |
| membership | <code>object</code> | Membership Object |
| id | <code>string</code> | Framework UUID |

<a name="event_memberRemovedAsModerator"></a>

## "memberRemovedAsModerator"
Member Removed as Moderator.

**Kind**: event emitted  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| bot | <code>object</code> | Bot Object |
| membership | <code>object</code> | Membership Object |
| id | <code>string</code> | Framework UUID |

<a name="event_memberExits"></a>

## "memberExits"
Member Exits Room.

**Kind**: event emitted  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| bot | <code>object</code> | Bot Object |
| membership | <code>object</code> | Membership Object |
| id | <code>string</code> | Framework UUID |

<a name="event_mentioned"></a>

## "mentioned"
Bot Mentioned.

**Kind**: event emitted  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| bot | <code>object</code> | Bot Object |
| trigger | <code>object</code> | Trigger Object |
| id | <code>string</code> | Framework UUID |

<a name="event_message"></a>

## "message"
Message Recieved.

**Kind**: event emitted  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| bot | <code>object</code> | Bot Object |
| trigger | <code>object</code> | Trigger Object |
| id | <code>string</code> | Framework UUID |

<a name="event_files"></a>

## "files"
File Recieved.

**Kind**: event emitted  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| bot | <code>object</code> | Bot Object |
| trigger | <code>trigger</code> | Trigger Object |
| id | <code>string</code> | Framework UUID |

<a name="event_spawn"></a>

## "spawn"
Bot Spawned.

**Kind**: event emitted  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| bot | <code>object</code> | Bot Object |
| id | <code>string</code> | Framework UUID |
| addedBy | <code>string</code> | ID of user who added bot to space if available. Bots are typically spawned in one of three ways: 1) When the framework first starts it can look for up to     options.maxStartupSpaces spaces that     our bot is already part of.  When discovered a new bot is spawned.    No addedBy parameter will be passed in this case and the     `framework.initialized` variable will be false. 2) After the framework has started if a user sends    a message to a bot in an existing space that was not discovered during startup,    a bot object is spawned for the "just in time" discovered space.  Developers    should never assume that all possible spaces were discovered during     the framework's startup.    No addedBy parameter will be passed in this case and the     framework.initialized variable will be true. 3) After the framework has started, if a user adds our bot to a new space    a membership:created event occurs which also spawns a bot.  The     framework will inlcude the addedBy parameter and framework.initialized    will be true.   A best practice In these cases, is to include application    logic for the bot to "introduce itself" and/or do something with the    information about the user who created the bot's membership |

**Example**  
```js
// DM the user who added bot to a group space
framework.on('spawn', (bot, flintId, addedById) => {
    if (!addedById) {
     // don't say anything here or your bot's spaces will get
     // spammed every time your server is restarted
     framework.debug(`Framework spawned a bot object in existing
        space: ${bot.room.title}`);
  } else {
    if ((bot.room.type === 'group') && (addedById)) {
      // In this example we imagine our bot is only allowed in 1-1 spaces
      // our bot creates a 1-1 with the addedBy user, and leaves the group space
      bot.dm(addedById, `I see you added me to the the space "${bot.room.title}", ` +
        `but I am not allowed in group spaces.  ` +
        `We can talk here if you like.`).then(() => bot.exit());
    } else {
      bot.say(`Thanks for adding me to this space.  Here is what I can do...`);
    }
  }
});
```
<a name="event_despawn"></a>

## "despawn"
Bot Despawned.

**Kind**: event emitted  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| bot | <code>object</code> | Bot Object |
| id | <code>string</code> | Framework UUID |
| id | <code>string</code> | ID of user who removed the bot (if available) |


# Storage Driver Reference


<a name="MongoStore"></a>

## MongoStore
**Kind**: global class  

* [MongoStore](#MongoStore)
    * [new MongoStore(config)](#new_MongoStore_new)
    * [.config](#MongoStore+config) : <code>object</code>
    * [.initialize()](#MongoStore+initialize) ⇒ <code>Promise.&lt;Boolean&gt;</code>
    * [.getName()](#MongoStore+getName) ⇒ <code>string</code>
    * [.initStorage(id, initBotStorageData)](#MongoStore+initStorage) ⇒ <code>Promise.&lt;Object&gt;</code>
    * [.store(id, key, value)](#MongoStore+store) ⇒ <code>Promise.&lt;String&gt;</code> \| <code>Promise.&lt;Number&gt;</code> \| <code>Promise.&lt;Boolean&gt;</code> \| <code>Promise.&lt;Array&gt;</code> \| <code>Promise.&lt;Object&gt;</code>
    * [.recall(id, [key])](#MongoStore+recall) ⇒ <code>Promise.&lt;String&gt;</code> \| <code>Promise.&lt;Number&gt;</code> \| <code>Promise.&lt;Boolean&gt;</code> \| <code>Promise.&lt;Array&gt;</code> \| <code>Promise.&lt;Object&gt;</code>
    * [.forget(id, [key])](#MongoStore+forget) ⇒ <code>Promise.&lt;String&gt;</code> \| <code>Promise.&lt;Number&gt;</code> \| <code>Promise.&lt;Boolean&gt;</code> \| <code>Promise.&lt;Array&gt;</code> \| <code>Promise.&lt;Object&gt;</code>
    * [.writeMetric(bot, appData, actor)](#MongoStore+writeMetric) ⇒ <code>Promise.&lt;Object&gt;</code>

<a name="new_MongoStore_new"></a>

### new MongoStore(config)
Creates an instance of the Mongo Storage Adaptor.
This storage adaptor uses a Mongo database that allows
bot storage information to persist across server restarts.
It has been tested with cloud mongo db conections and requires
mondodb driver 3.4 or greater.


| Param | Type | Description |
| --- | --- | --- |
| config | <code>Object</code> | Configuration object containing mongo db and collection settings. |

**Example**  
```js
var config = {
  mongoUri: 'mongodb://[username:password@]host1[:port1][,...hostN[:portN]][/[database][?options]]',
  storageCollectionName: 'webexBotFrameworkStorage'
};
let MongoStore = require('webex-node-bot-framework/storage/mongo');
let mongoStore = new MongoStore(config);
```
<a name="MongoStore+config"></a>

### mongoStore.config : <code>object</code>
Options Object

**Kind**: instance namespace of [<code>MongoStore</code>](#MongoStore)  
**Properties**

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| mongoUri | <code>string</code> |  | URI to connect to Mongo.            This is typically in the format of:\n mongodb+srv://[username:password@]host1[:port1][,...hostN[:portN]][/[database][?options]],            ie: mongodb+srv://myUser:secretPassw0rd@cluster#-area.mongodb.net/myClusterDBName?retryWrites=true&w=majority`,            see:  https://docs.mongodb.com/manual/reference/connection-string/ |
| [storageCollectionName] | <code>string</code> | <code>&quot;webexBotFrameworkStorage&quot;</code> | Mongo collection name for bot.[store,recall]() (will be created if does not exist) |
| [initBotStorageData] | <code>object</code> | <code>{}</code> | Object with any default key/value pairs that a new bot should get upon creation |
| [metricsCollectionName] | <code>string</code> |  | Mongo collection name for bot.writeMetric() (will be created if set, but does not exist),     bot.writeMetric() calls will fail if this is not set |
| [metricsStoreIdsOnly] | <code>Boolean</code> |  | Only store user id and org id in the metrics store |
| [singleInstance] | <code>Boolean</code> | <code>false</code> | Optimize bot.recall() speed if the bot is only running a single instance.     Data is still written to db, but lookups are done from local memory     Should be used with caution! |

<a name="MongoStore+initialize"></a>

### mongoStore.initialize() ⇒ <code>Promise.&lt;Boolean&gt;</code>
Initializes the connection to the db.
Call this, and wait for the return before setting the 
framework's storage adaptor, and then calling framework.start()

**Kind**: instance method of [<code>MongoStore</code>](#MongoStore)  
**Returns**: <code>Promise.&lt;Boolean&gt;</code> - - True if setup  
**Example**  
```js
// Wait for the connection to the DB to initialize before setting the
 // framework's storage driver and starting framework
 mongoStore.initialize()
   .then(() => framework.storageDriver(mongoStore))
   .then(() => framework.start())
   .catch((e) => {
     console.error(`Initialization with mongo storage failed: ${e.message}`)
     process.exit(-1);
  });
```
<a name="MongoStore+getName"></a>

### mongoStore.getName() ⇒ <code>string</code>
Get the storage adaptor's name

**Kind**: instance method of [<code>MongoStore</code>](#MongoStore)  
**Returns**: <code>string</code> - - storage adaptor name  
<a name="MongoStore+initStorage"></a>

### mongoStore.initStorage(id, initBotStorageData) ⇒ <code>Promise.&lt;Object&gt;</code>
Called by the framework, when a bot is spawned,
this function reads in any existng bot configuration from the DB
or creates the default one if none is found

In general bot developers should not need to call this method

**Kind**: instance method of [<code>MongoStore</code>](#MongoStore)  
**Returns**: <code>Promise.&lt;Object&gt;</code> - - bot's initial or previously stored config data  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>String</code> | Room/Conversation/Context ID |
| initBotStorageData | <code>object</code> | data to initialize a new bot with |

<a name="MongoStore+store"></a>

### mongoStore.store(id, key, value) ⇒ <code>Promise.&lt;String&gt;</code> \| <code>Promise.&lt;Number&gt;</code> \| <code>Promise.&lt;Boolean&gt;</code> \| <code>Promise.&lt;Array&gt;</code> \| <code>Promise.&lt;Object&gt;</code>
Store key/value data.

This method is exposed as bot.store(key, value);

**Kind**: instance method of [<code>MongoStore</code>](#MongoStore)  
**Returns**: <code>Promise.&lt;String&gt;</code> \| <code>Promise.&lt;Number&gt;</code> \| <code>Promise.&lt;Boolean&gt;</code> \| <code>Promise.&lt;Array&gt;</code> \| <code>Promise.&lt;Object&gt;</code> - -- stored value  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>String</code> | Room/Conversation/Context ID |
| key | <code>String</code> | Key under id object |
| value | <code>String</code> \| <code>Number</code> \| <code>Boolean</code> \| <code>Array</code> \| <code>Object</code> | Value of key |

<a name="MongoStore+recall"></a>

### mongoStore.recall(id, [key]) ⇒ <code>Promise.&lt;String&gt;</code> \| <code>Promise.&lt;Number&gt;</code> \| <code>Promise.&lt;Boolean&gt;</code> \| <code>Promise.&lt;Array&gt;</code> \| <code>Promise.&lt;Object&gt;</code>
Recall value of data stored by 'key'.

This method is exposed as bot.recall(key, value);

**Kind**: instance method of [<code>MongoStore</code>](#MongoStore)  
**Returns**: <code>Promise.&lt;String&gt;</code> \| <code>Promise.&lt;Number&gt;</code> \| <code>Promise.&lt;Boolean&gt;</code> \| <code>Promise.&lt;Array&gt;</code> \| <code>Promise.&lt;Object&gt;</code> - -- recalled value  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>String</code> | Room/Conversation/Context ID |
| [key] | <code>String</code> | Key under id object (optional). If key is not passed, all keys for id are returned as an object. |

<a name="MongoStore+forget"></a>

### mongoStore.forget(id, [key]) ⇒ <code>Promise.&lt;String&gt;</code> \| <code>Promise.&lt;Number&gt;</code> \| <code>Promise.&lt;Boolean&gt;</code> \| <code>Promise.&lt;Array&gt;</code> \| <code>Promise.&lt;Object&gt;</code>
Forget a key or entire store.

This method is exposed as bot.forget(key, value);

**Kind**: instance method of [<code>MongoStore</code>](#MongoStore)  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>String</code> | Room/Conversation/Context ID |
| [key] | <code>String</code> | Key to forget (optional). If key is not passed, all stored configs are removed. |

<a name="MongoStore+writeMetric"></a>

### mongoStore.writeMetric(bot, appData, actor) ⇒ <code>Promise.&lt;Object&gt;</code>
Write a metrics object to the database

This method is exposed as bot.writeMetric(appData, actor);

**Kind**: instance method of [<code>MongoStore</code>](#MongoStore)  
**Returns**: <code>Promise.&lt;Object&gt;</code> - - final data object written  

| Param | Type | Description |
| --- | --- | --- |
| bot | <code>object</code> | bot that is writing the metric |
| appData | <code>object</code> | app specific metric data. |
| actor | <code>object</code> \| <code>string</code> | user that triggered the metric activity |

# License

The MIT License (MIT)

Copyright (c) 2016-2021

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
