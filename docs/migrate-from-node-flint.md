# Differences from the original flint framework

The primary reason for creating the webex-flint framework was to create a framework based on the [webex-jssdk](https://webex.github.io/webex-js-sdk) which continues to be supported as new features and functionality are added to Webex. This version of flint was designed with two themes in mind:

* Mimimize Webex API Calls.  The original flint could be quite slow as it attempted to provide bot developers rich details about the space, membership, message and message author.   This version eliminates some of that data in the interests of efficiency, (but provides convenience methods to enable bot developers to get this information if it is required)
* Leverage native Webex data types.   The original flint would copy details from the webex objects such as message and person into various flint objects.  This version simply attaches the native Webex objects.   This increases flint's efficiency and makes it future proof as new attributes are added to the various webex DTOs

## Core Object Changes
For developer's who are porting existing flint based bots to this framework the following tables provide an overview of the changes to the key objects (note that all dates are strings, not moment objects as they were in node-flint):

## Flint
**Kind**: global class  
**Properties**

| Orig Flint Name | New Flint Name | Description                    | Reason For Change                    |
| --------------- | -------------- | ------------------------------ | ------------------------------------ |
| id              | id             | Flint UUID                     |                                      |
| active          | active         | Flint active state             |                                      |
| intialized      | initialized    | Flint fully initialized        |                                      |
| isBotAccount    | isBotAccount   | Is Flint using a bot account?  |                                      |
| isUserAccount   | isUserAccount  | Is Flint using a user account? |                                      |
| person          | person         | Flint person object            | Now is unchanged webex person object |
| email           | email          | Flint email                    | No longer set to all lower case      |
| spark           | webex          | Flint SDK                      | now based on webex jsssdk            |

## Bot
**Kind**: global class  
**Properties**

| Orig Bot Name | New Bot Name | Description                                  | Reason For Change                                            |
| ------------- | ------------ | -------------------------------------------- | -------------------------------------------------------------|
| id            | id           | Bot UUID                                     |                                                              |
| active        | active       | Bot active state                             |                                                              |
| person        | --           | Bot Person Object                            | Availabile in flint object                                   |
| email         | --           | Bot email                                    | Availabile in flint object                                   | 
| team          | --           | Bot team object                              | available via bot.getTeam() convenience function TODO        |
| room          | room         | Bot room object                              | Now is standard webex room object                            |
| membership    | membership   | Bot membership object                        | Standard Webex Teams membership object for bot               |
| memberships   | memberships  | All memberships for bot's space              | available via bot.getMemberships() convenience function TODO |
| isLocked      | isLocked     | If bot's space is locked                     |                                                              |
| isModerator   | isModerator  | If bot is a moderator                        |                                                              |
| isMonitor     | --           | If bot is a moderator                        |  isMonitor is deprecated                                     |
| isGroup       | isGroup      | If bot is in Group Room                      |                                                              |
| isDirect      | isDirect     | If bot is in 1:1/Direct Room                 |                                                              |
| isDirectTo    | isDirectTo   | Recipient Email if bot is in 1:1/Direct Room |                                                              |
| isTeam        | --           | If bot is in Team Room                       | inspect for existences of bot.room.teamId                    |
| lastActivity  |              | Last bot activity                            | string (not moment object)                                   |

## Trigger : <code>object</code>
Trigger Object

**Kind**: global namespace  
**Properties**

| Orig Trigger Name | New Trigger Name    | Description                                     | Reason For Change                       |
| ----------------- | ------------------- | ----------------------------------------------- | --------------------------------------- |
| --                | type                | Trigger type ['message' \| 'attachmentAction']  | Trigger may now be caused by card attachment action|
| id                | id                  | Message or AttachmentActionID                   | Trigger may now be caused by card attachment action|
| phrase            | phrase              | Matched lexicon phrase                          |                                         |
| args              | args                | Filtered array of words in message text.        |                                         |
| message           | message             | Webex Teams Message Object                      | Now unmodified webex message object     |
| text              | --                  | Message Text (or false if no text)              | inspect trigger.message.text            |
| raw               | --                  | Unprocessed Message Text if any                 | inspect trigger.message.text            |
| html              | --                  | Message HTML if any                             | inspect for trigger.message.html            |
| markdown          | --                  | Message markdown if any                         | inspect for trigger.message.markdown        |
| mentionedPeople   | --                  | Mentioned People Array if any                   | inspect for trigger.message.mentionedPeople |
| files             | --                  | Message Files (or false if no files in trigger) | inspect for trigger.message.mentionedPeople |
| created           | --                  | Message Created date                            | inspect trigger.message.created         |
|                   | attachmentAction    | Webex Teams attachmentAction Object             | see [Buttons and Cards Guide](https://developer.webex.com/docs/api/guides/cards/overview)|
| roomId            | --                  | Room ID                                         | inspect bot.room object                 |
| --                | room                | Webex Rooms Object for bot's space              | Webex Rooms Object                      |
| roomTitle         | --                  | Room Title                                      | inspect bot.room.title                |
| roomType          | --                  | Room Type (group or direct)                     | inspect bot.room.type                 |
| roomIsLocked      | --                  | Room Locked/Moderated status                    | inspect bot.room.isLocked                 |
|                   | person              | Webex Person Object                             | Added for forward extensibility         |
| personId          | personId            | Person ID                                       | Still at top level for convenience      |
| personAvatar      | --                  | Person Avatar URL                               | insepct trigger.person.avatar           |
| personDisplayName | --                  | Person Display Name                             | insepct trigger.person.displayName      |
| personEmail       | --                  | Person Email                                    | insepct trigger.person[0]               |
| personUsername    | --                  | Person Username                                 | derive from trigger.person[0]           |
| personDomain      | --                  | Person Domain name                              | derive from trigger.person[0]           |
| personMembership  |  --                 | Person Membership object for person             | use bot.getTriggerMembership()          |

## Event changes
Node-flint generated a set of `person` events based on membership changes.  For each membership, the framework would fetch the person object associated with that memebership pass it to the event handler.  Since many bots don't even register these handers this seems expensive.  Information like the personEmail and personDisplayName are also already included in the membership DTO.  Finally, bots that truly wish to get the person object can always query it directly via the `flint.getPerson(membership.personId)` function.

 Our framework instead generates a set of related `member` named events and passes the membership associated with the change to event handler.   This makes the framework snappier and the events seem more aptly named (since the membership change may be associated with another bot as well as a person).

Witht this in mind the following node-flint events are now renamed as follows:
* `personEnters` -> `memberAdded`
* `personExits` -> `memberRemoved`
* `personAddedAsModerator`  -> `memberAddedAsModerator`
* `personRemovedAsModerator` -> `memberRemovedAsModerator`

The payload passed to the event handlers will be a bot, the membership object, and the bot or flint id.  Therefore an app that implemented something like:

```javascript
flint.on('personEnters', function (bot, person) {
  bot.sy(`Welcome ${person.displayName}!`);
});
```

Would need to be modified to handle the `memberAdded` event with a memebership object instead, ie:

```javascript
flint.on('memberAdded', function (bot, membership) {
  bot.sy(`Welcome ${membership.personDisplayName}!`);
});
```

For every message node-flint generates a set of messages which may include
* `messageCreated`
* `mentioned`
* `message`
* `files`

Our new framework will ONLY generate the `messageCreated` event in instances when the message was sent by the bot.  In almost all cases bots and applications don't want to respond to their own messages, however those that choose to do so should build the logic for processing them in a `flint.on("messageCreated", message, flintId)` handler since the other events are no longer sent.   If any other space member posts a message the `message` event will always fire and the `mentioned` event will fire if the message mentioned the bot, and a `files` event will fire if the message includes file attachments.

* bot.memberships
* trigger
* Messages from the bot are ignored earlier in the process.   Even if the bot mentions itself in a message this message will be ignored.

