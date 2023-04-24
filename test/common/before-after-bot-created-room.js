// Common Before and After logic for the initial test room
let common = require("../common/common");
let framework = common.framework;
let testInfo = common.testInfo;
let when = common.when;

module.exports = {
  registerBeforeAndAfterHooks: function() {
    let botCreatedTestRoom, botCreatedRoomBot;
    let otherMembersLeftInRoom = 0;
    
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

    // Bot gets number of users in room
    after('bot gets memebership count for room it will delete', () => {
        if ((!botCreatedRoomBot) || (!botCreatedTestRoom)) {
          return Promise.resolve();
        }
        testInfo.config.testName = 'bot gets memebership count for room it will delete'
        testInfo.config.botUnderTest = botCreatedRoomBot;
        testInfo.config.roomUnderTest = botCreatedTestRoom;
        return framework.webex.memberships.list({roomId: botCreatedTestRoom.id})
          .then((memberships) => {
            otherMembersLeftInRoom = memberships.items.length - 1;
            return when(true);
          }).catch((e) => {
            e.message = `Failed to get bot created room membership before deleting it: ${e.message}`;
            return when.reject(e);
          });
      });
      

    // Bot deletes room
    after('bot deletes room it created',() => {
      if ((!botCreatedRoomBot) || (!botCreatedTestRoom)) {
        return Promise.resolve();
      }
      testInfo.config.testName = 'bot deletes room it created'
      return common.botDeletesSpace(framework, testInfo, otherMembersLeftInRoom);
    });
  }
}

