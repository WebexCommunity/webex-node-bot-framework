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
