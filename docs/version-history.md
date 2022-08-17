# Version History

## v 2.3.11

* Add debugging for message processing.  Set the environment DEBUG=framework for additional details on how th framework is processing incoming messages.

## v 2.3.10

* Updated many dependencies
* Grammar fix in contributing.md - Thank you Tim Statler!

## v 2.3.9

* Emit framework log events with details about framework.hears() calls

## v 2.3.8

* Fix bug in framework.getPersonByEmail helper method

## v 2.3.7

* Merge PR from jeremywillans to add support for Blockquote in Markdown
* Merge PR from jeremywillans to fix bot.isLocked attribute on roomLocked/Unlocked event
* Update dependencies to reduce npm and dependabot warnings

## v 2.3.6

* Merge PR from jeremywillans to fix incorrect mongo storageCollectionName
* Thank you Chuck Shipman

## v 2.3.5

* Merge PRs from jeremywillans to use new Webex API URL, and to fix the sendCard example.
* Update some dependencies

## v 2.3.4

* Fix to correctly emit roomRenamed, roomLocked and roomUnlocked events, with an updated room object.
* Remove old comments about bot.reply not being generally available
* Remove old "Webex Teams" branding.  (Webex Teams is now simply "Webex")
* Thank you master-hax!

## v 2.3.3

* Fix but to correctly emit memberRemovedAsModerator event
* Fixed typo in error message in Mongo storage adapter
* Thank you briancp!
* Bug fix to properly create a new team space in `bot.newRoom()` if isTeam param is true.

## v 2.3.2

* Bug fix to properly create a new team space in `bot.newRoom()` if isTeam param is true.
* New metricsStoreIdsOnly config param for mongo storage adapter.  If set only the actor's personId and orgId will be logged in a call to `bot.writeMetric()`.  The default behavior also logs the actor's email, domain, and displayName, if a valid personId is passed as the actor parameter.

## v 2.3.1

* Moved repo to https://github.com/WebexSamples/webex-node-bot-framework
* Added links to blog posts in the "News" section of the readme

## v 2.3.0

* Added a new [bot.dmCard](../README.md#Bot+dmCard) method to facilitate sending a card to a user in a 1-1 space
* Fixed a bug in the startup logic introduced in the v2.2.2 change to better handle spawning in 1-1 spaces where the other participant no longer has a valid webex account

## v 2.2.2

* Finally merged an awesome PR from @zapdos26, which cleaned up a lot of embarrassing spelling and syntax errors in my [Migrating from flint guide](./migrate-from-node-flint.md)
* Better handling during startup of 1-1 spaces where the other participant no longer has a valid Webex account

## v 2.2.1

* Added `removeDeviceRegistrationsOnStart` configuration option.   This can be set to `true` during the iterative development process if the developer is using websockets and gets an `excessive device registrations` error, but this should be used carefully as it logs the user associated with the app token out of any clients.  (It is generally safe for bots.)  
  
  It should not be necessary to set this if your application ensures that it calls `framework.stop` when it exits, perhaps by registering a signal handler as demonstrated in the [**Websocket Example**](./docs/example3.md), as this method deletes the device registration created for the websocket notifications used by that instance of the app.

## v 2.1.1

* Bumped lodash version number

## v 2.1.0

* Added new accessor methods [framework.getWebexSDK()](../README.md#Framework+getWebexSDK) and [bot.getWebexSDK()](../README.md#Bot+getWebexSDK) to allow developers to access the framework's underlying Webex Javascript SDK instance which can be used to call any [JSSDK method](https://webex.github.io/webex-js-sdk/api/). Note that there is a single webex SDK instance used by the framework.  The bot accessor method is simply a convenience, both accessors return the same object, and the same object will be returned when this accessor is called on any of the frmaework's bot objects.
* Added [framework.getBotByRoomId()](../README.md#Framework+getBotByRoomId) which allows developers to discover the bot object associated with a particular room.

## v 2.0.0

* Added [Membership Rules](./membership-rules-readme.md) configuration options restrict bot interactions to spaces that are exclusively populated by users with email domains specified in a restricted to domain list.   Beta Mode further restricts bot interaction to only spaces where specific named users are present.
* Added bot.sayWithLocalFiles
* Removed bot.upload(file) -- call sayWithLocalFile(null, filename) instead
* Removed bot.messageStreamRoom() -- call bot.webex.messages.create() with a message object that includes the roomId, the (optional) markdown or text message, and populate the files field with an array containing a single file stream, as described in the documentation for uploadStream
* Removed bot.getMessages(count) -- call bot.webex.messages.list({roomId: bot.room.id, max: count})  -- note that this only works when the bot was created with a user token.

## v 1.2.2

* Fixed bug in bot.reply so that it supports passing a message object as well as message text
* Enhanced bot.reply so that it accepts a messageId in addition to message/attachmentAction objects as the replyTo parameter

## v 1.2.1

* Modified how webex initialization config is formatted to work with latest SDK builds

## v 1.2.0

* Added new config option `httpsProxy`.  When set the framework will use this to proxy requests to Webex
* Slight change to cleanup logic when using web-sockets to try to eliminate the "excessive device registrations" warning that can hit developers who are iteratively testing their apps

## v 1.1.0

* Modified `maxStartupSpaces` configuration option behavior.   When not set the framework will attempt to discover all the spaces the bot (or framework's user) is in, generating a bot object and emitting a "spawn" event for each one before emitting an "initialized" event. Developers may set this config option to any integer greater than zero to speed up start time, but this should only be used in cases where the bot logic is primarily driven by commands from Webex users, as opposed to event notification bots which may rely on logic to determine if a bot object exists before sending the appropriate event.
* This is a change in behavior from when this parameter was introduced in v0.7.0, where the default value was 100.  This change was made so that developers must explicitly choose not to spawn all bot objects during initialization.
* Updated startup logic to properly paginate through all the responses to the list memberships API call in order to discover all possible spaces.

## v 1.0.5

* Fix in webhook cleanup logic on framework.stop()

## v 1.0.4

* Don't do any validation of the attachments field in bot.sendCard as this blocks any detailed validation errors that the Webex platform might return

## v 1.0.3

* Documentation typo cleanup

## v 1.0.2

* Fixed some race conditions caused by problems when events happen very fast, for example the memberships and message events when a one-on-one space is created.  Sometimes the flint.hears() handler could be called before the flint.spawn() handler finished processing.
* Mongo now uses updateOne to modify just the one field in a bot.store() call.  Previously it updated the whole document with replaceOne().  This prevents one element from being stored if bot.store() is called from another handler before the first previous one returns.
* flint.spawn() could be called multiple times on room creation.  It now checks if a spawn is in progress for a room and ignores subsequent requests.

## v 1.0.1

* Bug fix. Bot membership deletes in spaces that were never spawned are ignored.   (It's too late to spawn a bot when we can't get any room details)

## v 1.0.0

* Removed all "pass through" functions that flint used to support.   Developers are now encouraged to call the native webex SDK methods instead
* Added "late spawning" logic to membership and room:updated events as well as message events.
* Removed the "work in progress" message from the readme.   While there are still things on the todo list we want to encourage developers to start using this framework.

## v 0.7.1

* Bug fixes to ensure bot.store() fully completes write to persistent store before returning

## v 0.7.0

* Webex list APIs such as /rooms and /memberships do not perform well for applications that belong in over 1000 spaces.   In order to support popular bots the framework will now do "late spawning" of bots that existed in spaces before the server started, but were not discovered until after the framework completed its initialization.
* Added `maxStartupSpaces` parameter to framework options to set the number of bot objects to "pre-spawn".   The default is 100.  This is similar to how Webex Teams clients work when starting getting only the 100 or so "most recent" spaces and then discovering other spaces "on the fly" as messages are sent to them.
* As a consequence to this, existing samples that used the value of `framework.initialized` in the `spawn` event handler to differentiate between spaces that were discovered at startup vs. spaces that the bot has newly been added to, needed to change since it is now possible that bots that were in spaces prior to the server startup are spawned after the framework is initialized.  The new best practice is to look for the presence of the `addedBy` parameter in the `spawn` event handler.  If this is is set, it means that this spawn event was generated in response to a new membership rather than a new message event, which means that the bot was just added to a new space.   Applications may use this to add logic to have the bot introduce itself when it is first added to a space (but not every time it is spawned, since that would spam users every time the server is restarted)

## v 0.6.1

* Bug fixes to ensure initStorage completes before 'spawned' event is emitted.

## v 0.6.0

* Refactored storage adaptor logic
* `framework.storageDriver()` now returns a promise
* Added new Mongo storage adaptor to support bot storage that persists across server restarts
* Added `initStorage()` method called by the framework when a bot is spawned that loads data in from database or, optionally creates a default set of key/value pairs specified in the `initBotStorage` element of the framework's configuration
* Added a `writeMetrics()` method to the storage Adaptor framework, allowing developers who use a persistent storage to write bot activity data for potential engagement level reporting

## v 0.5.0

* Updated framework to webex SDK v1.80.80
* Added support for attachmentAction events via web-socket.  (SDK added this in v1.80.79)
* Updated migration document to explicitly state that the framework does not support retries for pagination or 429 errors.   framework.start() will fail now if the parameters around retry logic are set.  Hope to add this back, at least for pagination, which the webex SDK provides an interface for, in the future.
* Added tests for bot.[store,recall,forget].   Only tested memory storage so far.  Migrating doc still warns that redis is untested.
  
## v 0.4.0

* Moved repo to https://github.com/webex/webex-node-bot-framework
* Updated use of Buffer in lib/utils.js to avoid deprecation warning
  
## v 0.3.2

* removedBy param added to `despawn` event in cases when bot was removed from a space by a user after the framework was initialized.  
  
## v 0.3.1

* In bot.say() and bot.dm() handle wierd behavior with the javascript agruments object when second argument is undefined and the function was called from another function.   Prior to this the bot's message could add the string "undefined" at the end of the message.
  
## v 0.3.0

* addedBy param added to `spawn` event in cases when bot was added to a space by a user after the framework was initialized.  Note that this parameter will not be passed to any `spawn` event handlers called during the framework's initialization
  
  **Example**  

```js
// DM the user who added bot to a group space
framework.on('spawn', function(bot, flintId, addedBy) {
  if (!framework.initialized) {
     // don't say anything here or your bot's spaces will get
     // spammed every time your server is restarted
     framework.debug(`While starting up our bot was found '+
       in a space called: ${bot.room.title}`);
  } else {
    if ((bot.room.type === 'group') && (addedBy)) {
      bot.dm(addedBy, 'I see you added me to the the space '  + bot.room.title + ',
        but I'm not allowed in group spaces.  We can talk here if you like.');
      bot.exit();
});
