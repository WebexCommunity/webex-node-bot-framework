/**
 * Define a common set of tests to exercise the various methods for
 * a bot to post a message to a space.   
 * 
 * @property {string} testName - Required: mocha test name
 * @property {string} botMethod - the method to use to post the message can be:
 *                                'say', 'sayWithLocalFile', 'uploadStream', 
 *                                'reply', 'replyWithSay', or 'sendCard'.  
 *                                If not set or of unknown type bot.say() will be assumed 
 * @property {bool} shouldFail - set to false if method is expected to fail, otherwise the
 *                               calling program will set this
 * @property {string} format - format string to send to bot method
 * @property {string} frameworkFormat - format string to be set in framework
 * @property {object} msgObject - msg object to post
 * @property {string} text - text string to send to bot method
 * @property {string} file - filename or url to file
 * @property {string} cardJson - path to a card JSON file to post
 * @property {string} fallback - fallback text message for sendCard call
 * @property {string} parentId - set to empty string if testing a method that acts on a
 *                               previous message like reply or censor.  Code will populate
 *                               with appropriate messageId from prior test
 * @property {string} parentObj - set to empty object if testing a method that acts on a
 *                               previous message like reply or censor.  Code will populate
 *                               with appropriate messageId from prior test
 * 
 * All messages defined here will be used in the following tests:
 * - bot-created-room-tests.js   
 * - bot-membership-rules-tests.js  
 * - guide-mode-rules-tests.jus                           
 * - user-created-room-tests.js
 * 
 * During iterative development is may be helpful to comment out all but one or
 * two problematic phrases while running tests
 */
var common = require('../common/common');
const assert = require('assert');
const when = require('when');
const { cloneDeep } = require('lodash');


module.exports = {
  // TODO what should happen if format is set with a msgObject?
  botTestMessages: [
    {
      testName: 'test sets framework.format=text: bot.say(plainText)',
      frameworkFormat: 'text',
      msgText: 'This message is plain text, inferred from framework\'s messageFormat'
    },
    {
      testName: 'test sets framework.format=markdown: bot.say(markdownText)',
      frameworkFormat: 'markdown',
      msgText: 'This message is **markdown** text, inferred from framework\'s messageFormat'
    },
    {
      testName: 'sets framework.format=text: bot.say("markdown", markdownText)',
      frameworkFormat: 'text',
      format: 'markdown',
      msgText: 'This message is **markdown** text, explicitly set in the bot.say() call'
    },
    {
      testName: 'sends a file by url: bot.say({text: msg, file: url})',
      msgObject: {
        text: 'Here is your file!',
        file: process.env.HOSTED_FILE
      }
    },
    {
      // The hardcoded name of this test is used to save the message
      // for a future reply test.  If changed, change it in runBotMessagesTest below
      testName: 'sends a message for future reply tests: bot.say(plainText)',
      frameworkFormat: 'text',
      msgText: 'This is the parent message for the reply tests'
    },
    {
      testName: 'replies to parent message it sent using parents msg obj: bot.reply(parentMsgObj, replyText)',
      botMethod: 'reply',
      parentId: '',
      msgText: 'This is the first reply, parent is referenced by ID'
    },
    {
      testName: 'sends a reply with markdown to parent message via ID: bot.reply(parentMsgId, replyMarkdown).',
      botMethod: 'reply',
      parentId: '',
      format: 'markdown',
      msgText: 'This is a reply being sent as **markdown text**'
    },
    {
      testName: 'replies via bot.say with a parentId in msgObj: bot.say(msgObjectWithParentId)',
      botMethod: 'replyWithSay',
      msgObject: {
        markdown: 'This is a reply sent via `bot.say()` using a message object with the `parentId` set.',
        parentId: 0
      }
    },
    {
      // The hardcoded name of this test is used to save the message
      // for a future reply test.  If changed, change it in runBotMessagesTest below
      testName: 'sends a reply message with a file: bot.reply(parentMsgId, replyObjWithFile)',
      botMethod: 'reply',
      parentId: '',
      msgObject: {
        text: 'This is a reply sent as a message object that includes a file attachment' +
                'Future reply tests will attempt to reply to this reply.',
        files: [process.env.HOSTED_FILE]
      }
    },
    {
      // The hardcoded name of this test is used to save the message
      // for a future reply test.  If changed, change it in runBotMessagesTest below
      testName: 'replies to parent message it sent referencing the parent by object: bot.reply(parentMsgObj, replyText)',
      botMethod: 'reply',
      parentObj: {},
      msgText: 'This is a reply to the same parent. This time parent is referenced by object.' +
                 ' All subseqent reply test will actually repy to this child message.'
    },
    {
      testName: 'replies to previous reply it sent: bot.reply(prevReplyMsgObj, replyText)',
      botMethod: 'reply',
      parentObj: {},
      msgText: 'This is a reply to the reply!'
    },
    {
      testName: 'replies to a reply with a message object: bot.reply(parentMsgObj, replyMsgObj). ' +
        'Messages from bot.reply about ignoring roomId and parentId are expected.',
      botMethod: 'reply',
      parentObj: {},
      msgObject: {
        roomId: 'this will be ignored',
        markdown: 'This is a reply sent as a message object',
        parentId: 'this will be ignored'
      }
    },
    {
      testName: 'replies a reply with a reply\'s message ID: bot.reply(parentMsgId, replyMarkdown).  SHOULD FAIL',
      botMethod: 'reply',
      parentId: '',
      shouldFail: true,
      msgText: 'This is a reply being sent as markdown text'
    },
    {
      testName: 'replies to a reply via bot.say: bot.say(msgObjectWithReplysParentId): SHOULD FAIL',
      botMethod: 'replyWithSay',
      msgObject: {
        markdown: 'This is a reply sent via `bot.say()` using a message object with the `parentId` set.',
        parentId: 0
      },
      shouldFail: true
    },
    {
      testName: 'replies to a reply and explicity sets the format: bot.reply(parentMsgObj, replyMarkdown, "markdown")',
      botMethod: 'reply',
      format: 'markdown',
      parentObj: {},
      msgText: 'This is **the final** reply, with the format set explicitly',
    },
    {
      testName: 'tries to reply with an invalid message id: bot.replay("1234", replyMsg): SHOULD FAIL',
      botMethod: 'reply',
      parentId: '1234',
      msgText: 'This reply should never be seen as the parentId is invalid.',
      shouldFail: true
    },
    {
      testName: 'sends a local file: bot.sayWithLocalFile(msg, pathToFile)',
      botMethod: 'sayWithLocalFile',
      file: './test/flint.jpg',
      msgText: 'Here is a local file'
    },
    {
      testName: 'sends a local file with an empty message: bot.sayWithLocalFile("", pathToFile)',
      botMethod: 'sayWithLocalFile',
      file: './test/flint.jpg',
      msgText: ''
    },
    {
      testName: 'sends a local file with no message: bot.sayWithLocalFile(null, pathToFile)',
      botMethod: 'sayWithLocalFile',
      file: './test/flint.jpg'
    },
    {
      testName: 'sends a non available local file: bot.sayWithLocalFile(msgText, "foo.jpg"): SHOULD FAIL',
      botMethod: 'sayWithLocalFile',
      msgText: 'This file doesn\'t exist',
      file: 'foo.jpg',
      shouldFail: true
    },
    {
      testName: 'uploads a stream: bot.uploadStream(stream)',
      botMethod: 'uploadStream',
      file: './test/flint.jpg'
    },
    {
      // The hardcoded name of this test is used to get the id of the message
      // that will be censored (deleted)
      testName: 'bot sends a message to be censored: bot.say(msgText)',
      msgText: 'This message will be censored. Don\'t blink!'
    },
    {
      testName:'bot censors the previous message: bot.censor(parentMessageId)',
      botMethod: 'censor',
      parentId: ''
    },
    {
      testName:'tries to censor a message that is already deleted: bot.censor(parentMessageId): SHOULD FAIL',
      botMethod: 'censor',
      shouldFail: true,
      parentId: ''
    },
    {
      // The hardcoded name of this test is used to get the id of the card
      // to simulate a button press.  If changed, change it in runBotMessagesTest below
      // Also note that commenting this test out will cause the 
      // subseqent attachmentAction and bot response test to fail
      testName: 'bot sends a get user info card: bot.sendCard(json, fallback)',
      botMethod: 'sendCard',
      cardJson: '../common/input-card.json',
      fallback:  'What is your name?'
    }
    // TODO add card test without fallback?
  ],

  // External helper function to iterate through all the bot message tests
  runBotMessageTests: function(framework, testInfo, botTestMessages, shouldFail=false) {
    let cardMsgId = 0;
    let parentMsg = null;
    let attachmentAction = {};

    botTestMessages.forEach((origTest) => {
      let test = cloneDeep(origTest);
      let testName = test.testName;

      // Don't use ES6 arrow functions to access mocha as this
      it(testName, function() {
        testInfo.config.testName = testName;
        if ((testInfo.config?.isDirectTest) && (!common?.botForUser1on1Space)) {
          this.skip();
        }        
        if ((('reply' == test.botMethod) || 
          ('replyWithSay' == test.botMethod) || ('censor' == test.botMethod)) &&
          (!shouldFail)) {
          assert((parentMsg?.id), `${testInfo.config.testName} did not find ` +
          'a parent message to respond to.  A previous send message test likely failed.');  
          if ('replyWithSay' == test.botMethod) {
            test.botMethod = 'say';
            test.msgObject.parentId = parentMsg.id;
          } else if ('parentId' in test) {
            test.parentId = parentMsg.id;
          } else if ('parentObj' in test) {
            test.parentObj = parentMsg;
          }
        }
        return common.botSendsMessage(framework, testInfo, test, shouldFail)
          .then((m) => {
            test.returnedMessage = m;
            // Collect message ids for user reply tests
            if (('sends a message for future reply tests: bot.say(plainText)' == test.testName)  ||
              ('sends a reply message with a file: bot.reply(parentMsgId, replyObjWithFile)' == test.testName) ||
              ('bot sends a message to be censored: bot.say(msgText)' == test.testName)) {
              parentMsg = m;
            } else if ('bot sends a get user info card: bot.sendCard(json, fallback)' == test.testName) {
              cardMsgId = m.id;
            }
            return when(m);
          });
      });
    });

    it('user presses a button on a card (two info messages from framework validate precedence in replies)', function() {
      testInfo.config.testName = 'user presses a button on a card';
      if ((testInfo.config?.isDirectTest) && (!common?.botForUser1on1Space)) {
        this.skip();
      }
      if (shouldFail) {
        // No card sent, just return
        return when(true);
      }        
      assert((cardMsgId), `${testInfo.config.testName} did not find ` +
        'a card message to respond to.  Test to send the card likely failed.');
      let person = common.getPersonInfoForUser(testInfo.config.userUnderTest);
      //todo change this to use the fetched person
      let inputs = {
        myName: (person?.displayName) ? person.displayName : 'Test User',
        myEmail: (person?.emails.length) ? person.emails[0] : 'test@email.org',
        myTel: '555-555-1234'
      };

      return common.userSendsAttachmentActionAndBotMayRespond(framework, testInfo, cardMsgId, inputs)
        .then((a) => {
          // TODO - add shouldFail logic here?
          // I think this test will simply never be executed
          attachmentAction = a;
          return when(attachmentAction);
        }).catch((e) => {
          return when.reject(new Error(`${testInfo.config.testName} failed: `+e.message));
        });
    });

    it('bot responds to card button press', function() {
      if ((testInfo.config?.isDirectTest) && (!common?.botForUser1on1Space)) { // no card to respond to in shoudlFail cases 
        this.skip();
      }   
      if (shouldFail) {
        // No card sent, just return
        return when(true);
      }             
      assert(((attachmentAction.inputs?.myName) && (attachmentAction.inputs.myEmail)),
        '"bot responds to card button press" had no valid attachmentAction object to respond to.');
      let test = {
        testName: 'bot responds to card button press',
        msgText: `Thanks. Now I know your name is ${attachmentAction.inputs.myName}, ` +
          `your email is ${attachmentAction.inputs.myEmail}, and your phone is ${attachmentAction.inputs.myTel}.`
      };
      testInfo.config.testName = test.testName;

      return common.botSendsMessage(framework, testInfo, test, shouldFail);
    });

    it('resets the test data for the next possible run', function() {
      if ((testInfo.config?.isDirectTest) && (!common?.botForUser1on1Space)) {
        this.skip();
      }        
      cardMsgId = 0;
      parentMsg = null;
      attachmentAction = {};
      return when(true);
    });
  },
};

