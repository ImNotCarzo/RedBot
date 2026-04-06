"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.data = void 0;

const EventBuilder_js_1 = require("../classes/builders/EventBuilder.js");
const Utils_js_1 = require("../classes/Utils.js");

exports.data = {
  data: new EventBuilder_js_1.EventBuilder({
    name: "messageCreate",
    description: "Triggered when a message is created.",
    once: false,
  }),
  code: async function (bot, message) {
    await Utils_js_1.Utils.handleMessage(bot, message, false);
  },
};
