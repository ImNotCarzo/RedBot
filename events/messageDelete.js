const { recordDeletedMessage } = require("../src/snipe");

const event = {
  name: "messageDelete",
  once: false,
  async code(_bot, message) {
    recordDeletedMessage(message);
  },
};

module.exports = { data: event };
