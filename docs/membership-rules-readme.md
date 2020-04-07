# Membership Rules

Some bots may be designed to only work with a particular set of users.   The framework's membership rules configuration options provide some tools for managing some of these situations.

## Email domain restrictions

In many cases developers may build bots that are meant to be used only by employees of their company (or possibly of several companies).   Setting the framework config's  `restrictToEmailDomains` parameter to a comma separated list of email domains instructs the framework to essentially ignore any spaces where the membership list includes users who's email addresses are not in the restricted domain list.

When a bot is first added to a space, the framework will examine the membership list.   If any members are not in the restricted domain list it will by default send a message "Sorry, my use is not allowed for all the members in this space".   (Note that this message can be customized by setting the `unauthorizedDomainUserEnters` parameter).   No framework events will be sent to the application when the room is in this state occurs and it will automatically respond to any messages to the by with a message "Sorry, because my use is not allowed for all the members in this space I am ignoring any input". (Note that this message can be customized by setting the `unauthorizedDomainStateMessageResponse` parameter) 

On subsequent membership changes, the framework will re-examine the membership list.   If a previously unauthorized space is now populated solely by users whose domains are in the `restrictedToEmailDomains` list, a "spawn" event will be generated.  The parameters for this spawn event will include a null `actorId`, and an additional `disallowedMember` parameter with the details of the user who just left.  When this occurs the framework will generate a message that says "I am now allowed to interact with all the members in this space and will no longer ignore any input.". (Note that this message can be customized by setting the `unauthorizedDomainUserExitsResponse` parameter).

Once a space has been disallowed the framework will stop generating any events related to that space.  It will generate a "membershipRulesEvent" event when this occurs so developers may choose to create a handler for the framework's log events to monitor when this occurs.   This is described in more detail after the first example.

Conversely, if the new member has joined a previously allowed space, but the new member is not authorized, the framework will generate a "despawn" event.  THe parameters for this event will include the `actorId` set to the ID of the user who added the new user and a new `disallowedMember` parameter, which is the membership of the dissalowed user, will also be sent.

Developers can look for the presence of the `disallowedMember` parameters in their spawn and despawn handlers to have their bot send a custom message to the space when these events occur, ie:

```js
// A spawn event is generated when the framework finds a space with your bot in it
// When the restrictedToEmailDomains parameter is set, the framework does not spawn bots with dissallowed members
// When a previously dissalowed space's membership changes so that only allowed memebers remain
// the framework generates a "spawn" event with the newlyAllowed parameter set to true 
framework.on('spawn', (bot, id, addedBy, newlyAllowed) => {
  if (!addedBy) {
    if (newlyAllowed) {
      bot.say('This space is now populated only with authorized users, and my services are now available');
      // Print any additional instructions here...
    } else {
      // don't say anything here or your bot's spaces will get 
      // spammed every time your server is restarted
      framework.debug(`Framework created an object for an existing bot in a space called: ${bot.room.title}`);
    }
  } else {
    // addedBy is the ID of the user who just added our bot to a new space, 
    // Say hello, and tell users what you do!
    bot.say('Hi there, you can say hello to me.  Don\'t forget you need to mention me in a group space!');
  }
});

// A despawn event is generated when a bot is removed from a space
// or if the restrictedToEmailDomains parameter is set and a dissallowed users is added to an existing space
// In this case the framework generates a "despawn" event with the newlyDisllowed parameter set to true 
framework.on('despawn', (bot, id, actorId, disallowedMember) => {
  if (disallowedMember) {
    // We can't use bot.say here since our bot object has been despawned
    // Use webex SDK instead..
    const msg = `${disallowedMember.displayName} does not belong to a domain that ` +
      `I am authorized to work with.  Will ignore any further input.`;
    bot.framework.webex.messages.create({
      roomId: bot.room.id,
      markdown: msg
    });
    // Print any additional instructions here...
  }
});

// membershipRulesAction are "log events" that tell us if membershipRules were invoked
framework.on('membershipRulesAction', (type, event, bot, id, ...args) => {
  framework.debug(`Framework membershipRulesAction of type ${type} occurred in space "${bot.room.id}".`);
  // TODO -- could add some type and event validation
  switch (type) {
    case ('state-change'):
      framework.debug(`Membership Rules forced a "${event}" event`);
      break;
    case ('event-swallowed'):
      framework.debug(`Membership Rules swallowed a "${event}" event`);
      break;
    case ('hears-swallowed'):
      framework.debug(`Membership Rules swallowed a "${event}" event`);
      break;
    default:
      assert(true === false, `Got unexpected membershipsRules type: ${type}`);
      break;
  }
});
```