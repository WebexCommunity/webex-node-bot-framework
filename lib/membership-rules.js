'use strict';

const when = require('when');
const _ = require('lodash');

class MembershipRules {
  constructor(framework) {
    this.framework = framework;
  }

  /**
   * Check if membership rules are met before emitting event
   *
   * @function
   * @param {string} event event to send
   * @param {array} args arglist to emit
   * @returns {void} 
   */
  emit(event, ...args) {
    // Todo back this out...non bot related events don't apply to memebership rules
    try {
      this.framework.emit(event, ...args);
    } catch (e) {
      console.error(`MembershipRules.emit() error: "${e.message}" while emitting "${event}" event. ` +
        `This may have been caused by an uncaught exception in an application handler.`);
    }
  }

  /**
   * Check if membership rules are met before emitting event with actor
   *
   * @function
   * @param {string} event event to send
   * @param {object} bot object
   * @param {string} actorId id of user who caused event
   * @returns {void} 
   */
  emitWithActor(event, bot, actorId) {
    try {
      if (!bot.active) {   // TODO is this sufficient or should I check in the deactive list?
        // TODO create membership-rules-event
        this.framework.emit('membershipRulesAction',
          'event-swallowed', event, bot, bot.id, actorId);
        console.error(`Swallowing event: "${event}" associated with ` +
          `disallowed bot in space: ${bot.room.id}`);
        return;
      }
      this.framework.emit(event, bot, this.framework.id, actorId);
    } catch (e) {
      console.error(`MembershipRules.emitWithActor() error: "${e.message}" ` +
        `while emitting "${event}" event. This may have been caused by ` +
        `an uncaught exception in an application handler.`);
    }
  }

  /**
   * Check if membership rules are met before emitting event with actor
   *
   * @function
   * @param {string} event event to send
   * @param {object} bot object
   * @param {array} args arglist to emit
   * @returns {void} 
   */
  emitBoth(event, bot, ...args) {
    try {
      if (!bot.active) {   // TODO is this sufficient or should I check in the deactive list?
        // TODO create membership-rules-event
        this.framework.emit('membershipRulesAction',
          'event-swallowed', event, bot, bot.id, args);
        console.error(`Swallowing event: "${event}" associated with ` +
          `disallowed bot in space: ${bot.room.id}`);
        return;
      }
      this.framework.emit(event, bot, ...args, this.framework.id);
      bot.emit(event, bot, ...args, bot.id);
    } catch (e) {
      console.error(`MembershipRules.emitBoth() error: "${e.message}" ` +
        `while emitting "${event}" event. This may have been caused by ` +
        `an uncaught exception in an application handler.`);
    }
  }

  /**
   * Check if a newly spawned bot meets our membership rules
   *
   * @function
   * @param {object} bot object
   * @param {Object} membership of bot in room
   * @param {String} [actorId] actorId associated with a membership:created event if available
   * @returns {Promise.<Boolean>}
   */
  onSpawn(bot, memberships, actorId) {
    return getMemberships(this.framework, bot, memberships)
      .then((memberships) => findInvalidMemberDomains(this.framework, memberships.items))
      .then((invalidMember) => {
        if (invalidMember) {
          //TODO send a LOG event?
          this.framework.inactiveBots.push(bot);
          //TODO send message to space?  Only if actorId!
          if ((actorId) && (this.framework.unauthorizedDomainUserEntersResponse)) {
            // Notify space that the bot is not allowed to interact here
            this.framework.webex.messages.create({
              roomId: bot.room.id,
              markdown: this.framework.unauthorizedDomainUserEntersResponse
            });
          }
          this.framework.emit('membershipRulesAction',
            'event-swallowed', 'spawn', bot, bot.id, actorId);
          return when(false);
        } else {
          return when(true);
        }
      })
      .catch((e) => {
        console.error(`MembershipRules.spawn() error: ${e.message}` +
          `Unable to validate that members in "${bot.room.title}" ` +
          `meet domain restrictions.  Erring on spawning bot for space`);
        return when(true);
      });
  }

  /**
   * Check if a new member changes active state of bot
   *
   * @function
   * @param {object} bot object
   * @param {Object} membership of bot in room
   * @returns {void} 
   */
  isNewMemberAllowed(bot, membership) {
    if (!bot.active) {
      // Already in de-active state
      return false;
    }
    if (!isMemberAllowed(membership, this.framework.restrictedDomains)) {
      try {
        // New member is dissallowed -- "despawn" and move to inactive list
        this.framework.bots = _.reject(this.framework.bots, {'id': bot.id});
        this.framework.inactiveBots.push(bot);
        bot.stop();
        this.framework.emit('despawn', bot, this.framework.id, null, membership);
        // Notify space that the bot is no longer allowed to interact here
        if (this.framework.unauthorizedDomainUserEntersResponse) {
          this.framework.webex.messages.create({
            roomId: bot.room.id,
            markdown: this.framework.unauthorizedDomainUserEntersResponse
          });
        }
        try {
          this.framework.emit('membershipRulesAction',
            'state-change', 'despawn', bot, bot.id, membership);
        } catch (e) {
          console.error(`MembershipRules.isNewMemberAllowed() error: "${e.message}" ` +
            `while emitting a "state-change:despawn" event. This may have been ` +
            `caused by an uncaught exception in an application handler.`);
        }
        return false;
      } catch (e) {
        console.error('MebershipRules.newMemberAllowed: Failed to remove bot after ' +
          'discovering a new disallowed member.  Bot is still active.');
        return true;
      }

    }
    return true;
  }

  /**
   * Check if an exiting member changes the activation state of the bot
   *
   * @function
   * @param {object} bot object
   * @param {Object} membership of bot in room
   * @returns {void} 
   */
  isAllowedAfterMemberLeaves(bot, membership) {
    if (bot.active) {
      // Already in active state
      return true;
    }
    if (!isMemberAllowed(membership, this.framework.restrictedDomains)) {
      // A disallowed member is leaving, check the rest of the members
      return getMemberships(this.framework, bot, null /*must query for members*/)
        .then((memberships) => findInvalidMemberDomains(this.framework, memberships.items))
        .then((invalidMember) => {
          if (!invalidMember) {
            try {
              // No more dissallowed memeber, reactivate
              this.framework.inactiveBots = _.reject(this.framework.inactiveBots, {'id': bot.id});
              this.framework.bots.push(bot);
              bot.start();
              this.framework.emit('spawn', bot, this.framework.id, null, membership);
              // Notify space that the bot is now allowed to interact here
              if (this.framework.unauthorizedDomainUserExitsResponse) {
                this.framework.webex.messages.create({
                  roomId: bot.room.id,
                  markdown: this.framework.unauthorizedDomainUserExitsResponse
                });
              }
              try {
                this.framework.emit('membershipRulesAction',
                  'state-change', 'spawn', bot, bot.id, null, membership);
              } catch (e) {
                console.error(`MembershipRules.isAllowedAfterMemberLeaves() error: "${e.message}" ` +
                  `while emitting a "state-change:spawn" event. This may have been ` +
                  `caused by an uncaught exception in an application handler.`);
              }
              return true;
            } catch (e) {
              throw e;
            }
          }
        })
        .catch((e) => {
          let botState = (bot.active) ? 'active' : 'inactive';
          console.error('MebershipRules.isAllowedAfterMemberLeaves: Error evaluating bot status ' +
            `a membership change: "${e.message}".  Bot may be in "${botState}" state incorrectly.`);
          return bot.active;
        });
    }
  }

  /**
   * Check if trigger action should be performed
   *
   * @function
   * @param {object} lex phrase callback object
   * @param {object} bot object
   * @param {Object} trigger object causing callback
   * @returns {bool} 
   */
  shouldCallHears(lex, bot, trigger) {
    try {
      if (!bot.active) {   // TODO is this sufficient or should I check in the deactive list?
        // Respond that the bot is no longer active because of membership rules
        if (this.framework.unauthorizedDomainStateMessageResponse) {
          this.framework.webex.messages.create({
            roomId: bot.room.id,
            markdown: this.framework.unauthorizedDomainStateMessageResponse
          });
        }
        this.framework.emit('membershipRulesAction',
          'hears-swallowed', 'hears', bot, bot.id, trigger);
        console.error(`Swallowing call to framework.hears("${trigger.phrase}") ` +
          `associated with disallowed bot in space: ${bot.room.id}`);
        return false;
      }
      return (true);
    } catch (e) {
      console.error(`MembershipRules.shouldCallHears() error: "${e.message}" ` +
        `while evaluating trigger phrase "${trigger.phrase}"`);
    }
  }

};

module.exports = (framework) => {return new MembershipRules(framework);};

/**
 * Get memberships from API unless the list was already provided
 * 
 * @function
 * @param {object} framework 
 * @param {object} bot 
 * @param {array} memberships 
 * @returns {array} 
 */
async function getMemberships(framework, bot, memberships) {
  if (memberships) {
    return when(memberships);
  } else {
    let allMemberships = null;
    return framework.webex.memberships.list({roomId: bot.room.id})
      .then((memberships) => {
        return (async function f(page) {
          if (!allMemberships) {
            allMemberships = page;
          } else {
            allMemberships.items.push(...page.items);
          }
          if (page.hasNext()) {
            // We got a paginated response and need to get another batch...
            return page.next().then(f);
          }
          return allMemberships;
        }(memberships));
      });
  }
};

/**
 * Walk membership list to see if all member domains match
 *
 * @function
 * @param {object} framework 
 * @param {array} members
 * @returns {array} 
 * @returns {string} - empty string or email of first invalid user
 */
async function findInvalidMemberDomains(framework, members) {
  if (framework.restrictedDomains) {
    for (let i = 0; i < members.length; i++) {
      const member = members[i];
      if (!isMemberAllowed(member, framework.restrictedDomains)) {
        return when(member.personEmail);
      }
    }
  }
  return when('');
};

/**
 * Check an individual memeber against the allowed domain list
 *
 * @function
 * @returns {boolean} - true if members is allowed
 */
function isMemberAllowed(member, restrictedDomainsList) {
  let domain = _.split(_.toLower(member.personEmail), '@', 2)[1];
  if ((domain === 'webex.bot') || (domain === 'sparkbot.io')) {
    return true; //skip bots
  }
  //  return (_.find(restrictedDomainsList, d => (d === domain)));
  let goodDomain = _.find(restrictedDomainsList, d => (d === domain));
  if (goodDomain) {
    return true;
  } else {
    return false;
  }
}

