var util = require('util');
var _ = require('lodash');

module.exports = function(framework) {

  framework.on('initialized', function(id) {
    var msg = util.format('(Framework Initialized) %s rooms', framework.bots.length);
    framework.log(msg);
  });

  framework.on('start', function(id) {
    var msg = util.format('(Framework Started) "%s"', framework.email);
    framework.log(msg);
  });

  framework.on('stop', function(id) {
    var msg = util.format('(Framework Stopped) "%s"', framework.email);
    framework.log(msg);
  });

  framework.on('spawn', (bot, id) => {
    var msg = util.format('(Room Discovered) "%s"', bot.room.title);
    framework.log(msg);
  });

  framework.on('despawn', (bot, id) => {
    var msg = util.format('(Room Removed) "%s"', bot.room.title);
    framework.log(msg);
  });

  framework.on('message', (bot, trigger, id) => {
    var msg = util.format('(Messsage Received) "%s" "%s" "%s"', bot.room.title, trigger.person.emails[0], trigger.message.text);
    framework.log(msg);
  });

  framework.on('files', (bot, trigger, id) => {
    _.forEach(trigger.message.files, file => {
      var msg = util.format('(File Uploaded) "%s" "%s" "%s"', bot.room.title, trigger.person.emails[0], file.name);
      framework.log(msg);
    });
  });

  framework.on('roomLocked', (bot, id) => {
    var msg = util.format('(Room moderated) "%s"', bot.room.title);
    framework.log(msg);
  });

  framework.on('roomUnlocked', (bot, id) => {
    var msg = util.format('(Room unmoderated) "%s"', bot.room.title);
    framework.log(msg);
  });

  framework.on('botAddedAsModerator', (bot, id) => {
    var msg = util.format('(Added as Room Moderator) "%s" "%s"', bot.room.title, bot.email);
    framework.log(msg);
  });

  framework.on('botRemovedAsModerator', (bot, id) => {
    var msg = util.format('(Removed as Room Moderator) "%s" "%s"', bot.room.title, bot.email);
    framework.log(msg);
  });

  framework.on('personAddedAsModerator', (bot, person, id) => {
    var msg = util.format('(Added as Room Moderator) "%s" "%s"', bot.room.title, person.email);
    framework.log(msg);
  });

  framework.on('personRemovedAsModerator', (bot, person, id) => {
    var msg = util.format('(Removed as Room Moderator) "%s" "%s"', bot.room.title, person.email);
    framework.log(msg);
  });

  framework.on('memberEnters', function(bot, membership, id) {
    var msg = util.format('(Room Entered) "%s" "%s"', bot.room.title, membership.personEmail);
    framework.log(msg);
  });

  framework.on('memberExits', function(bot, membership, id) {
    var msg = util.format('(Room Exited) "%s" "%s"', bot.room.title, membership.personEmail);
    framework.log(msg);
  });

};
