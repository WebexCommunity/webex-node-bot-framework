# Differences from the original flint framework

The primary reason for creating the webex-node-bot-framework was to create a framework based on the [webex-jssdk](https://webex.github.io/webex-js-sdk) which continues to be supported as new features and functionality are added to Webex. This version of the project was designed with two themes in mind:

* **Mimimize Webex API Calls**  The original flint could be quite slow as it attempted to provide bot developers rich details about the space, membership, message and message author.   This version eliminates some of that data in the interests of efficiency, but provides convenience methods to enable bot developers to get this information if it is required.
* **Leverage native Webex data types**   The original flint would copy details from the Webex objects, such as message and person, into various flint objects.  This version simply attaches the native Webex objects.   This increases the framework's efficiency and makes it future proof as new attributes are added to the various Webex DTOs.

It's also worth noting that the `flint` object from node-flint has been renamed simply to `framework`.  For developers porting to from node-flint, it may be simpler to modify code that looks like this:

```javascript
var Flint = require('node-flint');
var webhook = require('node-flint/webhook');
// flint options
var config = {
  webhookUrl: 'http://myserver.com/framework',
  token: 'Tm90aGluZyB0byBzZWUgaGVyZS4uLiBNb3ZlIGFsb25nLi4u',
  port: 80
};
var flint = new Flint(config);
```

To look something like this:

```javascript
var Framework = require('webex-node-bot-framework');
var webhook = require('webex-node-bot-framework/webhook');
// framework options
var config = {
  webhookUrl: 'http://myserver.com/framework',
  token: 'Tm90aGluZyB0byBzZWUgaGVyZS4uLiBNb3ZlIGFsb25nLi4u',
  port: 80
};
var flint = new Framework(config);
```
Naming the new Framework object `flint`, allows existing `flint.hears()` and `flint.on()` functions to behave as they currently do.  

## Missing functionality
Not all of the functionality in flint has been migrated to this new framework.  Apps that rely on any of the following may wish to postpone their migration (or look to implement these features some other way):

* Flint exposed many functions that were primarily thin wrappers around functionality that is natively exposed via the Webex SDK.  Since we wish to promote the understanding and use of the SDK these have mostly been removed. The following flint functions are NOT exposed by our framework:
  * parseFile(message) -- to access files simply GET the URL(s) in the attachment field of a message.
  * getRooms() -- call framework.getWebexSDK().rooms.list()
  * getRoom(roomId) -- call framework.getWebexSDK().rooms.get(roomId)
  * getTeams() -- call framework.getWebexSDK().teams.list()
  * getTeam(teamId) -- call framework.getWebexSDK().teams.get(teamId)
  * getTeamRooms(teamId) -- call framework.getWebexSDK().rooms.get({teamId: teamId})
  * getPerson(personId) -- call framework.getWebexSDK().people.get(personId);
  * getMessage(messageId) -- call framework.getWebexSDK().messages.get(messageId)
  * getFiles(messageId) -- call framework.getWebexSDK().messages.get(messageId) to get message and then to access files simply GET the URL(s) in the attachment field of a message.
  * getMembership(membershipId) -- call framework.getWebexSDK().memberships.get(membershipId)
  * getMemberships(roomId) -- call framework.getWebexSDK().memberships.list({ roomId: roomId })
  * getTeamMembership(teamMembershipId) -- call framework.getWebexSDK().teamMembership.get(teamMembershipId)
  * getTeamMemberships(teamId) -- call framework.getWebexSDK().teamMemberships.list({ teamId: teamId })
  * getWebhook(webhookId) -- call framework.getWebexSDK().webhooks.get(webhookId)
  * getWebhooks() -- call framework.getWebexSDK().webhooks.list()
  * getAttachmentAction(attachmentActionId) -- call framework.getWebexSDK().attachmentActions.get(attachmentActionId);

* Bot exposed some functions for uploading file streams, that that were implemented by calling the Webex APIs directly.  Some of these have been removed or simplified in favor of leveraging the native Webex SDK functionality to support this.
  * say() -- this function has not changed and provides an optional mechanism for providing URL based file attachments
  * sayWithLocalFiles - new function adds ability to send a message that includes local files
  * upload(file) - removed -- call sayWithLocalFile(null, filename) instead
  * uploadStream(filename, stream) -- This remains primarily to demonstrate how a developer needs to create a stream from a filename in order to call the webex.messages.create() function.  The filename parameter is removed and discovered from the stream.
  * messageStreamRoom() -- removed -- call bot.webex.messages.create() with a message object that includes the roomId, the (optional) markdown or text message, and populate the files field with an array containing a single filestream, as described in the documentation for uploadStream
  * getMessages(count) -- removed -- call bot.webex.messages.list({roomId: bot.room.id, max: count})  -- note that this only works when the bot was created with a user token.


* Retry logic for pagination and rate limiting.  The philosophy behind the framework is to encourage developers to leverage the Webex SDK (exposed as an element in the framework and bot objects), natively when needed.   When appropriate applications should inspect the response headers for pagination and rate limiting (HTTP 429 Response Code) as needed.  `framework.start()` will fail when the framework was passed a config object that includes any of the following options:
   * @property {number} [maxPageItems=50] - Max results that the paginator uses.
   * @property {number} [maxConcurrent=3] - Max concurrent sessions to the Webex API
   * @property {number} [minTime=600] - Min time between consecutive request starts.
   * @property {number} [requeueMinTime=minTime*10] - Min time between consecutive request starts of requests that have been re-queued.
   * @property {number} [requeueMaxRetry=3] - Max number of attempts to make for failed request.
   * @property {array} [requeueCodes=[429,500,503]] - Array of http result codes that should be retried.
   * @property {number} [queueSize=10000] - Size of the buffer that holds outbound requests.
   * @property {number} [requeueSize=10000] - Size of the buffer that holds outbound re-queue requests.

* Storage. 
  * There has been no testing of the redis version of the `bot.store()`, `bot.recall()`, `bot.forget()` functions.   While they may work, it is recommended that developers validate this before publishing a bot that leverages redis.  
  * A new framework config option `initBotStorageData` is now available.   Developers can set this to create an initial set of key/value pairs that a bot object will have when it is first spawned.
  * A new mongo storage adaptor is available.  See the Storage Adaptor Changes for more details on how Storage Adaptors now work.


## Spawn events
Flint would attempt to find all spaces that the bot is part of before completing its initialization.   This could take time and provide inaccurate results, especially for bots that are in over a thousand spaces.  The framework works more like the Webex Teams clients.   By default, it tries to find the 100 most recently active spaces at startup (this can be configured using the config option `maxStartupSpaces`).  As the framework processes message:created and membership:created events, it will spawn additional bot objects as needed.   Bots that are spawned due to being added to a new space (since the framework started) will have an additional `addedBy` parameter passed to the ["spawn" event handler](../README.md#"spawn")


## Common migration tasks
Alternately, since elements of the bot and trigger objects have also changed, one might just bite the bullet, and do some search and replace.  The biggest migration tasks come from the renaming of flint to framework and the change in structures for the bot and trigger objects.  Common case sensitive search and replace tasks might include

* node-flint --> webex-node-bot-framework
* Flint --> Framework 
* flint --> framework
* trigger.personDisplayName --> trigger.person.displayName
* trigger.roomTitle --> trigger.room.title
* trigger.personEmail --> trigger.person.emails[0]
* trigger.roomId --> bot.room.id
* bot.roomId --> bot.room.id

With that said, please review the other changes outlined in this document to determine if any existing flint.hears() or flint.on() handler function logic needs to be updated.


## Core Object Changes
For developer's who are porting existing flint based bots to this framework the following tables provide an overview of the changes to the key objects (note that all dates are strings, not moment objects as they were in node-flint):


## Framework (Formerly Flint)
**Kind**: global class  
**Properties**

| Orig Flint Name | New Framework Name | Description                    | Reason For Change                    |
| --------------- | -------------- | ------------------------------ | ------------------------------------ |
| id              | id             | Framework UUID                     |                                      |
| active          | active         | Framework active state             |                                      |
| intialized      | initialized    | Framework fully initialized        |                                      |
| isBotAccount    | isBotAccount   | Is Framework using a bot account?  |                                      |
| isUserAccount   | isUserAccount  | Is Framework using a user account? |                                      |
| person          | person         | Framework person object            | Now is unchanged webex person object |
| email           | email          | Framework email                    | No longer set to all lower case      |
| spark           | webex          | Framework SDK                      | now based on webex jsssdk            |

## Bot
**Kind**: global class  
**Properties**

| Orig Bot Name | New Bot Name | Description                                  | Reason For Change                                            |
| ------------- | ------------ | -------------------------------------------- | -------------------------------------------------------------|
| id            | id           | Bot UUID                                     |                                                              |
| flint          | framework          | Framework object                      | Name change                                                              |
| active        | active       | Bot active state                             |                                                              |
| person        | --           | Bot Person Object                            | Availabile as bot.framework.person                         |
| email         | --           | Bot email                                    | Availabile as bot.framework.person.emails[0]                                   | 
| team          | --           | Bot team object                              | This object is seldom used and creating it slows down spawning a bot.  Apps that want it can check if `bot.room.teamId` exists and if so call `bot.getWebexSDK().teams.get(bot.room.teamId)`       |
| room          | room         | Bot room object                              | Now is standard webex room object                            |
| membership    | membership   | Bot membership object                        | Standard Webex Teams membership object for bot               |
| memberships   | memberships  | All memberships for bot's space              | This array is seldom used.  Creating it slows down the initial bot spawn, and keeping it "current" requires periodic "refresh" calls to the platform.  Apps that want to inspect room memberships can instead call `bot.getWebexSDK().memberships.list({roomId: bot.room.id})` at the time the data is needed.  The response is a standard Webex response and the members will be in an array called `items`.
|
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
| roomId            | --                  | Room ID                                         | inspect bot.room.id                 |
| roomTitle         | --                  | Room Title                                      | inspect bot.room.title              |
| roomType          | --                  | Room Type (group or direct)                     | inspect bot.room.type               |
| roomIsLocked      | --                  | Room Locked/Moderated status                    | inspect bot.room.isLocked           |
|                   | person              | Webex Person Object                             | Added for forward extensibility     |
| personId          | personId            | Person ID                                       | Still at top level for convenience  |
| personAvatar      | --                  | Person Avatar URL                               | insepct trigger.person.avatar       |
| personDisplayName | --                  | Person Display Name                             | insepct trigger.person.displayName  |
| personEmail       | --                  | Person Email                                    | insepct trigger.person[0]           |
| personUsername    | --                  | Person Username                                 | derive from trigger.person[0]       |
| personDomain      | --                  | Person Domain name                              | derive from trigger.person[0]       |
| personMembership  |  --                 | Person Membership object for person             | use bot.getTriggerMembership()    (TODO)  |

## Event changes
Node-flint generated a set of `person` events based on membership changes.  For each membership, the framework would fetch the person object associated with that membership pass it to the event handler.  Since many bots don't even register these handers this seems expensive.  Information like the personEmail and personDisplayName are also already included in the membership DTO.  Finally, bots that truly wish to get the person object can always query it directly via the `framework.getPerson(membership.personId)` function.

 Our framework instead generates a set of related `member` named events and passes the membership associated with the change to event handler.   This makes the framework snappier and the events seem more aptly named (since the membership change may be associated with another bot as well as a person).

With this in mind the following node-flint events are now renamed as follows:
* `personEnters` -> `memberAdded`
* `personExits` -> `memberRemoved`
* `personAddedAsModerator`  -> `memberAddedAsModerator`
* `personRemovedAsModerator` -> `memberRemovedAsModerator`

The payload passed to the event handlers will be a bot, the *membership object* (not a person object), and the bot or framework id.  Therefore an app that implemented something like:

```javascript
framework.on('personEnters', function (bot, person) {
  bot.say(`Welcome ${person.displayName}!`);
});
```

Would need to be modified to handle the `memberAdded` event with a memebership object instead, ie:

```javascript
framework.on('memberAdded', function (bot, membership) {
  bot.say(`Welcome ${membership.personDisplayName}!`);
});
```

For every message node-flint generates a set of events which may include
* `messageCreated`
* `mentioned`
* `message`
* `files`

Our new framework will ONLY generate the `messageCreated` event in instances when the message was sent by the bot.  In almost all cases bots and applications don't want to respond to their own messages, however those that choose to do so should build the logic for processing them in a `flint.on("messageCreated", message, flintId)` handler since the other events are no longer sent.   If any other space member posts a message, the `message` event will always fire and the `mentioned` event will fire if the message mentioned the bot, and a `files` event will fire if the message includes file attachments.

## Method Changes

Flint functions that were essentially wrappers around core Webex APIs have mostly been removed, in 

## Storage Adaptor Changes
For developer's who are porting existing flint based bots that use the storage adaptor capabilities there are some changes.

The basic `bot.store()`, `bot.recall()`, and `bot.forget()` work as they always have when using the memory default memory storage adaptor, but there are changes in the persistent memory store adaptors.   

A new Mongo storage adaptor has been added which has been tested with cloud based Mongo Atlas DBs.   It adds several new functions:

* initialize() -- this must be called before framework.start() is called and will validate that the configuration is correct
* initStorage() -- this is called internally by the framework when a new bot is spawned.  If the new framework configuration element `initBotStorageData` is set, these key/value pairs will be set on the new bot.
* writeMetrics() -- is a new, optional, method for storage adaptors that can be called to write breadcrumbs into the database that can be used to build reports on the bot's usage

The redis adaptor is likely broken and needs to be updated to support the new functions.   It would be great if a flint user of redis wanted to [contribute](./contributing.md)!
