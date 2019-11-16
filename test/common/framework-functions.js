// Variables an functions shared by all tests
var common = require("./common");
let framework = common.framework;
let assert = common.assert;
let validator = common.validator;
let when = common.when;


describe('#Framework API Checks', () => {
  it('framework.getPerson("me") returns info about my bot', () => framework.getPerson('me')
    .then((person) => {
      let bot = person;
      return when(validator.objIsEqual(bot, framework.person),
        'bot.getPerson(\'me\') does not match framework.person');
    }));

  it('returns an array of spaces', () => framework.getRooms()
    .then((rooms) => {
      let roomList = rooms;
      // We have a bot for each existing room
      assert(roomList.length === framework.bots.length);
      return when(assert(validator.isRooms(rooms),
        'getRooms did not return a list of rooms'));
    }));
});