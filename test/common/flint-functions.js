// Variables an functions shared by all tests
var common = require("../common/common");
let flint = common.flint;
let assert = common.assert;
let validator = common.validator;
let when = common.when;


describe('#Flint API Checks', () => {
  it('flint.getPerson("me") returns info about my bot', () => flint.getPerson('me')
    .then((person) => {
      let bot = person;
      return when(validator.objIsEqual(bot, flint.person),
        'bot.getPerson(\'me\') does not match flint.person');
    }));

  it('returns an array of spaces', () => flint.getRooms()
    .then((rooms) => {
      let roomList = rooms;
      // We have a bot for each existing room
      assert(roomList.length === flint.bots.length);
      return when(assert(validator.isRooms(rooms),
        'getRooms did not return a list of rooms'));
    }));
});