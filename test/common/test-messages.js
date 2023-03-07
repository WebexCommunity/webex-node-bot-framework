/**
 * Define a common set of test messages along with data on how to set up 
 * related framework.hears() handlers to validate framework behavior.
 * 
 * @property {string} msgText - message user will send in the test
 * @property {string} msgFiles - url to a file to include in message
 * @property {array} hearsInfo - array of objects that describes a 
 *                                hears() handler to register for the test
 * 
 * @namespace {object} hearsInfo
 * Object to describe how to register a hears() handler.  Only phrase is required
 * @property {string | regex} phrase - phrase for hears handler
 * @property {string} helpstring - help message to register with handler
 * @property {integer} priority - priority of hears handler
 * @property {string} command - expected value in trigger.command
 * @property {string} prompt - expected value in trigger.prompt
 * 
 * All messages defined here will be used in the following tests:
 * - bot-created-room-tests.js   
 * - bot-membership-rules-tests.js  
 * - guide-mode-rules-tests.jus                           
 * - user-created-room-tests.js
 */

// TODO - Add some hearsInfo phrases that should not match and update the test
// framework to check that the appropriate ones have (or have not) been called
 
let testMessages = [
    {msgText: 'hi', hearsInfo: [{phrase: 'hi'}]},
    {
      msgText: `Here is a file for ya`,
      msgFiles: process.env.HOSTED_FILE,
      hearsInfo: [{phrase: /.*file.*/im}]
    },
    {
      msgText: `Here is a whole mess of stuff for ya`,
      hearsInfo: [{
        phrase: /.*/im,
        helpString: '',
        priority: 99
      }]
    },
    {
      msgText: `Here is a Some Stuff for ya`,
      hearsInfo: [
        {
          phrase: /.*Some Stuf.*/im,
          helpString: '',
          // Will fix multiple different priority tests in subsequent PR
          //priority: 2 // lower number == higher priority
        },
        {
          phrase: /.*/im,
          helpString: 'This is the catch all',
          // Will fix multiple different priority tests in subsequent PR
          //priority: 100 // lower number == higher priority
        }
      ]
    },
    {
      msgText: `echo this is the echo message`,
      hearsInfo: [
        {
          phrase: /echo\s/,
          command: 'echo ',
          prompt: 'this is the echo message',
          helpString: '',
          // Will fix multiple different priority tests in subsequent PR
          // priority: 2 // lower number == higher priority
        },
        {
          phrase: /.*/,
          command: 'echo this is the echo message',
          prompt: '',
          helpString: 'This is the catch all',
          // Will fix multiple different priority tests in subsequent PR
          //priority: 100 // lower number == higher priority
        }
      ]
    },
    {
      msgText: `just do it`,
      hearsInfo: [
        {
          phrase: /(^| )do it($| )/i,
          command: ' do it',
          prompt: 'just',
          helpString: '',
          // Will fix multiple different priority tests in subsequent PR
          // priority: 2 // lower number == higher priority
        },
        {
          phrase: /.*/,
          command: 'just do it',
          prompt: '',
          helpString: 'This is the catch all',
          // Will fix multiple different priority tests in subsequent PR
          //priority: 100 // lower number == higher priority
        }
      ]
    }
  ];

module.exports =  {testMessages}