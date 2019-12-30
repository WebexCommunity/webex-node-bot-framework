// template for creating custom storage modules

'use strict';

module.exports = exports = function () {
  // define adaptor name and any other objects needed
  const name = "template";

  return {
    /**
     * Init the adaptor
     * 
     * Users can call this to validate connectivity to the DB is working
     * Return a rejct if there is a problem with the configuration
     *
     * @function
     * @returns {(Promise.<Boolean>} - True if setup
     */
    initialize: function () {
      return when(true);
    },

    /**
     * Get the storage adaptor's name
     *
     * @function
     * @returns {string} - storage adaptor name
     */
    getName: function () {
      return name;
    },

    /**
     * Called when a bot is spawned, this function reads in the exisitng
     * bot configuration from the DB or creates the default one
     *
     *
     * @function
     * @param {String} id - Room/Conversation/Context ID
     * @param {object} initBotData - object that contains the key/value pairs that should be set for new bots
     * @returns {(Promise.<Object>} - bot's initial config data
     */
    initStorage: function (id, initBotData) {
      // check if there is existing data for this id in the persistent store
      // if not found, set the initial bot data passed in
      // if success, return promise that resolves to initBotData
      // if failure, returns a rejected promise
    },

    /**
     * Store key/value data.
     *
     * This method is exposed as bot.store(key, value);
     *
     * @function
     * @param {String} id - Room/Conversation/Context ID
     * @param {String} key - Key under id object
     * @param {(String|Number|Boolean|Array|Object)} value - Value of key
     * @returns {(Promise.<String>|Promise.<Number>|Promise.<Boolean>|Promise.<Array>|Promise.<Object>)}
     */
    store: function (id, key, value) {
      // if id does not exist, create
      // if success, return promise that resolves to value
      // if failure, returns a rejected promise
    },

    /**
     * Recall value of data stored by 'key'.
     *
     * This method is exposed as bot.recall(key);
     *
     * @function
     * @param {String} id - Room/Conversation/Context ID
     * @param {String} [key] - Key under id object (optional). If key is not passed, all keys for id are returned as an object.
     * @returns {(Promise.<String>|Promise.<Number>|Promise.<Boolean>|Promise.<Array>|Promise.<Object>)}
     */
    recall: function (id, key) {
      // if exists, returns promise that resolves to value of id/key referenced
      // if does not exist, or a failure, returns a rejected promise
    },

    /**
     * Forget a key or entire store.
     *
     * This method is exposed as bot.forget(key);
     *
     * @function
     * @param {String} id - Room/Conversation/Context ID
     * @param {String} [key] - Key under id object (optional). If key is not passed, id and all children are removed.
     * @returns {(Promise.<String>|Promise.<Number>|Promise.<Boolean>|Promise.<Array>|Promise.<Object>)}
     */
    forget: function (id, key) {
      // if exists, returns promise that resolves to value of deleted value
      // if does not exist, or a failure, returns a rejected promise
    }
  };

};
