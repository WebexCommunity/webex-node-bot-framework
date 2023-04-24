const when = require("when");
const assert = require('assert');
const validator = require('../../lib/validator');
// Variables an functions shared by all tests
var common = require("../common/common");
let framework = common.framework;
let testInfo = common.testInfo;


describe('User Created Room to create a Test Bot', () => {
  // Add the common setup/tear down logic for initial test space
 let userCreatedSpace = require('../common/before-after-user-created-room.js');
 userCreatedSpace.registerBeforeAndAfterHooks();

  describe('Bot Created Space for membership tests', () => {
    // Add the common setup/tear down logic for initial test space
    let botCreatedSpace = require('../common/before-after-bot-created-room.js');
    botCreatedSpace.registerBeforeAndAfterHooks();
  
    describe('bot storage tests', () => {

      //If the framework options included and initial storage config
      // make sure these elements have been added to the newly created bot
      it('checks the initial bot storage config is correct', () => {
        testInfo.config.testName = 'checks the initial bot storage config is correct';
        let storagePromises = [];
        let initValues = [];

        if (typeof framework.initBotStorageData === 'object') {
        } else {
          framework.debug('Skipping init storage test as not initial storage was found');
          return when(true);
        }

        for (let entry of Object.entries(framework.initBotStorageData)) {
          storagePromises.push(testInfo.config.botUnderTest.recall(entry[0]));
          initValues.push({key: entry[0], value: entry[1]});
        }
        if (storagePromises.length === 0) {
          framework.debug('No initial config set, no values checked');
          return Promise.resolve(true);
        }

        return when.all(storagePromises)
          .then((storagePromises) => {
            assert(((initValues.length === storagePromises.length)),
              `bot initial storage tests did not find all ${initValues.length} key/value pairs`);
            let objCount = 0;
            for (result of initValues) {
              if (typeof result.value === 'object') {
                objCount += 1; //indexOf is sketchy with objects
                continue;
              }
              let foundIndex = storagePromises.indexOf(result.value);
              if (foundIndex == -1) {
                return Promise.reject(new Error(`${testInfo.config.testName} failed: ` +
                  `Did not find value "${result.value}" ` +
                  `for key "${result.key}" in the inital bot storage.`));
              }
              storagePromises.splice(foundIndex, 1);
            }
            // Since we didn't lookup objects, at least confirm the number of objects match
            if (storagePromises.length !== objCount) {
              return Promise.reject(new Error(`${testInfo.config.testName} failed: ` +
                `Expected to find ${objCount}` +
                `objects in bot's initial data but found ${storagePromises.length}`));
            }
            return when(true);
          })
          .catch((e) => {
            console.error(`${testInfo.config.testName} failed: ${e.message}`);
            return when.reject(e);
          });
      });

      //If so check what data was avaiable after the spawn event
      it('sets and checks some storage elements', () => {
        testInfo.config.testName = 'sets and checks some storage elements';
        testString = 'testStringVal';
        testObject = {key1: 'val1', key2: 'val2'};

        return testInfo.config.botUnderTest.store('testString', testString)
          .then(() => testInfo.config.botUnderTest.store('testObject', testObject))
          .then(() => testInfo.config.botUnderTest.recall('testString'))
          .then((result) => {
            assert((result === testString),
              `${testInfo.config.testName}: Expected bot.recall('testString') to return ${testString}, got ${result}`);
            return testInfo.config.botUnderTest.recall('testObject');
          })
          .then((result) => {
            assert((validator.objIsEqual(result, testObject)),
              `${testInfo.config.testName}: Expected bot.recall('testObject') to return ${testObject}, got ${result}`);
            return testInfo.config.botUnderTest.forget('testString');
          })
          .then(() => testInfo.config.botUnderTest.forget('testObject'))
          .catch((e) => {
            console.error(`testname failed: ${e.message}`);
            return when.reject(e);
          });
      });

      it('checks for forgotten testString', () => {
        let element = 'testString';
        testInfo.config.testName = `check for non existent storage element ${element}`;

        return testInfo.config.botUnderTest.recall(element)
          .then((result) => {
            let msg = `${testInfo.config.testName} got a result of ${result} for bot.recall('${element}').  Expected a reject`;
            return when.reject(new Error(msg));
          })
          .catch((e) => {
            framework.debug(`Got expected reject: ${e.message}, for bot.recall('${element}') test.`);
            return when(true);
          });
      });

      it('sets elements without waiting', () => {
        testInfo.config.testName = 'sets elements without waiting';
        testString = 'testStringVal';
        testObject = {key1: 'val1', key2: 'val2'};
        let storagePromises = [];

        storagePromises.push(testInfo.config.botUnderTest.store('testString', testString));
        storagePromises.push(testInfo.config.botUnderTest.store('testObject', testObject));
        return when.all(storagePromises)
          .then(() => {
            storagePromises = [];
            storagePromises.push(testInfo.config.botUnderTest.recall('testString'));
            storagePromises.push(testInfo.config.botUnderTest.recall('testObject'));
            return when.all(storagePromises);
          })
          .then((storedValues) => {
            assert(((typeof storedValues === 'object') && (storedValues.length === 2)),
              'bot.recall tests did not resolve promises as expected!');
            for (result of storedValues) {
              if (typeof result === 'string') {
                assert((result === testString),
                  `${testInfo.config.testName}: Expected bot.recall('testString') to return ${testString}, got ${result}`);
              } else if (typeof result === 'object') {
                assert((validator.objIsEqual(result, testObject)),
                  `${testInfo.config.testName}: Expected bot.recall('testObject') to return ${testObject}, got ${result}`);
              } else {
                return when.reject(new Error('Got unexecpted return value in bot.recall tests'));
              }
            }
            storagePromises = [];
            storagePromises.push(testInfo.config.botUnderTest.forget('testString'));
            storagePromises.push(testInfo.config.botUnderTest.forget('testObject'));
            return when.all(storagePromises);
          })
          .catch((e) => {
            console.error(`testname failed: ${e.message}`);
            return when.reject(e);
          });
      });

      it('checks for forgotten testString', () => {
        let element = 'testString';
        testInfo.config.testName = `check for non existent storage element ${element}`;

        return testInfo.config.botUnderTest.recall(element)
          .then((result) => {
            let msg = `${testInfo.config.testName} got a result of ${result} for bot.recall('${element}').  Expected a reject`;
            return when.reject(new Error(msg));
          })
          .catch((e) => {
            framework.debug(`Got expected reject: ${e.message}, for bot.recall('${element}') test.`);
            return when(true);
          });
      });

      it('checks for forgotten testObject', () => {
        let element = 'testObject';
        testInfo.config.testName = `check for non existent storage element ${element}`;

        return testInfo.config.botUnderTest.recall(element)
          .then((result) => {
            let msg = `${testInfo.config.testName} got a result of ${result} for bot.recall('${element}').  Expected a reject`;
            return when.reject(new Error(msg));
          })
          .catch((e) => {
            framework.debug(`Got expected reject: ${e.message}, for bot.recall('${element}') test.`);
            return when(true);
          });
      });

      it('tries to forget a non existing storage element', () => {
        let element = 'testObject';
        testInfo.config.testName = `tries to forget a non existing storage element: ${element}`;

        return testInfo.config.botUnderTest.forget(element)
          .then((result) => {
            let msg = `${testInfo.config.testName} got a result of ${result} for bot.recall('${element}').  Expected a reject`;
            return when.reject(new Error(msg));
          })
          .catch((e) => {
            framework.debug(`Got expected reject: ${e.message}, for bot.forget('${element}') test.`);
            return when(true);
          });
      });

      it('tries to write bot metrics', () => {
        testInfo.config.testName = `tries to write bot metrics'`;

        return testInfo.config.botUnderTest.writeMetric({event: 'frameworkUnitTestWithActor'}, common.userPerson)
          .then((result) => {
            framework.debug('Succesfully wrote metrics data:');
            framework.debug(result);
          })
          .catch((e) => {
            if (typeof process.env.MONGO_USER !== 'string') {
              // Extend as other providers support this method
              framework.debug(`${testInfo.config.testName}" Got expected reject when working ` +
                `with non Mongo storage provider: ${e.message}`);
              return when(true);
            } else if (typeof process.env.MONGO_BOT_METRICS !== 'string') {
              // Extend as other providers support this method
              framework.debug(`${testInfo.config.testName}" Got expected reject when working ` +
                `with non Mongo storage provider with no metrics collection specific: ${e.message}`);
              return when(true);
            } else
              return when.reject(e);
          });
      });

      it('tries to write bot metrics with actorId', () => {
        testInfo.config.testName = `tries to write bot metrics with actorId`;

        return testInfo.config.botUnderTest.writeMetric({event: 'frameworkUnitTestWithActorId'}, common.userPerson.id)
          .then((result) => {
            framework.debug('Succesfully wrote metrics data:');
            framework.debug(result);
          })
          .catch((e) => {
            if (typeof process.env.MONGO_USER !== 'string') {
              // Extend as other providers support this method
              framework.debug(`${testInfo.config.testName}" Got expected reject when working ` +
                `with non Mongo storage provider: ${e.message}`);
              return when(true);
            } else if (typeof process.env.MONGO_BOT_METRICS !== 'string') {
              // Extend as other providers support this method
              framework.debug(`${testInfo.config.testName}" Got expected reject when working ` +
                `with non Mongo storage provider with no metrics collection specific: ${e.message}`);
              return when(true);
            } else
              return when.reject(e);
          });
      });

      it('tries to write bot metrics no actor info', () => {
        testInfo.config.testName = `tries to write bot metrics with actorId`;

        return testInfo.config.botUnderTest.writeMetric({event: 'frameworkUnitTestWithNoActorInfo'})
          .then((result) => {
            framework.debug('Succesfully wrote metrics data:');
            framework.debug(result);
          })
          .catch((e) => {
            if (typeof process.env.MONGO_USER !== 'string') {
              // Extend as other providers support this method
              framework.debug(`${testInfo.config.testName}" Got expected reject when working ` +
                `with non Mongo storage provider: ${e.message}`);
              return when(true);
            } else if (typeof process.env.MONGO_BOT_METRICS !== 'string') {
              // Extend as other providers support this method
              framework.debug(`${testInfo.config.testName}" Got expected reject when working ` +
                `with non Mongo storage provider with no metrics collection specific: ${e.message}`);
              return when(true);
            } else
              return when.reject(e);
          });
      });

    });

    describe('Bot Membership Tests', () => {

      describe('#bot.add, bot.remove, etc', () => {

        it('adds a user to the room', () => {
          testInfo.config.testName = 'bot adds a user to the room';
          return common.botAddUsersToSpace(framework, testInfo,
            [common.userPerson.emails[0]]);
        });

        // Need to research if this is still allowed (as the bot)
        // it('makes the user a moderator', () => {
        //   testInfo.config.testName = 'makes user a moderator';
        //   // Wait for the events associated with a new membership before completing test..
        //   membershipUpdateEvent = new Promise((resolve) => {
        //     frameworkMembershipUpdatedHandler(testInfo.config.testName, framework, testInfo, resolve);
        //   });
        //   frameworkMemberAddedAsModerator = new Promise((resolve) => {
        //     frameworkMemberAddedAsModeratorHandler(testInfo.config.testName, framework, testInfo, resolve);
        //   });
        //   botMemberAddedAsModerator = new Promise((resolve) => {
        //     botCreatedRoomBot.memberAddedAsModerator(testInfo.config.testName, testInfo, resolve);
        //   });

        //   // Add the non-bot user to the space with the bot
        //   return botCreatedRoomBot.moderatorSet(user.emails[0])
        //     .then((emails) => {
        //       assert((emails[0] === user.emails[0]),
        //         'bot.add did not return the expected email');
        //       // Wait for all the event handlers to fire
        //       return when.all([membershipUpdateEvent, frameworkMemberAddedAsModerator, botMemberAddedAsModerator]);
        //     })
        //     // .then(() => {
        //     //   // triggers.push(testInfo.trigger);
        //     //   // assert(validator.objIsEqual(message, testInfo.message),
        //     //   //   'message returned by API did not match the one from the messageCreated event');
        //     //   return heard;
        //     // })
        //     .catch((e) => {
        //       console.error(`${testInfo.config.testName} failed: ${e.message}`);
        //       return Promise.reject(e);
        //     });
        // });

        it('removes a user from the room', () => {
          testInfo.config.testName = 'bot removes the user from the room';
          return common.botRemoveUserFromSpace(framework, testInfo, common.userPerson.emails[0]);
        });

        it('renames the test room', () => {
          testInfo.config.testName = 'renames the test room';

          // Wait for the events associated with a new message before completing test..
          roomUpdatedEvent = new Promise((resolve) => {
            common.frameworkRoomUpdatedEventHandler(framework, testInfo, resolve);
          });

          roomRenamedEvent = new Promise((resolve) => {
            common.frameworkRoomRenamedEventHandler(framework, testInfo, resolve);
          });

          return testInfo.config.botUnderTest.roomRename('This room has been renamed')
            .then(() => {
              return when.all([roomUpdatedEvent, roomRenamedEvent]);
            })
            .catch((e) => {
              console.error(`${testInfo.config.testName} failed: ${e.message}`);
              return Promise.reject(e);
            });
        });      
      });
    });
    // TODO - are there any analytics in the storage that I can check for after
    // these tests have run?
  });
});