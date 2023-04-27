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
framework.hears('hello', (bot, trigger) => {
  bot.say('Hello %s!', trigger.person.displayName);
}, '**hello** - say hello and I\'ll say hello back'); // zero is default priorty

// echo user input
framework.hears('echo', (bot, trigger) => {
  bot.say('markdown', `You said: ${trigger.prompt}`);
}, '**echo** - I\'ll echo back the rest of your message');

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

// define restify path for incoming webhooks
server.post('/framework', webhook(framework));

// start restify server
server.listen(config.port, () => {
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
[**Express Example**](./example1.md)

[**Websocket Example**](./example3.md)

[**Buttons and Cards Example**](./buttons-and-cards-example.md)

[**Back to README**](../README.md)
