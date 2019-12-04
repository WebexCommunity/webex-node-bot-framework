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
