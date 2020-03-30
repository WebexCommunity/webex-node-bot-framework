'use strict';

// const when = require('when');
// const _ = require('lodash');

module.exports = exports = function () {

  return {
    /**
     * Check if membership rules are met before emitting event
     *
     * @function
     * @returns {void} 
     */
    emit: function (framework, ...args) {
      // TODO do the membership check
      try {
        framework.emit(...args, framework.id);
      } catch(e) {
        console.error(`MembershipRules.emit() error: ${e.message}. No event emitted`);
      }
    },

    /**
     * Check if membership rules are met before emitting event with actor
     *
     * @function
     * @returns {void} 
     */
    emitWithActor: function (framework, event, bot, actorId) {
      // TODO do the membership check
      try {
        framework.emit(event, bot, framework.id, actorId);
      } catch(e) {
        console.error(`MembershipRules.emitWithActor() error: ${e.message}. No event emitted`);
      }
    },

    /**
     * Check if membership rules are met before emitting event with actor
     *
     * @function
     * @returns {void} 
     */
    emitBoth: function (framework, event, bot, ...args) {
      // TODO do the membership check
      try {
        framework.emit(event, bot, ...args, framework.id);
        bot.emit(event, bot, ...args, bot.id);
      } catch(e) {
        console.error(`MembershipRules.emitBoth() error: ${e.message}. No event emitted`);
      }
    },
  };

};
