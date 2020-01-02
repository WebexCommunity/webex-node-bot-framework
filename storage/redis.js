'use strict';

const Redis = require('redis');
const when = require('when');
const _ = require('lodash');

// promisfy JSON.parse and JSON.stringify
const jsonParse = when.lift(JSON.parse);
const jsonStringify = when.lift(JSON.stringify);

module.exports = exports = function (connectionUrl) {
  const redis = Redis.createClient({ url: connectionUrl });
  const name = 'redis';

  return {

    /**
     * Init the global memory storage
     * 
     * This has never been tested.  Validating connections
     * work here and throwing an exception when they don't 
     * could be handy
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
     * This has never been tested and needs help from a redis user
     *
     * @function
     * @param {String} id - Room/Conversation/Context ID
     * @param {object} initBotData - object that contains the key/value pairs that should be set for new bots
     * @returns {(Promise.<Object>} - bot's initial config data
     */
    initStorage: function (id, initBotData) {
      // TO BE IMPLEMENTED
      // Check if data already exists in this space
      // If so return it here
      // If not add each key/value pair in the initBotData
      if ((initBotData) && (typeof initBotData === 'object')) {
        // Add this data to redis for this bot/space
      }
      return when(initBotData);
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
      if (id && key) {
        if (value) {
          return jsonStringify(value)
            .then(stringVal => when.promise((resolve, reject) => redis.hset(id, key, stringVal, (err, result) => {
              if (err) {
                reject(err);
              } else {
                resolve(result);
              }
            })));
        }
        return when.promise((resolve, reject) => redis.hset(id, key, '', (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        }));
      }
      return when.reject(new Error('invalid args'));
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
      if (id) {
        if (key) {
          return when.promise((resolve, reject) => redis.hget(id, key, (err, result) => {
            if (err) {
              reject(err);
            } else {
              resolve(result);
            }
          })).then((res) => {
            const parsedRes = jsonParse(res)
              .catch(() => when(res));
            return parsedRes;
          });
        }
        return when.promise((resolve, reject) => redis.hgetall(id, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        })).then((res) => {
          const resKeys = _.keys(res);
          return when.map(resKeys, (resKey) => {
            const parsedRes = jsonParse(res[resKey])
              .catch(() => when(res[resKey]));
            return parsedRes;
          });
        });
      }
      return when.reject(new Error('invalid args'));
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
      if (id) {
        if (key) {
          return when.promise((resolve, reject) => redis.hdel(id, key, (err, result) => {
            if (err) {
              reject(err);
            } else {
              resolve(result);
            }
          }));
        }
        return when.promise((resolve, reject) => redis.del(id, (err, result) => {
          if (err) {
            resolve(true);
          } else {
            resolve(true);
          }
        }));
      }
      return when.reject(new Error('invalid args'));
    }
  };

};
