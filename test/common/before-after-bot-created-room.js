// Common Before and After logic for the initial test room
let common = require('../common/common');
let framework = common.framework;
let testInfo = common.testInfo;
let when = common.when;

module.exports = {
  registerBeforeAndAfterHooks: function() {
    let botCreatedTestRoom, botCreatedRoomBot;
    
    // Create a room as user to have test bot which will create other rooms
    before('Bot creates new room test', () => {
      testInfo.config.testName = 'Bot creates new room test';
      return common.botCreateSpace(framework, testInfo)
        .then((b) => {
          botCreatedRoomBot = b;
          testInfo.config.botUnderTest = b;
          botCreatedTestRoom = b.room;
          testInfo.config.roomUnderTest = b.room;
          return when(botCreatedRoomBot);
        });
    });
      
    // Bot deletes room
    after('bot deletes room it created',() => {
      if ((!botCreatedRoomBot) || (!botCreatedTestRoom)) {
        return Promise.resolve();
      }
      testInfo.config.testName = 'bot deletes room it created';
      testInfo.config.botUnderTest = botCreatedRoomBot;
      testInfo.config.roomUnderTest = botCreatedTestRoom;
      return common.botDeletesSpace(framework, testInfo);
    });
  }
};

