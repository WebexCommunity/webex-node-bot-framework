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
