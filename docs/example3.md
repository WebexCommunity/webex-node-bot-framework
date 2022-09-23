## Example #3 Using Webex SDK's events via websockets
An inbound, internet reachable port, is required for the Webex API to notify
Framework of webhook events. This is not always easy or possible. 

In the summer of 2019, Cisco introduced a new mechanism in the Webex Javascript SDK which allows applications to register to receive the message, membership, and room events via a socket instead of via wehbhoks. This allows applications to be deployed behind firewalls and removes the requirement that webex bots and integrations must expose a public IP address to receive events. 

The webex-node-bot-framework allows your application to take advantage of this by simply removing the webhookUrl field from the configuration object passed to the framework constructor. If this field is not set, the framework will register to listen for the socket based events instead of creating webhooks.

```js
var Framework = require('webex-node-bot-framework');

// No express server needed when running in websocket mode

// framework options
var config = {
  // No webhookUrl, webhookSecret, or port needed
  token: 'Tm90aGluZyB0byBzZWUgaGVyZS4uLiBNb3ZlIGFsb25nLi4u'
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
}, '**hello** - say hello and I\'ll say hello back'); // zero is default priorty

// Its a good practice to handle unexpected input
// Setting a priority > 0 means this will be called only if nothing else matches
framework.hears(/.*/gim, (bot, trigger) => {
    bot.say('Sorry, I don\'t know how to respond to "%s"', trigger.message.text);
    bot.say('markdown', framework.showHelp());
}, 99999);


// gracefully shutdown (ctrl-c)
// This is especially important when using websockets
// as it cleans up the socket connection. Failure to do
// this could result in an "excessive device registrations"
// error during the iterative development process
process.on('SIGINT', () => {
  framework.debug('stoppping...');
  framework.stop().then(() => {
    server.close();
    process.exit();
  });
});
```
[**Express Example**](./example1.md)

[**Restify Example**](./example2.md)

[**Buttons and Cards Example**](./buttons-and-cards-example.md)

[**Back to README**](../README.md)
