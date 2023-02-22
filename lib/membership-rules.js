'use strict';

const when = require('when');
const _ = require('lodash');
var validator = require('./validator');

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
        this.framework.debug(`Swallowing event: "${event}" associated with ` +
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
          'event-swallowed', event, bot, bot.id, ...args);
        this.framework.debug(`Swallowing event: "${event}" associated with ` +
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
    let members;
    return getMemberships(this.framework, bot, memberships)
      .then((memberships) => {
        members = memberships.items;
        return findInvalidMemberDomains(this.framework, members);
      }).then((invalidMember) => {
        if (invalidMember) {
          let membershipRuleChange = {
            membershipRule: 'restrictedToEmailDomains',
            membershipAction: 'created',
            membership: invalidMember
          };
          swallowSpawn(this.framework, bot, actorId, membershipRuleChange);
          return when(false);
        } else {
          if (guideRequirementsAreMet(this.framework, members)) {
            return when(true);
          } else {
            let membershipRuleChange = {
              membershipRule: 'guideEmails',
              membershipAction: 'created',
              membership: members.find(m => m.personId === bot.person.id)
            };
            swallowSpawn(this.framework, bot, actorId, membershipRuleChange);
            return when(false);
          }
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
   * @param {string} actorId id of user who added member to space
   * @param {Object} membership of new user in bot's room
   * @returns {void} 
   */
  isNewMemberAllowed(bot, actorId, membership) {
    if (!bot.active) {
      // Already in de-active state, see if a guide entered
      if ((this.framework.guideEmails) &&
        (-1 != this.framework.guideEmails.indexOf(_.toLower(membership.personEmail)))) {
        return getMemberships(this.framework, bot, null /*force memberships lookup*/)
          .then((memberships) => {
            return findInvalidMemberDomains(this.framework, memberships.items);
          }).then((invalidMember) => {
            if (invalidMember) {  
              return when(false);
            }                  
            // Guide added, reactivate
            let membershipRuleChange = {
              membershipRule: 'guideEmails',
              membershipAction: 'created',
              membership
            };
            generateSpawn(this.framework, bot, actorId, membershipRuleChange);
            return when(true);
          }).catch(e => {
            console.error(`MembershipRules.isNewMemberAllowed() error: ${e.message}` +
              `Unable to tell if new members in previously deactive space "${bot.room.title}" ` +
              `should enale the space.  Erring on keeping it disabled`);
            return when(false);
          });
      }
      return false;
    }
    if (!this.isMemberAllowed(membership, this.framework.restrictedDomains)) {
      try {
        // New member is dissallowed -- "despawn" and move to inactive list
        let membershipRuleChange = {
          membershipRule: 'restrictedToEmailDomains',
          membershipAction: 'created',
          membership
        };
        generateDespawn(this.framework, bot, actorId, membershipRuleChange);
        return false;
      } catch (e) {
        console.error('MebershipRules.isNewMemberAllowed: Failed to remove bot after ' +
          'discovering a new disallowed member.  Bot is still active.');
        return true;
      }

    }
    return true;
  }

  /**
   * Check if a potential direct message recipient is allowed
   *
   * @function
   * @param {String} person - Email or personId of person to send Direct Message.
   * @returns {Promise.<Boolean>}
   */
  isNewPersonAllowed(person) {
    return getPersonEmail(person, this.framework.webex)
      .then((email) => {
        let domain = _.split(_.toLower(email), '@', 2)[1];
        return when(isDomainAllowed(domain, this.framework.restrictedDomains));
      })
      .catch((e) => {
        console.error(`Unable to determine membership rule for person "${person}": ` +
          `${e.message}.  Erring on the side of allowing the new 1-1 space.`);
        return when(true);
      });
  };

  /**
   * Check if an exiting member changes the activation state of the bot
   *
   * @function
   * @param {object} bot object
   * @param {object} actorId id of user who removed member
   * @param {Object} membership of bot in room
   * @returns {Promise.<Boolean>} -- bot's current active state
   */
  isAllowedAfterMemberLeaves(bot, actorId, membership) {
    if (bot.active) {
      // Already in active state, see if a guide left
      if ((this.framework.guideEmails) &&
        (-1 != this.framework.guideEmails.indexOf(membership.personEmail))) {
        // Guide left, check if there are any others
        return getMemberships(this.framework, bot, null/*must query for members*/)
          .then((memberships) => {
            if (guideRequirementsAreMet(this.framework, memberships.items)) {
              return when(true);
            } else {
              let membershipRuleChange = {
                membershipRule: 'guideEmails',
                membershipAction: 'deleted',
                membership
              };
              generateDespawn(this.framework, bot, actorId, membershipRuleChange);
              return when(false);
            }
          }).catch(e => {
            console.error(`Unable to determine if user who left space was the last ' +
          'remaining guide: "${e.message}".  Erring on the side of keeping bot active.`);
            return when(true);
          });
      }
      return when(true);
    }

    if (!this.isMemberAllowed(membership, this.framework.restrictedDomains)) {
      // A disallowed member is leaving, check the rest of the members
      let members;
      return getMemberships(this.framework, bot, null /*must query for members*/)
        .then((memberships) => {
          members = memberships.items;
          return findInvalidMemberDomains(this.framework, members);
        }).then((invalidMember) => {
          if (!invalidMember) {
            if (!guideRequirementsAreMet(this.framework, members)) {
              return when(false);
            }
            try {
              // No more dissallowed memeber, reactivate
              let membershipRuleChange = {
                membershipRule: 'restrictedToEmailDomains',
                membershipAction: 'deleted',
                membership
              };
              generateSpawn(this.framework, bot, actorId, membershipRuleChange);
              return when(true);
            } catch (e) {
              console.error(`MembershipRules.isAllowedAfterMemberLeaves() error: "${e.message}" ` +
              `while updating an inactive bot to the active state. This may have been ` +
              `caused by an uncaught exception in an application's "spawn" or "membershipRulesAction" event handler.`);
              return when(true);
            }
          }
        })
        .catch((e) => {
          if ((e.statusCode === 404) && (e.message.startsWith('Could not find a room with provided ID.'))) {
            console.warn('MebershipRules.isAllowedAfterMemberLeaves: failed lookup of space membership info. ' +
              'This may occur if the bot is removed immediately after another user. ' +
              'In this case this method is inconsequential, and this warning can be ignored.');
          } else {
            let botState = (bot.active) ? 'active' : 'inactive';
            console.error('MebershipRules.isAllowedAfterMemberLeaves: Error evaluating bot status ' +
              `a membership change: "${e.message}".  Bot may be in "${botState}" state incorrectly.`);
          }
          return when(bot.active);
        });
    } else {
      return when(false);
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
        if (this.framework.membershipRulesStateMessageResponse) {
          this.framework.webex.messages.create({
            roomId: bot.room.id,
            markdown: this.framework.membershipRulesStateMessageResponse
          });
        }
        this.framework.emit('membershipRulesAction',
          'hears-swallowed', 'hears', bot, bot.id, trigger);
        this.framework.debug(`Swallowing call to framework.hears("${trigger.phrase}") ` +
          `associated with disallowed bot in space: ${bot.room.id}`);
        return false;
      }
      return (true);
    } catch (e) {
      console.error(`MembershipRules.shouldCallHears() error: "${e.message}" ` +
        `while evaluating trigger phrase "${trigger.phrase}"` +
        'Error on the side of calling registered handler.');
      return(true);
    }
  }

  /**
   * Check an individual memeber against the allowed domain list
   *
   * @function
   * @returns {boolean} - true if members is allowed
   */
  isMemberAllowed(member, restrictedDomainsList) {
    if (!restrictedDomainsList) {
      return true;
    }
    let domain = _.split(_.toLower(member.personEmail), '@', 2)[1];
    if ((domain === 'webex.bot') || (domain === 'sparkbot.io')) {
      return true; //skip bots
    }
    return isDomainAllowed(domain, restrictedDomainsList);
  }



};

module.exports = (framework) => {return new MembershipRules(framework);};

/**
 * Process a spawn event that needs to be swallowed
 *
 * @function
 * @param {object} framework object
 * @param {object} bot object
 * @param {Object} membershipRuleChange membership rule that describes the reason for failed spawn
 * @param {String} actorId actorId associated with a membership:created event if available
 * @returns {void} 
 */
function swallowSpawn(framework, bot, actorId, membershipRuleChange) {
  // New bot goes straight to the inactive array
  framework.inactiveBots.push(bot);
  //Send message to space but only if actorId meaning this is a NEW spawn
  if ((actorId) && (framework.membershipRulesDisallowedResponse)) {
    // Notify space that the bot is not allowed to interact here
    framework.webex.messages.create({
      roomId: bot.room.id,
      markdown: framework.membershipRulesDisallowedResponse
    });
  }
  framework.emit('membershipRulesAction',
    'event-swallowed', 'spawn', bot, bot.id, actorId, membershipRuleChange);
}

/**
 * Generate a spawn event caused by a memebership rules related change
 *
 * @function
 * @param {object} framework object
 * @param {object} bot object
 * @param {Object} membershipRuleChange membership rule that describes the reason for failed spawn
 * @param {String} actorId actorId associated with a membership:created event if available
 * @returns {void} 
 */
function generateSpawn(framework, bot, actorId, membershipRuleChange) {
  framework.inactiveBots = _.reject(framework.inactiveBots, {'id': bot.id});
  framework.bots.push(bot);
  bot.start();
  framework.emit('spawn', bot, framework.id, actorId, membershipRuleChange);
  // Notify space that the bot is now allowed to interact here
  if (framework.membershipRulesAllowedResponse) {
    framework.webex.messages.create({
      roomId: bot.room.id,
      markdown: framework.membershipRulesAllowedResponse
    });
  }
  framework.emit('membershipRulesAction', 'state-change',
    'spawn', bot, bot.id, actorId, membershipRuleChange);
}

/**
 * Generate a despawn event caused by a memebership rules related change
 *
 * @function
 * @param {object} framework object
 * @param {object} bot object
 * @param {Object} membershipRuleChange membership rule that describes the reason for failed spawn
 * @param {String} actorId actorId associated with a membership:created event if available
 * @returns {void} 
 */
function generateDespawn(framework, bot, actorId, membershipRuleChange) {
  framework.bots = _.reject(framework.bots, {'id': bot.id});
  framework.inactiveBots.push(bot);
  bot.stop();
  framework.emit('despawn', bot, framework.id, null, membershipRuleChange);
  // Notify space that the bot is no longer allowed to interact here
  if (framework.membershipRulesDisallowedResponse) {
    framework.webex.messages.create({
      roomId: bot.room.id,
      markdown: framework.membershipRulesDisallowedResponse
    });
  }
  try {
    framework.emit('membershipRulesAction',
      'state-change', 'despawn', bot, bot.id, membershipRuleChange);
  } catch (e) {
    console.error(`MembershipRules.generateDespawn() error: "${e.message}" ` +
      `while emitting a "state-change:despawn" event. This may have been ` +
      `caused by an uncaught exception in an application handler.`);
  }
}

/**
 * Check if a newly spawned bot's space meets guide mode rules
 *
 * @function
 * @param {object} framework object
 * @param {Object} members members in the space the bot was added to
 * @returns {Boolean} true if bot is allowed, false if not 
 */
function guideRequirementsAreMet(framework, members) {
  if ((framework.guideEmails) && (members.length)) {
    let guides = members.filter(m => {
      return (-1 != framework.guideEmails.indexOf(_.toLower(m.personEmail)));
    });
    if (!guides.length) {
      return false;
    }
  }
  return true;
}

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
 * Returns the email when input could be email or personId
 *
 * @function
 * @param {String} person - Email or personId of person to send Direct Message.
 * @param {Object} webex - SDK object
 * @returns {Promise.<String>}
 */
function getPersonEmail(person, webex) {
  if (validator.isEmail(person)) {
    return when(person);
  } else {
    return webex.people.get(person)
      .then((p) => p.emails[0]);
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
      if (!framework.membershipRules.isMemberAllowed(member, framework.restrictedDomains)) {
        return when(member);
      }
    }
  }
  return when(null);
};

/**
 * Check an individual domain against the allowed domain list
 *
 * @function
 * @returns {boolean} - true if domain is allowed
 */
function isDomainAllowed(domain, restrictedDomainsList) {
  let goodDomain = _.find(restrictedDomainsList, d => (d === domain));
  if (goodDomain) {
    return true;
  } else {
    return false;
  }
};