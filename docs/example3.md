## Example #3 Using Socket2me (experimental and under development)
An inbound, internet reachable port, is required for the Webex API to notify
Framework of webhook events. This is not always easy or possible.

Framework utilize a remote socket client through a
[socket2me](https://github.com/nmarus/socket2me) server in the event you want to
stand up a bot where forwarding a port is not possible.

The remote socket2me server allows you to run Framework behind a NAT without adding
a port forward configuration to your firewall. To make use of a socket2me
server, you can either stand up your own socket2me server or make use of a
public/shared socket2me server. A single socket2me server can support many
clients/bots simultaneously.

```js
var Framework = require('webex-node-bot-framework');
var webhook = require('webex-node-bot-framework/webhook');
var Socket2meClient = require('socket2me-client');
var server = new Socket2meClient('https://socket.bothub.io');

// framework options
var config = {
  token: 'Tm90aGluZyB0byBzZWUgaGVyZS4uLiBNb3ZlIGFsb25nLi4u'
};

// get a remote webhook from socket2me server
server.on('connected', function(webhookUrl) {
  config.webhookUrl = webhookUrl;

  var framework = new Framework(config);
  framework.start();

  // say hello
  framework.hears('/hello', function(bot, trigger) {
    bot.say('Hello %s!', trigger.person.displayName);
  });

  server.requestHandler(function(request, respond) {
    webhook(framework)(request);
    respond(200, 'OK');
  });
});
```
