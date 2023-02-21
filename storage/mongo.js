/*
* mongo.js
* 
* This module implments a storage interface for bots built using
* the webex-node-botkit-framework.  Data is stored in a mongo
* database, but also stored locally in a memory store for fast
* lookups which are used when configured with the singleInstance option.
*
*  Writes lazily update the database
*  
*/
const when = require('when');
var _ = require('lodash');
var debug = require('debug')('mongo');

var mongo_client = require('mongodb').MongoClient;


class MongoStore {
  /**
   * Creates an instance of the Mongo Storage Adaptor.
   * This storage adaptor uses a Mongo database that allows
   * bot storage information to persist across server restarts.
   * It has been tested with cloud mongo db conections and requires
   * mondodb driver 3.4 or greater.
   * @module MongoStore
   * @constructor MongoStore
   * @param {Object} config - Configuration object containing mongo db and collection settings.
   *
   * @example
   * var config = {
   *   mongoUri: 'mongodb://[username:password@]host1[:port1][,...hostN[:portN]][/[database][?options]]',
   *   storageCollectionName: 'webexBotFrameworkStorage'
   * };
   * let MongoStore = require('webex-node-bot-framework/storage/mongo');
   * let mongoStore = new MongoStore(config);
   */

  constructor(config) {
    this.canInitiatilize = false;
    this.name = 'mongo';

    /**
     * Options Object
     *
     * @memberof MongoStore
     * @instance
     * @namespace config
     * @property {string} mongoUri - URI to connect to Mongo.
           This is typically in the format of:\n mongodb+srv://[username:password@]host1[:port1][,...hostN[:portN]][/[database][?options]],
           ie: mongodb+srv://myUser:secretPassw0rd@cluster#-area.mongodb.net/myClusterDBName?retryWrites=true&w=majority`,
           see:  https://docs.mongodb.com/manual/reference/connection-string/
     * @property {string} [storageCollectionName=webexBotFrameworkStorage] - Mongo collection name for bot.[store,recall]() (will be created if does not exist)
     * @property {object} [initBotStorageData={}] - Object with any default key/value pairs that a new bot should get upon creation 
     * @property {string} [metricsCollectionName] - Mongo collection name for bot.writeMetric() (will be created if set, but does not exist),
     *     bot.writeMetric() calls will fail if this is not set
     * @property {Boolean} [metricsStoreIdsOnly] - Only store user id and org id in the metrics store
     * @property {Boolean} [singleInstance=false] - Optimize bot.recall() speed if the bot is only running a single instance.
     *     Data is still written to db, but lookups are done from local memory
     *     Should be used with caution!
     */

    if (!config.mongoUri) {
      console.error('MongoStore config object is missing required mongoUri parameter.  Persistent storage will not be available');
      return;
    }
    this.canInitialize = true;
    this.initizalized = false;
    this.config = config;

    // Use default storage collection name if none set
    this.config.metricsCollectionName = (config.metricsCollectionName) ? config.metricsCollectionName : 'webexBotFrameworkStorage';

    // As an optimization this storage adapter can run in "single instance" mode and do "recalls" from memory
    // Developers should set this only if they are SURE that only one instance of the bot is running.
    // If its behind a load balancer, recalls should always check the DB in case another instance updated
    this.config.singleInstance = (config.singleInstance) ? config.singleInstance : false;

    // We keep a copy of the bots' storage in memory for fast lookups
    // TODO (completely skip this if we are not in single instance mode?)
    this.memStore = {};

    // this.connectUrl = encodeURI(`mongodb+srv://${config.mongoUser}:${config.mongoPass}@${config.mongoConnectionStringSuffix}`);
    // this.connectUrl = encodeURI(`mongodb+srv://tropoBot:7M9rdmW6Goq1yAwg@cluster0-5rfnd.mongodb.net/new-cardSchool-dev?retryWrites=true&w=majority`);
    this.connectUrl = encodeURI(config.mongoUri);

    // default to false if the value is not set in the config
    if(config.metricsStoreIdsOnly === undefined) {
      this.config.metricsStoreIdsOnly = false;
    }
  }

  /**
   * Initializes the connection to the db.
   * Call this, and wait for the return before setting the 
   * framework's storage adaptor, and then calling framework.start()
   *
   * @function
   * @returns {(Promise.<Boolean>)} - True if setup
   * 
   * @example
   *  // Wait for the connection to the DB to initialize before setting the
   *  // framework's storage driver and starting framework
   *  mongoStore.initialize()
   *    .then(() => framework.storageDriver(mongoStore))
   *    .then(() => framework.start())
   *    .catch((e) => {
   *      console.error(`Initialization with mongo storage failed: ${e.message}`)
   *      process.exit(-1);
   *   });
   */
  initialize() {
    // Connect to the mongoDB using the user,pass and url from the config
    return mongo_client.connect(this.connectUrl,
      {
        useUnifiedTopology: true,
        useNewUrlParser: true,
      })
      .then((client) => {
        this.client = client;
        // Open (or create) the collection specified in the config
        return this.client.db().collection(this.config.storageCollectionName);
      })
      .then((storeCollection) => {
        this.botStoreCollection = storeCollection;
        // If specified, open, or create a metrics collection
        if (this.config.metricsCollectionName) {
          return this.client.db().collection(this.config.metricsCollectionName);
        } else {
          return when('');
        }
      })
      .then((metricsCollection) => {
        if ((this.config.metricsCollectionName) && (metricsCollection)) {
          this.metricsStoreCollection = metricsCollection;
        }
        this.initialized = true;
        return when(this.initialized);
      })
      .catch((e) => {
        return when.reject(new Error(`MongoStore.initialize() failure: ${e.message}`));
      });
  }

  /**
   * Get the storage adaptor's name
   *
   * @function
   * @returns {string} - storage adaptor name
   */
  getName() {
    return this.name;
  };

  /**
   * Called by the framework, when a bot is spawned,
   * this function reads in any existng bot configuration from the DB
   * or creates the default one if none is found
   * 
   * In general bot developers should not need to call this method
   *
   * @function
   * @param {String} id - Room/Conversation/Context ID
   * @param {object} initBotStorageData - data to initialize a new bot with
   * @returns {(Promise.<Object>)} - bot's initial or previously stored config data
   */
  initStorage(id, initBotStorageData) {
    if ((!this.initialized) || (!this.botStoreCollection)) {
      if (!this.config.singleInstance) {
        return when.reject(new Error('MongoStore.spawn() called when store is not initialized!'));
      }
      debug(`No DB available. Will use default config for roomId: "${id}".  Settings will not persist across restarts.`);
      if (typeof initBotStorageData != 'object') {
        initBotStorageData = {};
      }
      this.memStore[id] = initBotStorageData;
      return when(initBotStorageData);
    }

    // Look for an existing storeConfig in the DB
    return this.botStoreCollection.findOne({ '_id': id })
      .then((dbStore) => {
        if (dbStore !== null) {
          debug(`Found stored config for existing spaceId: "${id}"`);
          this.memStore[id] = dbStore;
          return when(this.memStore[id]);
        } else {
          debug(`Did not find stored config for existing spaceId: "${id}"`);
          return when(this.createDefaultConfig(id, initBotStorageData));
        }
      })
      .catch((e) => {
        this.logger.error(`Failed to contact DB on bot spawn for spaceId "${id}": ${e.message}.  Using default config`);
        return when(this.createDefaultConfig(id, initBotStorageData));
      });
  };

  createDefaultConfig(id, initStorage) {
    debug(`Attempting to store default config for spaceId "${id}"`);
    let initBotStorageData = JSON.parse(JSON.stringify(initStorage));
    initBotStorageData._id = id;
    this.memStore[id] = initBotStorageData;
    return this.botStoreCollection.insertOne(initBotStorageData, { upsert: true, writeConcern: 1 })
      .then((mReturn) => {
        debug(`Mongo response when creating default store config for spaceId: ${id}:`);
        debug(mReturn);
        return when(initBotStorageData);
      })
      .catch((e) => {
        console.error(`Failed to store default config for spaceId: "${id}": ${e.message}`);
        return when(initBotStorageData);
      });
  };

  /**
   * Store key/value data.
   *
   * This method is exposed as bot.store(key, value);
   *
   * @function
   * @param {String} id - Room/Conversation/Context ID
   * @param {String} key - Key under id object
   * @param {(String|Number|Boolean|Array|Object)} value - Value of key
   * @returns {(Promise.<String>|Promise.<Number>|Promise.<Boolean>|Promise.<Array>|Promise.<Object>)} -- stored value
   */
  store(id, key, value) {
    let skipDbWrites = false;
    if ((!this.initialized) || (!this.botStoreCollection)) {
      if (!this.config.singleInstance) {
        return when.reject(new Error('MongoStore.store() called when store is not initialized!'));
      } else {
        skipDbWrites = true;
        debug(`MongoStore.store(): No DB will use in-memory config for spaceId: "${id}".  Settings will not persist across restarts.`);
      }
    }

    if (typeof id !== 'string') {
      return when.reject(new Error(`Failed to store {${key}: ${value}}.  Invalid bot spaceId.`));
    }

    if (!this.memStore[id]) {
      // Paranoia here, should not happen
      this.memStore[id] = { _id: id };
    }

    if (key) {
      this.memStore[id][key] = value;
      if (skipDbWrites) {
        return when(this.memStore[id][key]);
      }
      let update = {};
      update[key] = value;
      return this.botStoreCollection.updateOne(
        { _id: id }, { $set: update }, { upsert: true })
        .catch((e) => {
          return when.reject(new Error(`Failed DB storeConfig update spaceId: "${id}": ${e.message}`));
        });
    }
    return when.reject(new Error('invalid args'));
  };

  /**
   * Recall value of data stored by 'key'.
   *
   * This method is exposed as bot.recall(key, value);
   *
   * @function
   * @param {String} id - Room/Conversation/Context ID
   * @param {String} [key] - Key under id object (optional). If key is not passed, all keys for id are returned as an object.
   * @returns {(Promise.<String>|Promise.<Number>|Promise.<Boolean>|Promise.<Array>|Promise.<Object>)} -- recalled value
   */
  recall(id, key) {
    let skipDbReads = false;
    if ((!this.initialized) || (!this.botStoreCollection)) {
      if (!this.config.singleInstance) {
        return when.reject(new Error('MongoStore.recall() called when store is not initialized!'));
      } else {
        skipDbReads = true;
        debug(`MongoStore.recall(): No DB will use in-memory config for spaceId: "${id}".  Settings will not persist across restarts.`);
      }
    }

    if (typeof id !== 'string') {
      return when.reject(new Error(`Failed to bot.recall(${key}).  Invalid bot object.`));
    }

    if ((this.config.singleInstance) || (skipDbReads)) {
      // if key is defined and of type string....
      if (typeof key === 'string') {
        // if id/key exists...
        if (this.memStore[id] && this.memStore[id][key]) {
          return when(this.memStore[id][key]);
        } else {
          return when.reject(new Error('bot.recall() could not find the value referenced by id/key'));
        }
      }

      // else if key is not defined
      else if (typeof key === 'undefined') {
        // if id exists...
        if (this.memStore[id]) {
          return when(this.memStore[id]);
        } else {
          return when.reject(new Error('bot.recall() has no key/values defined'));
        }
      }

      // else key is defined, but of wrong type
      else {
        return when.reject(new Error('bot.recall() key must be of type "string"'));
      }

    } else {
      // Todo optimize this to use projection operators and get only the key needed
      return this.botStoreCollection.findOne({ _id: id })
        .then((remoteConfig) => {
          this.memStore[id] = remoteConfig;
          if (key) {
            if (key in this.memStore[id]) {
              return when(this.memStore[id][key]);
            } else {
              return when.reject(new Error(`Failed to find ${key} in recall() for spaceId "${id}"`));
            }
          } else {
            return when(this.memStore[id]);
          }
        })
        .catch((e) => {
          return when.reject(new Error(`Failed to find ${key} in recall() for spaceId "${id}"`));
        });
    }
  };

  /**
   * Forget a key or entire store.
   *
   * This method is exposed as bot.forget(key, value);
   *
   * @function
   * @param {String} id - Room/Conversation/Context ID
   * @param {String} [key] - Key to forget (optional). If key is not passed, all stored configs are removed.
   * @returns {(Promise.<String>|Promise.<Number>|Promise.<Boolean>|Promise.<Array>|Promise.<Object>)}
   */
  forget(id, key) {
    let skipDbWrites = false;
    if ((!this.initialized) || (!this.botStoreCollection)) {
      if (!this.config.singleInstance) {
        return when.reject(new Error('MongoStore.forget() called when store is not initialized!'));
      } else {
        skipDbWrites = true;
        debug(`MongoStore.forget(): No DB will use in-memory config for spaceID: "${id}".  Settings will not persist across restarts.`);
      }
    }

    if (typeof id !== 'string') {
      return when.reject(new Error(`Failed to forget ${key}.  Invalid bot object.`));
    }

    if (!((this.config.singleInstance) || (skipDbWrites))) {
      return this.botStoreCollection.findOne({ _id: id })
        .then((remoteConfig) => {
          this.memStore[id] = remoteConfig;
          return this.doForget(id, key, skipDbWrites);
        });
    } else {
      return this.doForget(id, key, skipDbWrites);
    }
  }

  /* Internal helper to work with memory version */
  doForget(id, key, skipDbWrites) {
    let val;
    if (key) {
      if (key in this.memStore[id]) {
        val = _.cloneDeep(this.memStore[id][key]);
        delete this.memStore[id][key];
        if (skipDbWrites) {
          return when(val);
        } else {
          let update = {};
          update[key] = "";
          return this.botStoreCollection.updateOne(
            { _id: id }, { $unset: update }, { upsert: true, writeConcern: 1 })
            .then((mongoResponse) => {
              debug('Mongo response from updating store config in bot.forget():');
              debug(mongoResponse);
              return when(val);
            })
            .catch((e) => {
              return when(new Error(`Failed DB storeConfig update spaceId: "${id}": ${e.message}`));
            });
        }
      } else {
        return when.reject(new Error(`Failed to find ${key} in forget() for spaceId "${id}"`));
      }
    } else {
      // Delete the entire store if no key is set
      this.memStore[id] = {};
      if (!skipDbWrites) {
        return this.botStoreCollection.deleteOne({ _id: id })
          .then((mongoResponse) => {
            debug('Mongo response from deleting store config in bot.forget():');
            debug(mongoResponse);
            return when(val);
          })
          .catch((e) => {
            return when(new Error(`Failed DB storeConfig delete for spaceId: "${id}": ${e.message}`));
          });
      }
    }
  }

  /**
   * Write a metrics object to the database
   *
   * This method is exposed as bot.writeMetric(appData, actor);
   *
   * @function
   * @param {object} bot - bot that is writing the metric
   * @param {object} appData - app specific metric data.
   * @param {object|string} actor - user that triggered the metric activity
   * @returns {(Promise.<Object>)} - final data object written
   */
  writeMetric(bot, appData, actor) {
    if (typeof appData !== 'object') {
      return when.reject(new Error('writeMetric() requires an appData object. ' +
        'Best practice is to include a field called "event"'));
    }
    let event = appData.event;
    if (!this.metricsStoreCollection) {
      return when.reject(new Error(`MongoStore.writeMetris(), no metrics collection ` +
        `available.  Metric data for ${event} is lost.`));
    }
    if ((typeof bot !== 'object') || (!('room' in bot))) {
      return when.reject(new Error(`Invalid bot object passed to writeMetric() call.  Metric data for ${event} is lost.`));
    }

    let data = appData;
    //TODO do I want to add any indices to this?
    data.botName = bot.person.displayName;
    data.spaceId = bot.room.id;
    data.spaceName = bot.room.title;
    data.spaceType = bot.room.type;
    data.date = new Date().toISOString();
    data._id = `${bot.room.id}_${data.date}`;

    // If we have actor info add that to the data
    if (actor) {
      if (typeof actor === 'string') {
        return bot.webex.people.get(actor)
          .then((actorPerson) => this.writeMetricWithActorData(data, actorPerson))
          .catch((e) => {
            debug(`Unable to get actor info for ${event}: ${e.message}.  Will write metric without it.`);
            return this.writeMetricWithActorData(data, null);
          });
      } else {
        return this.writeMetricWithActorData(data, actor);
      }
    } else {
      return this.writeMetricWithActorData(data, null);
    }
  };

  /* Internal helper to write metrics after a syncrounous or async actor lookup */
  writeMetricWithActorData(data, actorPerson) {
    try {
      if (actorPerson) {
        if (this.config.metricsStoreIdsOnly) {
          data.actorId = actorPerson.id;
        }
        else {
          data.actorEmail = actorPerson.emails[0];
          data.actorDisplayName = actorPerson.displayName;
          data.actorDomain = _.split(_.toLower(data.actorEmail), '@', 2)[1];
        }

        // always store orgId
        data.actorOrgId = actorPerson.orgId;
      }
    } catch (e) {
      debug(`Unable to get actor info for metrics event.  Will write metric without it.`);
    }
    return this.metricsStoreCollection.insertOne(data)
      .then((mResponse) => {
        if (mResponse.insertedCount != 1) {
          debug(`writeMetrics() Got unexpected Mongo.insertedCount: ${mResponse.insertedCount}`);
        }
        return when(mResponse.ops[0]);
      })
      .catch((e) => {
        return when.reject(new Error(`Failed writing metric to database: ${e.message}.  Metric data is lost`));
      });
  };

};

module.exports = MongoStore;
