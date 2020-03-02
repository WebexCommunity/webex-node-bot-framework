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
* Removed all "pass through" functions that flint used to support.   Developnpers are now encouraged to call the native webex SDK methods instead
* Added "late spawning" logic to membership and room:updated events as well as message events.
* Removed the "work in progress" message from the readme.   While there are still things on the todo list we want to enocurage developers to start using this framework.

## v 0.7.1
* Bug fixes to ensure bot.store() fully completes write to persistent store before returning

## v 0.7.0
* Webex list APIs such as /rooms and /memberships do not perform well for applications that belong in over 1000 spaces.   In order to support popular bots the framework will now do "late spawning" of bots that existed in spaces before the server started, but were not discovered until after the framework completed its initialization.
* Added `maxStartupSpaces` parameter to framework options to set the number of bot objects to "pre-spawn".   The default is 100.  This is similar to how Webex Teams clients work when starting getting only the 100 or so "most recent" spaces and then discovering other spaces "on the fly" as messages are sent to them.
* As a consquence to this, existing samples that used the value of `framework.initialized` in the `spawn` event handler to differentiate between spaces that were discovered at startup vs. spaces that the bot has newly been added to, needed to change since it is now possible that bots that were in spaces prior to the server startup are spawned after the framework is initialized.  The new best practice is to look for the presence of the `addedBy` parameter in the `spawn` event handler.  If this is is set, it means that this spawn event was generated in response to a new membership rather than a new message event, which means that the bot was just added to a new space.   Applications may use this to add logic to have the bot introduce itself when it is first added to a space (but not everytime it is spawned, since that would spam users every time the server is restarted)

## v 0.6.1
* Bug fixes to ensure initStorage completes before 'spawned' event is emitted.

## v 0.6.0
* Refactored storage adaptor logic
* `framework.storageDriver()` now returns a promise 
* Added new Mongo storage adaptor to support bot storage that persists across server restarts
* Added `initStorage()` method called by the framework when a bot is spawned that loads data in from database or, optionallky creates a default set of key/value pairs specified in the `initBotStorage` elment of the framework's configuration
* Added a `writeMetrics()` method to the storage Adaptor framework, allowing developers who use a persistent storage to write bot activity data for potential engagement level reporting

## v 0.5.0
* Updated framework to webex sdk v1.80.80
* Added support for attachmentAction events via webesocket.  (SDK added this in v1.80.79)
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
