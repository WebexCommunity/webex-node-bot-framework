## Example #2 Using Restify
```js
var Framework = require('webex-node-bot-framework');
var webhook = require('webex-node-bot-framework/webhook');
var Restify = require('restify');
var server = Restify.createServer();
server.use(Restify.bodyParser());

// framework options
var config = {
  webhookUrl: 'http://myserver.com/framework',
  token: 'Tm90aGluZyB0byBzZWUgaGVyZS4uLiBNb3ZlIGFsb25nLi4u',
  port: 80
};

// init framework
var framework = new Framework(config);
framework.start();

// say hello
framework.hears('/hello', function(bot, trigger) {
  bot.say('Hello %s!', trigger.person.displayName);
});

// define restify path for incoming webhooks
server.post('/framework', webhook(framework));

// start restify server
server.listen(config.port, function () {
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
[**Express Example**](./example1.md)

[**Websocket Example**](./example3.md)

[**Buttons and Cards Example**](./buttons-and-cards-example.md)

[**Back to README**](../README.md)
