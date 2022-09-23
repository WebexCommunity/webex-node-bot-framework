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

