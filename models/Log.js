const { Schema, model, models } = require("mongoose");

const logSchema = new Schema({
  guildId:   { type: String, required: true, unique: true },
  channelId: { type: String, required: true },
});

module.exports = models.Log || model("Log", logSchema);
