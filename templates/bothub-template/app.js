"use strict";

var Framework = require('webex-node-bot-framework');
var webhook = require('webex-node-bot-framework/webhook');
var express = require('express');
var bodyParser = require('body-parser');
var path = require('path');

var config = require(path.join(__dirname, 'config.js'));

// var RedisStore = require('webex-node-bot-framework/storage/redis');

var app = express();
app.use(bodyParser.json());

// init framework
var framework = new Framework(config);

// use redis storage
// framework.storageDriver(new RedisStore(process.env.REDIS_URL));

//start framework, load plugin(s)
framework.start()
  .then(() => {
    framework.use(path.join(__dirname, 'framework.js'));
  })
  .then(() => {
    framework.debug('Framework has started');
  });

// define express path for incoming webhooks
app.post('/framework', webhook(framework));

// start express server
var server = app.listen(process.env.PORT, function () {
  framework.debug('Framework listening on port %s', process.env.PORT);
});

// gracefully shutdown (ctrl-c)
process.on('SIGINT', function() {
  framework.debug('stoppping...');
  server.close();
  framework.stop().then(function() {
    process.exit();
  });
});
