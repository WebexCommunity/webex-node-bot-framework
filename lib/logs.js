var util = require('util');
var _ = require('lodash');

module.exports = function(framework) {

  framework.on('initialized', function() {
    var msg = util.format('(Framework Initialized) %s rooms', framework.bots.length);
    framework.log(msg);
  });

  framework.on('start', function() {
    var msg = util.format('(Framework Started) "%s"', framework.email);
    framework.log(msg);
  });

  framework.on('stop', function() {
    var msg = util.format('(Framework Stopped) "%s"', framework.email);
    framework.log(msg);
  });

  framework.on('spawn', (bot) => {
    var msg = util.format('(Room Discovered) "%s"', bot.room.title);
    framework.log(msg);
  });

  framework.on('despawn', (bot) => {
    var msg = util.format('(Room Removed) "%s"', bot.room.title);
    framework.log(msg);
  });

  framework.on('message', (bot, trigger) => {
    var msg = util.format('(Messsage Received) "%s" "%s" "%s"', bot.room.title, trigger.person.emails[0], trigger.message.text);
    framework.log(msg);
  });

  framework.on('files', (bot, trigger) => {
    _.forEach(trigger.message.files, file => {
      var msg = util.format('(File Uploaded) "%s" "%s" "%s"', bot.room.title, trigger.person.emails[0], file.name);
      framework.log(msg);
    });
  });

  framework.on('roomLocked', (bot) => {
    var msg = util.format('(Room moderated) "%s"', bot.room.title);
    framework.log(msg);
  });

  framework.on('roomUnlocked', (bot) => {
    var msg = util.format('(Room unmoderated) "%s"', bot.room.title);
    framework.log(msg);
  });

  framework.on('botAddedAsModerator', (bot) => {
    var msg = util.format('(Added as Room Moderator) "%s" "%s"', bot.room.title, bot.email);
    framework.log(msg);
  });

  framework.on('botRemovedAsModerator', (bot) => {
    var msg = util.format('(Removed as Room Moderator) "%s" "%s"', bot.room.title, bot.email);
    framework.log(msg);
  });

  framework.on('personAddedAsModerator', (bot, person) => {
    var msg = util.format('(Added as Room Moderator) "%s" "%s"', bot.room.title, person.email);
    framework.log(msg);
  });

  framework.on('personRemovedAsModerator', (bot, person) => {
    var msg = util.format('(Removed as Room Moderator) "%s" "%s"', bot.room.title, person.email);
    framework.log(msg);
  });

  framework.on('memberEnters', function(bot, membership) {
    var msg = util.format('(Room Entered) "%s" "%s"', bot.room.title, membership.personEmail);
    framework.log(msg);
  });

  framework.on('memberExits', function(bot, membership) {
    var msg = util.format('(Room Exited) "%s" "%s"', bot.room.title, membership.personEmail);
    framework.log(msg);
  });

};
