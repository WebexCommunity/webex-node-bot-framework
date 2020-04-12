var Framework = require('../lib/framework');

var express = require('express');
var app = express();
require('dotenv').config();

// framework options
var config = {
  token: process.env.VALID_USER_API_TOKEN,
  port: 80,
  maxStartupSpaces: 50
};

// Test Membership Rules
config.restrictedToEmailDomains = process.env.ALLOWED_DOMAINS;
config.unauthorizedDomainUserEntersResponse = "Test Message Disregard -- An unauthorized user has entered the room";
config.unauthorizedDomainStateMessageResponse = "Test Message Disregard -- I am disregarding input when unauthrized users are in the room";
config.unauthorizedDomainUserExitsResponse = "Test Message Disregard -- All unauthorized users have exited the room";

// init framework
var framework = new Framework(config);
framework.start();

// An initialized event means your webhooks are all registered and the 
// framework has created a bot object for all the spaces your bot is in
framework.on("initialized", function () {
  console.log(`Framework initialized with ${framework.bots.length} bots. [Press CTRL-C to quit]`);
});

// A spawn event is generated when the framework finds a space with your bot in it
// You can use the bot object to send messages to that space
// The id field is the id of the framework
// If addedBy is set, it means that a user has added your bot to a new space
// Otherwise, this bot was in the space before this server instance started
framework.on('spawn', function (bot, id, addedBy, disallowedMember) {
  if (!framework.initialized) {
    // console.log(`Framework created an object for an existing bot in a space called: ${bot.room.title}`);
  } else {
    if (disallowedMember) {
      console.log(`Membership Rules created a spawn for space "${bot.room.title}" when ${disallowedMember.personEmail} left`);
    } else if (!addedBy) {
      console.log(`Framework created a just in time object for an existing bot in a space called: ${bot.room.title}`);
    } else {
      console.log('Framework spawned a bot because our user got added to a space: ' + bot.room.title);
    }
  }
});

// A despawn event is generated when a bot is removed from a space
// or if the restrictedToEmailDomains parameter is set and a dissallowed users is added to an existing space
// In this case the framework generates a "despawn" event with the newlyDisllowed parameter set to true 
framework.on('despawn', (bot, id, actorId, disallowedMember) => {
  if (disallowedMember) {
    // We can't use bot.say here since our bot object has been despawned
    // Use webex SDK instead..
    const msg = `${disallowedMember.personEmail} does not belong to a domain that ` +
      `I am authorized to work with.  Will ignore any further input.`;
    // bot.framework.webex.messages.create({
    //   roomId: bot.room.id,
    //   markdown: msg
    // });
    console.log(`Mebership-Rules despawn in space "${bot.room.title}": ${msg}`);
    // Print any additional instructions here...
  }
});


// membershipRulesAction are "log events" that tell us if membershipRules were invoked
framework.on('membershipRulesAction', (type, event, bot, id, ...args) => {
  console.log(`Framework membershipRulesAction of type:${type}, event:${event} occurred in space "${bot.room.title}".`);
  // TODO -- could add some type and event validation
  try {
    switch (type) {
      case ('state-change'):
        console.log(`Membership Rules forced a "${event}" event`);
        break;
      case ('event-swallowed'):
        if (event === 'spawn') {
          let actorId = args[0];
          let disallowedMember = args[1];
          let disallowedEmail = disallowedMember.personEmail;
          if (!actorId) {
            if (framework.initialized) {
              console.log(`Late spawn swallowed. Dissallowed member: ${disallowedEmail}`);
            } else {
              console.log(`Startup spawn swallowed. Dissallowed member: ${disallowedEmail}`);
            }
          } else {
            console.log(`Membership rules prevented adding bot to space. Dissallowed member: ${disallowedEmail}`);
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
