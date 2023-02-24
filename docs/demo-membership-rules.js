var Framework = require('webex-node-bot-framework');

var express = require('express');
var app = express();
require('dotenv').config();

// framework options
var config = {
  token: process.env.TOKEN,
  port: 80,
  maxStartupSpaces: 50
};

// Test Membership Rules
if (process.env.ALLOWED_DOMAINS) {
  config.restrictedToEmailDomains = process.env.ALLOWED_DOMAINS;
}
if (process.env.GUIDE_EMAILS) {
  config.guideEmails = process.env.GUIDE_EMAILS;
}
if (!((process.env.ALLOWED_DOMAINS) || (process.env.GUIDE_EMAILS))) {
  console.error(`This demo requires at least one of ALLOWED_DOMAINS and/or GUIDE_EMAIL environment variables to be set.`);
  process.exit(0);
}

config.membershipRulesDisallowedResponse = "Test Message Disregard -- I am no longer allowed to interact with the members in this space.";
config.membershipRulesStateMessageResponse = "Test Message Disregard -- I am disregarding input due to my space memebership rules.";
config.membershipRulesAllowedResponse = "Test Message Disregard -- Space membership has changes and I am now allowed to interact with users in this space.";

// init framework
var framework = new Framework(config);
framework.start();

// An initialized event means your event handlers are all registered and the 
// framework has created a bot object for all the spaces your bot is in
framework.on("initialized", function () {
  console.log(`Framework initialized with ${framework.bots.length} bots. [Press CTRL-C to quit]`);
});

// A spawn event is generated when the framework finds a space with your bot in it
// You can use the bot object to send messages to that space
// The id field is the id of the framework
// If addedBy is set, it means that a user has added your bot to a new space
// If membershipRules is set it means this bot is now active in a space because
// the membership has complied to meet the requirements set in the 
// restrictedToEmailDomains or guideEmails configuration paramaters
framework.on('spawn', function (bot, id, addedBy, membershipRules) {
  if (!framework.initialized) {
    console.log(`On initialization, framework created an object for an bot that exists in a space called: ${bot.room.title}`);
  } else {
    if (membershipRules && membershipRules.membershipAction == 'deleted') {
      console.log(`Membership Rules created a spawn for space ` +
      `"${bot.room.title}" when ${membershipRules.membership.personEmail} left`);
    } else if (!addedBy) {
      console.log(`Framework created a just in time object for an existing bot ` +
      `in a space called: ${bot.room.title}, when activity occured there after initialization.`);
    } else if (membershipRules && membershipRules.membershipAction == 'added') {
      console.log(`Membership Rules created a spawn for space "${bot.room.title}" ` +
      `when ${membershipRules.membership.personEmail}, a guide specified via ` +
      'the `guideEmails` framework configuration parameter, joined.');
    } else {
      console.log('Framework spawned a bot because our user got added to a space: ' + bot.room.title);
    }
  }
});

// A despawn event is generated when a bot is removed from a space
// or if the restrictedToEmailDomains and/or guideEmails config parameters are
// set and the membership of a previously allowed space has changed in a way
// that now violates the membership rules. In this case the framework generates // a "despawn" event with the membershipRuleChange parameter
framework.on('despawn', (bot, id, actorId, membershipRuleChange) => {
  if (membershipRuleChange) {
    console.log(`Got a "despawn" event due to a `+
      `membership:${membershipRuleChange.membershipAction}` +
      `event which triggered a ${membershipRuleChange.membershipRule} rule`);
    myMembership = bot.membership;
    // We can't use bot.say here since our bot object has been despawned
    // Use webex SDK instead..
    const msg = `${membershipRuleChange.membership.personEmail} does not belong to a domain that ` +
      `I am authorized to work with.  Will ignore any further input.`;
    console.log(`Mebership-Rules despawn in space "${bot.room.title}": ${msg}`);
    // Print any additional instructions here...
  }
});


// membershipRulesAction are "log events" that tell us if membershipRules were invoked
framework.on('membershipRulesAction', (type, event, bot, id, ...args) => {
  console.log(`Framework membershipRulesAction of type:${type}, event:${event} occurred in space "${bot.room.title}".`);
  try {
    switch (type) {
      case ('state-change'):
        console.log(`Membership Rules forced a "${event}" event`);
        break;
      case ('event-swallowed'):
        if (event === 'spawn') {
          if (args.length >= 2) {
            // This will be the ID or the membership of the user who added the bot
            let actor = args[0];  
            if (typeof(actor) == 'object') {
                actor = actor.personEmail;
            }
            console.log(`Membership rules prevented a bot from being added by ${actor}`)
            // This will be the membership rules change object
            let membershipRuleChange = args[1];
            let email = membershipRuleChange.membership.personEmail;
            if (membershipRuleChange && 
                membershipRuleChange.membershipRule === "restrictedToEmailDomains") {
                console.log(`spawn swallowed. Member: ${email} is not in allowed domains list.`);
                } else {
                console.log(`spawn swallowed. Space membership is missing one of `+
                'the users specified in the `guideEmails` framework config parameter');
                }
          }
        }
        if ((event === 'memberExits') || (event === 'memberEnters')) {
          let member = args[0];
          console.log(`Ignored ${event} for ${member.personEmail} in disallowed space.`);
        }
        break;
      case ('hears-swallowed'):
        console.log(`Membership Rules swallowed a "${event}" event`);
        break;
      default:
        assert(true === false, `Got unexpected membershipsRules type: ${type}`);
        break;
    }
  } catch (e) {
    console.error(`Failed processing mebershipRulesAction event "${event}": ${e.message}`);
  }
});

framework.hears(/.*/, (bot, trigger) => {
  // This sample does not process any user input
  console.log(`framework.hears() called with trigger.text: ${trigger.text}`);
});

// start express server
var server = app.listen(config.port, function () {
  console.log('Framework listening on port %s', config.port);
});

// gracefully shutdown (ctrl-c)
process.on('SIGINT', function () {
  console.log('stoppping...');
  server.close();
  framework.stop().then(function () {
    process.exit();
  });
});
