"use strict";

module.exports = function(framework) {
  framework.hears('hello', function(bot, trigger) {
    bot.say('Hello %s!', trigger.person.displayName);
  });
};
