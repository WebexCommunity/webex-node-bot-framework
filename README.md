# webex-node-bot-framework

### Webex Teams Bot Framework for Node JS

**Warning** - *This project is still in its initial development, so use at your own risk.  For details on areas that may still require attention before the project is fully complete please see the* [To Do List](./docs/ToDo.MD)

This project is inspired by, and provides an alternate implementation of, the awesome [node-flint](https://github.com/flint-bot/flint/) framework by [Nick Marus](https://github.com/nmarus).  The framework makes it easy to quickly develop a Webex Teams bot, abstractig away some of the complexity of Webex For Developers interfaces, such as registering for events and calling REST APIs. A bot developer can use the framework to spark their imagination and focus primarily on how the bot will interact with users in Webex Teams.

The primary change in this implementation is that it is based on the [webex-jssdk](https://webex.github.io/webex-js-sdk) which continues to be supported as new features and functionality are added to Webex.  

For developers who are familiar with flint, or who wish to port existing bots built on node-flint to the webex-node-bot-framework, this implementation is NOT backwards compatible.  Please see [Differences from original flint framework](./docs/migrate-from-node-flint.md)

## [Version History](./docs/version-history.md)


## Contents

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [Installation](#installation)
    - [Via Git](#via-git)
    - [Via NPM](#via-npm)
    - [Example Template Using Express](#example-template-using-express)
- [Overview](#overview)
- [Authentication](#authentication)
- [Storage](#storage)
- [Bot Accounts](#bot-accounts)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->
## Installation

#### Via Git
```bash
mkdir myproj
cd myproj
git clone https://github.com/jpjpjp/webex-node-bot-framework
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
framework.on("initialized", function () {
  framework.debug("Framework initialized successfully! [Press CTRL-C to quit]");
});

// A spawn event is generated when the framework finds a space with your bot in it
framework.on('spawn', function (bot) {
  if (!framework.initialized) {
    // don't say anything here or your bot's spaces will get 
    // spammed every time your server is restarted
    framework.debug(`While starting up framework found our bot in a space called: ${bot.room.title}`);
  } else {
    // After initialization, a spawn event means your bot got added to 
    // a new space.   Say hello, and tell users what you do!
    bot.say('Hi there, you can say hello to me.  Don\'t forget you need to mention me in a group space!');
  }
});

var responded = false;
// say hello
framework.hears('hello', function(bot, trigger) {
  bot.say('Hello %s!', trigger.person.displayName);
  responded = true;
});

// Its a good practice to handle unexpected input
framework.hears(/.*/gim, function(bot, trigger) {
  if (!responded) {
    bot.say('Sorry, I don\'t know how to respond to "%s"', trigger.message.text);
  }
  responded = false;
});

// define express path for incoming webhooks
app.post('/framework', webhook(framework));

// start express server
var server = app.listen(config.port, function () {
  framework.debug('Framework listening on port %s', config.port);
});

// gracefully shutdown (ctrl-c)
process.on('SIGINT', function() {
  framework.debug('stoppping...');
  server.close();
  framework.stop().then(function() {
    process.exit();
  });
});
```

[**Websocket Example**](./docs/example3.md)

[**Buttons and Cards Example**](./docs/buttons-and-cards-example.md)

[**Restify Example**](./docs/example2.md)

## Overview

The framework provides developers with some basic scaffolding to quickly get a bot up and running.  Once a framework object is created with a configuration that includes a bot token, calling the framework.start() method kicks of the setup of this scaffolding.   The framework registers for all Webex Teams events, and discovers any existing Webex Teams spaces that the bot is already a member of.  A bot object is created for each space.  When all existing bot objects are created the framework generates an `initialized` event signalling that it is ready to begin "listening" for user input.



```js
// init framework
var framework = new Framework(config);
framework.start();

// An initialized event means your webhooks are all registered and the 
// framework has created a bot object for all the spaces your bot is in
framework.on("initialized", function () {
  framework.debug("Framework initialized successfully! [Press CTRL-C to quit]");
});

// A spawn event is generated when the framework finds a space with your bot in it
framework.on('spawn', function (bot) {
  if (!framework.initialized) {
    // don't say anything here or your bot's spaces will get 
    // spammed every time your server is restarted
    framework.debug(`While starting up framework found our bot in a space called: ${bot.room.title}`);
  } else {
    // After initialization, a spawn event means your bot got added to 
    // a new space.   Say hello, and tell users what you do!
    bot.say('Hi there, you can say hello to me.  Don\'t forget you need to mention me in a group space!');
  }
});
```

Most of the framework's functionality is based around the framework.hears function. This
defines the phrase or pattern the bot is listening for and what actions to take
when that phrase or pattern is matched. The framework.hears function gets a callback
than includes two objects. The bot object, and the trigger object.

The bot object is a specific instance of the Bot class associated with the Webex Teams space that triggered the framework.hears call.  
The trigger object provides details about the person and room and message, that caused the framework.hears function to be triggered.

A simple example of a framework.hears() function setup:

```js
framework.hears(phrase, function(bot, trigger) {
  bot.<command>
    .then(function(returnedValue) {
      // do something with returned value
    })
    .catch(function(err) {
      // handle errors
    });
});
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

## Authentication
The token used to authenticate the Framework with the Webex API is passed as part of the
options used when instantiating the Framework class. To change or update the
token, use the Framework#setWebexToken() method.

**Example:**

```js
var newToken = 'Tm90aGluZyB0byBzZWUgaGVyZS4uLiBNb3ZlIGFsb25nLi4u';

framework.setWebexToken(newToken)
.then(function(token) {
  console.log('token updated to: ' + token);
});
```

## Storage
The storage system used in the framework is a simple key/value store and resolves around
these 3 methods:

* `bot.store(key, value)` - Store a value to a bot instance where 'key' is a
  string and 'value' is a boolean, number, string, array, or object. *This does
  not not support functions or any non serializable data.* Returns the a promise
  with the value.
* `bot.recall(key)` - Recall a value by 'key' from a bot instance. Returns a
  resolved promise with the value or a rejected promise if not found.
* `bot.forget([key])` - Forget (remove) value(s) from a bot instance where 'key'
  is an optional property that when defined, removes the specific key, and when
  undefined, removes all keys. Returns a resolved promise if deleted or not found.

When a bot despawns (is removed from a space), the key/value store for that bot
instance will automatically be removed from the store. Framework currently has an
in-memory store and a Redis based store. By default, the in-memory store is
used. Other backend stores are possible by replicating any one of the built-in
storage modules and passing it to the `framework.storeageDriver()` method. *See
docs for store, recall, forget for more details.*

**Example:**

```js
var redisDriver = require('webex-node-bot-framework/storage/redis');
framework.storageDriver(redisDriver('redis://localhost'));
```

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
<dd><p>Meber Exits Room.</p>
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
    * [.stop()](#Framework+stop) ⇒ <code>Promise.&lt;Boolean&gt;</code>
    * [.start()](#Framework+start) ⇒ <code>Promise.&lt;Boolean&gt;</code>
    * [.restart()](#Framework+restart) ⇒ <code>Promise.&lt;Boolean&gt;</code>
    * [.getMessage(messageId)](#Framework+getMessage) ⇒ <code>Promise.&lt;Message&gt;</code>
    * [.getFiles(messageId)](#Framework+getFiles) ⇒ <code>Promise.&lt;Array&gt;</code>
    * [.getAttachmentAction(attachmentActionId)](#Framework+getAttachmentAction) ⇒ <code>Promise.&lt;AttachmentAction&gt;</code>
    * [.hears(phrase, action, [helpText], [preference])](#Framework+hears) ⇒ <code>String</code>
    * [.clearHears(id)](#Framework+clearHears) ⇒ <code>null</code>
    * [.showHelp([header], [footer])](#Framework+showHelp) ⇒ <code>String</code>
    * [.setAuthorizer(Action)](#Framework+setAuthorizer) ⇒ <code>Boolean</code>
    * [.clearAuthorizer()](#Framework+clearAuthorizer) ⇒ <code>null</code>
    * [.storageDriver(Driver)](#Framework+storageDriver) ⇒ <code>null</code>
    * [.use(path)](#Framework+use) ⇒ <code>Boolean</code>

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
| [messageFormat] | <code>string</code> | <code>&quot;text&quot;</code> | Default Webex message format to use with bot.say(). |
| [maxPageItems] | <code>number</code> | <code>50</code> | Max results that the paginator uses. |
| [maxConcurrent] | <code>number</code> | <code>3</code> | Max concurrent sessions to the Webex API |
| [minTime] | <code>number</code> | <code>600</code> | Min time between consecutive request starts. |
| [requeueMinTime] | <code>number</code> | <code>minTime*10</code> | Min time between consecutive request starts of requests that have been re-queued. |
| [requeueMaxRetry] | <code>number</code> | <code>3</code> | Msx number of atteempts to make for failed request. |
| [requeueCodes] | <code>array</code> | <code>[429,500,503]</code> | Array of http result codes that should be retried. |
| [requestTimeout] | <code>number</code> | <code>20000</code> | Timeout for an individual request recieving a response. |
| [queueSize] | <code>number</code> | <code>10000</code> | Size of the buffer that holds outbound requests. |
| [requeueSize] | <code>number</code> | <code>10000</code> | Size of the buffer that holds outbound re-queue requests. |
| [id] | <code>string</code> | <code>&quot;random&quot;</code> | The id this instance of Framework uses. |
| [webhookRequestJSONLocation] | <code>string</code> | <code>&quot;body&quot;</code> | The property under the Request to find the JSON contents. |
| [removeWebhooksOnStart] | <code>Boolean</code> | <code>true</code> | If you wish to have the bot remove all account webhooks when starting. Ignored if webhookUrl is not set. |

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
  .then(function(token) {
     console.log('token updated to: ' + token);
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
<a name="Framework+getMessage"></a>

### framework.getMessage(messageId) ⇒ <code>Promise.&lt;Message&gt;</code>
Get Message Object by ID

**Kind**: instance method of [<code>Framework</code>](#Framework)  

| Param | Type | Description |
| --- | --- | --- |
| messageId | <code>String</code> | Message ID from Webex API. |

<a name="Framework+getFiles"></a>

### framework.getFiles(messageId) ⇒ <code>Promise.&lt;Array&gt;</code>
Get Files from Message Object by ID

**Kind**: instance method of [<code>Framework</code>](#Framework)  

| Param | Type | Description |
| --- | --- | --- |
| messageId | <code>String</code> | Message ID from Webex API. |

<a name="Framework+getAttachmentAction"></a>

### framework.getAttachmentAction(attachmentActionId) ⇒ <code>Promise.&lt;AttachmentAction&gt;</code>
Get Attachement Action by ID

**Kind**: instance method of [<code>Framework</code>](#Framework)  

| Param | Type | Description |
| --- | --- | --- |
| attachmentActionId | <code>String</code> | attachmentActionID from Webex API. |

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
framework.hears('/say', function(bot, trigger, id) {
  bot.say(trigger.args.slice(1, trigger.arges.length - 1));
}, '/say <greeting> - Responds with a greeting');
```
**Example**  
```js
// using regex to match across entire message
framework.hears(/(^| )beer( |.|$)/i, function(bot, trigger, id) {
  bot.say('Enjoy a beer, %s! 🍻', trigger.person.displayName);
});
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
var hearsHello = framework.hears('/framework', function(bot, trigger, id) {
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
| [footer] | <code>String</code> | <code>Powered by Webex Node Bot Framework - https://github.com/jpjpjp/webex-node-bot-framework</code> | String to use in footer before displaying help message. |

**Example**  
```js
framework.hears('/help', function(bot, trigger, id) {
  bot.say(framework.showHelp());
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

### framework.storageDriver(Driver) ⇒ <code>null</code>
Defines storage backend.

**Kind**: instance method of [<code>Framework</code>](#Framework)  

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
module.exports = function(framework) {
  framework.on('spawn', function(bot) {
    console.log('new bot spawned in room: %s', bot.myroom.title);
  });
  framework.on('despawn', function(bot) {
    console.log('bot despawned in room: %s', bot.myroom.title);
  });
  framework.on('messageCreated', function(message, bot) {
    console.log('"%s" said "%s" in room "%s"', message.personEmail, message.text, bot.myroom.title);
  });
};
```
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
| isDirectTo | <code>string</code> | Recipient Email if bot is in 1:1/Direct Room |
| lastActivity | <code>date</code> | Last bot activity |


* [Bot](#Bot)
    * [new Bot(framework, options, webex)](#new_Bot_new)
    * [.exit()](#Bot+exit) ⇒ <code>Promise.&lt;Boolean&gt;</code>
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
    * [.reply(replyTo, message, [format])](#Bot+reply) ⇒ <code>Promise.&lt;Message&gt;</code>
    * [.dm(person, [format], message)](#Bot+dm) ⇒ <code>Promise.&lt;Message&gt;</code>
    * [.sendCard(cardJson, fallbackText)](#Bot+sendCard) ⇒ <code>Promise.&lt;Message&gt;</code>
    * [.uploadStream(filename, stream)](#Bot+uploadStream) ⇒ <code>Promise.&lt;Message&gt;</code>
    * [.messageStreamRoom(roomId, message)](#Bot+messageStreamRoom) ⇒ <code>Promise.&lt;Message&gt;</code>
    * [.upload(filepath)](#Bot+upload) ⇒ <code>Promise.&lt;Message&gt;</code>
    * [.censor(messageId)](#Bot+censor) ⇒ <code>Promise.&lt;Message&gt;</code>
    * [.roomRename(title)](#Bot+roomRename) ⇒ <code>Promise.&lt;Room&gt;</code>
    * [.getMessages(count)](#Bot+getMessages) ⇒ <code>Promise.&lt;Array&gt;</code>
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
  .catch(function(err) {
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
  .then(function(moderators) {
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
  .then(function(err) {
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
  .then(function(err) {
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
  .then(function(err) {
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
  .then(function(err) {
    console.log(err.message)
  });
```
<a name="Bot+implode"></a>

### bot.implode() ⇒ <code>Promise.&lt;Boolean&gt;</code>
Remove a room and all memberships.

**Kind**: instance method of [<code>Bot</code>](#Bot)  
**Example**  
```js
framework.hears('/implode', function(bot, trigger) {
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
framework.hears('/hello', function(bot, trigger) {
  bot.say('hello');
});
```
**Example**  
```js
// Simple example to send message and file
framework.hears('/file', function(bot, trigger) {
  bot.say({text: 'Here is your file!', file: 'http://myurl/file.doc'});
});
```
**Example**  
```js
// Markdown Method 1 - Define markdown as default
framework.messageFormat = 'markdown';
framework.hears('/hello', function(bot, trigger) {
  bot.say('**hello**, How are you today?');
});
```
**Example**  
```js
// Markdown Method 2 - Define message format as part of argument string
framework.hears('/hello', function(bot, trigger) {
  bot.say('markdown', '**hello**, How are you today?');
});
```
**Example**  
```js
// Mardown Method 3 - Use an object (use this method of bot.say() when needing to send a file in the same message as markdown text.
framework.hears('/hello', function(bot, trigger) {
  bot.say({markdown: '*Hello <@personEmail:' + trigger.personEmail + '|' + trigger.personDisplayName + '>*'});
});
```
**Example**  
```js
// Send an Webex card by providing a fully formed message object.
framework.hears('/card please', function(bot, trigger) {
  bot.say({       
     // Fallback text for clients that don't render cards is required
     markdown: "If you see this message your client cannot render buttons and cards.",
     attachments: [{
       "contentType": "application/vnd.microsoft.card.adaptive",
       "content": myCardsJson
    }]
   });
```
<a name="Bot+reply"></a>

### bot.reply(replyTo, message, [format]) ⇒ <code>Promise.&lt;Message&gt;</code>
Send a threaded message reply

NOTE:  Posting a threaded message response via API is currently a Webex EFT feature.  This method WILL FAIL
if your application identity is not configured for EFT access

**Kind**: instance method of [<code>Bot</code>](#Bot)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| replyTo | <code>Object</code> |  | Message or attachmentAction object to send to reply to. |
| message | <code>String</code> \| <code>Object</code> |  | Message to send to room. This can be a simple string, or a object for advanced use. |
| [format] | <code>String</code> | <code>text</code> | Set message format. Valid options are 'text' or 'markdown'. |

**Example**  
```js
// Simple example
framework.hears('/hello', function(bot, trigger) {
  bot.reply(trigger.message, 'hello back at you');
});
```
**Example**  
```js
// Markdown Method 1 - Define markdown as default
framework.messageFormat = 'markdown';
framework.hears('/hello', function(bot, trigger) {
  bot.reply(trigger.message, '**hello**, How are you today?');
});
```
**Example**  
```js
// Markdown Method 2 - Define message format as part of argument string
framework.hears('/hello', function(bot, trigger) {
  bot.reply(trigger.message, '**hello**, How are you today?', 'markdown');
});
```
**Example**  
```js
// Mardown Method 3 - Use an object (use this method of bot.reply() when needing to send a file in the same message as markdown text.
framework.hears('/hello', function(bot, trigger) {
  bot.reply(trigger.message, {markdown: '*Hello <@personEmail:' + trigger.personEmail + '|' + trigger.personDisplayName + '>*'});
});
```
**Example**  
```js
// Reply to a card when a user hits an action.submit button
framework.on('attachmentAction', function(bot, trigger) {
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
framework.hears('dm me', function(bot, trigger) {
  bot.dm(trigger.person.id, 'hello');
});
```
**Example**  
```js
// Simple example to send message and file
framework.hears('dm me a file', function(bot, trigger) {
  bot.dm(trigger.person.id, {text: 'Here is your file!', file: 'http://myurl/file.doc'});
});
```
**Example**  
```js
// Markdown Method 1 - Define markdown as default
framework.messageFormat = 'markdown';
framework.hears('dm me some rich text', function(bot, trigger) {
  bot.dm(trigger.person.id, '**hello**, How are you today?');
});
```
**Example**  
```js
// Markdown Method 2 - Define message format as part of argument string
framework.hears('dm someone', function(bot, trigger) {
  bot.dm('john@doe.com', 'markdown', '**hello**, How are you today?');
});
```
**Example**  
```js
// Mardown Method 3 - Use an object (use this method of bot.dm() when needing to send a file in the same message as markdown text.
framework.hears('dm someone', function(bot, trigger) {
  bot.dm('someone@domain.com', {markdown: '*Hello <@personId:' + trigger.person.id + '|' + trigger.person.displayName + '>*'});
});
```
<a name="Bot+sendCard"></a>

### bot.sendCard(cardJson, fallbackText) ⇒ <code>Promise.&lt;Message&gt;</code>
Send a Webex Teams Card to room.

**Kind**: instance method of [<code>Bot</code>](#Bot)  
**See**

- [Buttons and Cards Guide](https://developer.webex.com/docs/api/guides/cards/working-with-cards) for further information.
- [Buttons and Cards Framework Example](./docs/buttons-and-cards-example.md)


| Param | Type | Description |
| --- | --- | --- |
| cardJson | <code>Object</code> | The card JSON to render.  This can come from the Webex Buttons and Cards Designer. |
| fallbackText | <code>String</code> | Message to be displayed on client's that can't render cards. |

**Example**  
```js
// Simple example
framework.hears('card please', function(bot, trigger) {
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
 });
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
framework.hears('/file', function(bot, trigger) {

  // define filename used when uploading to room
  var filename = 'test.png';

  // create readable stream
  var stream = fs.createReadStream('/my/file/test.png');

  bot.uploadStream(filename, stream);
});
```
<a name="Bot+messageStreamRoom"></a>

### bot.messageStreamRoom(roomId, message) ⇒ <code>Promise.&lt;Message&gt;</code>
Streams message to a room.

**Kind**: instance method of [<code>Bot</code>](#Bot)  

| Param | Type | Description |
| --- | --- | --- |
| roomId | <code>String</code> | Webex Teams Room ID |
| message | <code>Object</code> | Message Object |

**Example**  
```js
var roomId = 'Tm90aGluZyB0byBzZWUgaGVyZS4uLiBNb3ZlIGFsb25nLi4u';
var text = 'Hello';
var filename = 'test.png';
var stream = fs.createReadStream(filename);
var message = { 'text': text, 'filename': filename, 'stream': stream };
bot.messageStreamRoom(roomId, message)
  .then(function(message) {
    console.log('Message sent: %s', message.txt);
  })
  .catch(function(err){
    console.log(err);
  });
```
<a name="Bot+upload"></a>

### bot.upload(filepath) ⇒ <code>Promise.&lt;Message&gt;</code>
Upload a file to room.

**Kind**: instance method of [<code>Bot</code>](#Bot)  

| Param | Type | Description |
| --- | --- | --- |
| filepath | <code>String</code> | File Path to upload |

**Example**  
```js
framework.hears('/file', function(bot, trigger) {
  bot.upload('test.png');
});
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
  .then(function(err) {
    console.log(err.message)
  });
```
<a name="Bot+getMessages"></a>

### bot.getMessages(count) ⇒ <code>Promise.&lt;Array&gt;</code>
Get messages from room. Returned data has newest message at bottom.

This function will not work when framework was created
using a bot token, it requires an authorized user token

**Kind**: instance method of [<code>Bot</code>](#Bot)  

| Param | Type | Description |
| --- | --- | --- |
| count | <code>Integer</code> | - count of messages to return (max 10) |

**Example**  
```js
bot.getMessages(5).then(function(messages) {
  messages.forEach(function(message) {
    // display message text
    if(message.text) {
      console.log(message.text);
    }
  });
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
| id | <code>string</code> | Framework UUID |

<a name="event_roomUnocked"></a>

## "roomUnocked"
Room Unocked event.

**Kind**: event emitted  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| bot | <code>object</code> | Bot Object |
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
Meber Exits Room.

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
| addedBy | <code>string</code> | ID of user who added bot to space if available Bots are typically spawned in one of two ways 1) When the framework first starts it looks for spaces that     our bot is already part of.  When discovered a new bot is spawned 2) After the framework has started, if a user adds our bot to a space    a membership:created event occurs which also spawns a bot In the latter case, we pass the actorId associated with the membership:created event.  This allows bots to do something with info about the user who added them when they are first spawned. |

**Example**  
```js
// DM the user who added bot to a group space
framework.on('spawn', function(bot, flintId, addedBy) {
  if (!framework.initialized) {
     // don't say anything here or your bot's spaces will get
     // spammed every time your server is restarted
     framework.debug(`While starting up our bot was found '+
       in a space called: ${bot.room.title}`);
  } else {
    if ((bot.room.type === 'group') && (addedBy)) {
      bot.dm(addedBy, 'I see you added me to the the space '  + bot.room.title + ',
        but I'm not allowed in group spaces.  We can talk here if you like.');
      bot.exit();
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

## License

The MIT License (MIT)

Copyright (c) 2016-2017

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
