// Common Before and After logic for the initial test room
let common = require("../common/common");
let framework = common.framework;
let userWebex = common.userWebex;
let testInfo = common.testInfo;
let User_Test_Space_Title = common.User_Test_Space_Title;
let validator = common.validator;

module.exports = {
    registerBeforeAndAfterHooks: function() {
        let userCreatedTestRoom, userCreatedRoomBot;

        // Create a room as user to have test bot which will create other rooms
        before(`Create initial test space: ${User_Test_Space_Title}`,() => {
            testInfo.config.testName = `Create initial test space: ${User_Test_Space_Title}`;
            testInfo.config.userUnderTest = userWebex;
            return userWebex.rooms.create({title: User_Test_Space_Title})
            .then((r) => {
                userCreatedTestRoom = r;
                testInfo.config.roomUnderTest = r;
                return validator.isRoom(r);
            })
        });

        // Add our bot to the room and validate that it is spawned properly
        before('Add Bot to Space',() => {
            testInfo.config.testName = 'Add Bot to Space';
            testInfo.config.roomUnderTest = userCreatedTestRoom;
            return common.addBotToSpace(framework, testInfo)
            .then((b) => {
                userCreatedRoomBot = b;
                testInfo.config.botUnderTest = b;
                return validator.isBot(b);
            })
        });

        // Bot leaves rooms
        after('Remove bot from test space', () => {
            if ((!userCreatedRoomBot) || (!userCreatedTestRoom)) {
                return Promise.resolve();
            }
            testInfo.config.botUnderTest = userCreatedRoomBot;
            testInfo.config.userUnderTest = userCreatedTestRoom;
            testInfo.config.testName = "User created bot leaves user created space"
            return common.botLeaveSpace(framework, testInfo);
        });

        // User deletes room -- cleanup
        after('Delete user created test space', () => {
            if (!userCreatedTestRoom) {
                return Promise.resolve();
            }
            return userWebex.rooms.remove(userCreatedTestRoom)
            .catch((reason) => {
                console.error('Failed to cleanup test room', reason);
                throw reason;
            });
        });
    },
}
