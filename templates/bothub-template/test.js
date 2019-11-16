"use strict";

var Framework = require('webex-node-bot-framework');
var webhook = require('webex-node-bot-framework/webhook');
var Socket2meClient = require('socket2me-client');
var path = require('path');

var server = new Socket2meClient('https://socket.bothub.io');

// var RedisStore = require('webex-node-bot-framework/storage/redis');

// framework options
var config = require(path.join(__dirname, 'config.js'));

// get a remote webhook from socket2me server
server.on('connected', function(webhookUrl) {
  config.webhookUrl = webhookUrl;

  var framework = new Framework(config);

  // use redis storage
  // framework.storageDriver(new RedisStore('redis://127.0.0.1'));

  //start framework, load plugin(s)
  framework.start()
    .then(() => {
      framework.use(path.join(__dirname, 'framework.js'));
    })
    .then(() => {
      framework.debug('Framework has started');
    });

  server.requestHandler(function(request, respond) {
    webhook(framework)(request);
    respond(200, 'OK');
  });
});
