# Membership Rules

Some bots may be designed to only work with a particular set of users.   The framework's membership rules configuration options provide some tools for managing some of these situations.

## Email domain restrictions

In many cases developers may build bots that are meant to be used only by employees of their company (or possibly of several companies).   Setting the framework config's  `restrictToEmailDomains` parameter to a comma separated list of email domains instructs the framework to essentially ignore any spaces where the membership list includes users who's email addresses are not in the restricted domain list.

When a bot is first added to a space, the framework will examine the membership list.   If any members are not in the restricted domain list it will by default send a message "Sorry, my use is not allowed for all the members in this space".   (Note that this message can be customized by setting the `unauthorizedDomainUserEnters` parameter).   No framework events will be sent to the application when the room is in this state occurs and it will automatically respond to any messages to the bot with a message "Sorry, because my use is not allowed for all the members in this space I am ignoring any input". (Note that this message can be customized by setting the `unauthorizedDomainStateMessageResponse` parameter) 

On subsequent membership changes, the framework will re-examine the membership list.   If a previously unauthorized space is now populated solely by users whose domains are in the `restrictedToEmailDomains` list, a "spawn" event will be generated.  The parameters for this spawn event will include a null `actorId`, and an additional `disallowedMember` parameter with the details of the user who just left.  When this occurs the framework will generate a message that says "I am now allowed to interact with all the members in this space and will no longer ignore any input.". (Note that this message can be customized by setting the `unauthorizedDomainUserExitsResponse` parameter).

Once a space has been disallowed the framework will stop generating any events related to that space.  It will generate a `membershipRulesAction` event when this occurs. Developers may choose to create a handler for the `membershipRulesAction` events to monitor when this occurs, but this is not necessary.  

Conversely, if the new member has joined a previously allowed space, but the new member is not authorized, the framework will generate a "despawn" event.  THe parameters for this event will include the `actorId` set to the ID of the user who added the new user and a new `disallowedMember` parameter, which is the membership of the dissalowed user, will also be sent.

Developers can look for the presence of the `disallowedMember` parameters in their `spawn` and `despawn` handlers to have their bot send a custom message to the space when these events occur.   Alternately developers may choose to simply have their bot leave spaces once a dissalowed member enters.   This is also possible by customizing the despawn logic, as follows

```javascript
// A despawn event is generated when a bot is removed from a space
// or if the restrictedToEmailDomains parameter is set and a dissallowed users is added to an existing space
// In this case our handler removes our bot from the space
framework.on('despawn', (bot, id, actorId, disallowedMember) => {
  if (disallowedMember) {
    myMembership = bot.membership;
    // We can't use bot.say here since our bot object has been despawned
    // Use webex SDK instead..
    const msg = `Yikes!  I'm not allowed to be in spaces with ${disallowedMember.displayName}` +
      `I'm outta here!`;
    bot.framework.webex.messages.create({
      roomId: bot.room.id,
      markdown: msg
    }).finally(() => {
      bot.framework.webex.memberships.remove(myMembership);
    });
  }
});
```

The following provides a complete app which demonstrates how `spawn`, `despawn` and `membershipRulesAction` handlers might behave when membership rules are set.  To run [./demo-membership-rules.js](./demo-membership-rules.js), set the following environment variables:
 * TOKEN -- to a valid user or bot token
 * ALLOWED_DOMAINS - a sample restricted domain list

The sample will only generate Webex messages if the bot/user is added to a new space with disallowed users, if the bot/user is mentioned in a space with disallowed users, or if disallowed users use the space.  Console messages will provide updates on when membership rules are taking effect.

```js
var Framework = require('framework');

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

// An initialized event means your event handlers are all registered and the 
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

``` 