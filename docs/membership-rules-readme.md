# Membership Rules

Some bots may be designed to only work with a particular set of users.   The framework's membership rules configuration options provide tools for managing some of these situations.

## Email domain restrictions

In many cases developers may build bots that are meant to be used only by employees of their company (or possibly of several companies).   Setting the framework config's  `restrictedToEmailDomains` parameter to a comma separated list of email domains instructs the framework to essentially ignore any spaces where the membership list includes users who's email addresses are not in the restricted domain list.

## Guided Mode

Sometimes, it may be desirable for the bot to be functional only when it is in spaces that have specific people in them. For example when a bot is first being developed, the developer may want the bot to only work in spaces that they are in.  They can then invite other users to these spaces to provide them with a "guided experience" of the bot. Setting the framework config's  `guideEmails` parameter to a comma separated list of webex user email addreses instructs the framework to essentially ignore any spaces where the membership list does not include a guide.

If both `restrictedToEmailDomans` and `guideEmails` are set the domain restrictions take precedence, meaning that guides MUST belong to one of the restricted domains.

## How it works

When a bot is first added to a space, the framework will examine the membership list.   If any members are not in the restricted domain list, or if no guide is present in guided mode, it will by default send a message "Sorry, my use is not allowed for all the members in this space".   (Note that this message can be customized by setting the `membershipRulesDisallowedResponse` parameter).   No framework events will be sent to the application when the room is in this state occurs and it will automatically respond to any messages to sent to the bot with a message "Sorry, because my use is not allowed for all the members in this space I am ignoring any input". (Note that this message can be customized by setting the `membershipRulesStateMessageResponse` parameter) 

On subsequent membership changes, the framework will re-examine the membership list.   If a previously unauthorized space is now populated solely by users whose domains are in the `restrictedToEmailDomains` list, or, if a guide has entered in guided mode, a framework `spawn` event will be generated, just like the one that occurs when the bot is added to a new space.  The parameters for this spawn event will include an additional `membershipRuleChange` parameter which provides detail on the membership change and the membership rule that triggered the event.  When this occurs the framework will generate a message that says "I am now allowed to interact with all the members in this space and will no longer ignore any input.". (Note that this message can be customized by setting the `membershipRulesAllowedResponse` parameter).

Conversely, if the new member has joined a previously allowed space, but the new member is not authorized, the framework will generate a `despawn` event.  The parameters for this event will include a new `membershipRuleChange` parameter which provides the new users membership object and an indication that this event was triggered by a `restrictedToEmailDomans` rule, will also be sent.

## membershipRuleChange object

While the out-of-the-box membership rules behavior is likely to be all that is needed for many use cases, the framework does generate events with all the information needed for application developers to manage their own custom handling of membership rules related events.

While it is not necessary for developers to look for and process the `membershipRuleChange` object which will be sent as a parameter to the `spawn` or `despawn` handlers when these callbacks were triggered by a membership rule, it is available for advanced membership rule handling.   The object is as follows:

| Name | Type | Description |
| --- | --- | --- |
| `membershipRule` | string | One of "restrictedToEmailDomains" or "guideEmails", depending on which rule triggered the action |
| `membershipAction` | string | One of "created" or "deleted" depending on which type of membership event triggered the action |
| `membership` | object | The membership object of the user who joined or left the space. |

In the case of a `spawn` generated when the last user who does not belong to one of the restricted domains leaves, the membershipRuleChange will look like:

```json
{
  "membershipRule": "restrictedToEmailDomains",
  "membershipAction": "deleted",
  "membership" : {...} // membership object of user who left
}
```

In the case of a `spawn` generated when a guide enters a space where the bot was previously inactive, the membershipRuleChange object will look like:

```json
{
  "membershipRule": "guideEmails",
  "membershipAction": "added",
  "membership" : {...} // membership object of guide user who joined
}
```
In the case of a `despawn` generated when a user who does not belong to one of the restricted domains joins a space with the bot, the membershipRuleChange will look like:

```json
{
  "membershipRule": "restrictedToEmailDomains",
  "membershipAction": "added",
  "membership" : {...} // membership object of user who joined
}
```

## Custom handling of membership rules events

Developers can look for the presence of the `membershipRuleChange` parameter in their `spawn` and `despawn` handlers to have their bot send a custom message to the space when these events occur.   Alternately developers may choose to simply have their bot leave group spaces once the membership rules have been violated.   

Once a space has been disallowed, the framework will stop generating any of the "normal" framework events, so handlers like `framework.hears()`, `bot.on('message')`, or `bot.on('membership')` will not be called for events related to that space.  It will generate a `membershipRulesAction` event when any of these "normal" events are "swallowed". Developers may choose to create a handler for the `membershipRulesAction` events to monitor when this occurs, but this is only necessary when the default memebership rules behavior needs to be specially customized.

Apps that wish to generate custom membership rules messages in handlers for the `spawn`, `despawn` or `membershipRulesAction` events, may disable the framework's default messages by setting the `membershipRulesDisallowedResponse`, `membershipRulesStateMessageResponse` and `membershipRulesAllowedResponse` framework configuration parameters to empty strings.

Here is a simple example of a `despawn` handler that provides a custom handling due to membership rules:

```javascript
// A despawn event is generated when a bot is removed from a space
// or if the restrictedToEmailDomains parameter is set and a dissallowed user
// is added to an existing space
// In this case our handler removes our bot from the space
framework.on('despawn', (bot, id, actorId, membershipRuleChange) => {
  if (membershipRuleChange) {
    console.log(`Got a "despawn" event due to a `+
      `membership:${membershipRuleChange.membershipAction}` +
      `event which triggered a ${membershipRuleChange.membershipRule} rule`);
    myMembership = bot.membership;

    let msg;
    if (membershipRuleChange.membershipRule === 'restrictedToEmailDomains') {
      msg = `Yikes!  I'm not allowed to be in spaces with ${membershipRuleChange.membership.displayName}` +
    } else {
      msg = `Yikes!  I'm not allowed to be in spaces without ${membershipRuleChange.membership.displayName} being here.` +      
    }
    msg += ` I'm outta here!`;
    // We can't use bot.say here since our bot object has been despawned
    // Use webex SDK instead..
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

And at least one of:
 * ALLOWED_DOMAINS - a sample restricted domain list
 * GUIDE_EMAILS - a sample list of require user's emails

The sample will only generate Webex messages if the bot/user is added to a new space with disallowed users, if the bot/user is mentioned in a space with disallowed users, or if disallowed users use the space.  Console messages will provide updates on when membership rules are taking effect.

```js
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

``` 

## Membership rules framework configuration parameters

This is the subset of the [Framework Configuration Parameters](../README.md#Framework+options) that pertain to membership rules:

| Name | Type | Description |
| --- | --- | --- |
| [restrictedToEmailDomains] | <code>string</code> | Set to a comma seperated list of email domains the bot may interact with, ie "myco.com,myco2.com".           For more details see the [Membership-Rules README](./doc/membership-rules-readme.md) |
| [guideEmails] | <code>string</code> | Set to a comma seperated list of Webex users emails who MUST be in a space in order for the bot to work, ie "user1@myco.com,user2@myco2.com".           For more details see the [Membership-Rules README](./doc/membership-rules-readme.md) |
| [membershipRulesDisallowedResponse] | <code>string</code> | Message from bot when it detects it is in a space that does not conform to the membership rules          specified by the `restrictedToEmailDomains` and/or the `guideEmails` parameters.   Default messages is         "Sorry, my use is not allowed for all the members in this space. Will ignore any new messages to me.".         No message will be sent if this is set to an empty string. |
| [membershipRulesStateMessageResponse] | <code>string</code> |  Message from bot when it is messaged in a space that does not conform to the membership rules         specified by the `restrictedToEmailDomains` and/or the `guideEmails` parameters.   Default messages is         "Sorry, because my use is not allowed for all the members in this space I am ignoring any input.".         No message will be sent if this is set to an empty string. |
| [membershipRulesAllowedResponse] | <code>string</code> | Message from bot when it detects that an the memberships of a space it is in have changed in         in order to conform with the membership rules specified by the The default messages is "I am now allowed to interact with all the members in this space and will no longer ignore any input.".         No message will be sent if this is set to an empty string. |
