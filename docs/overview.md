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
