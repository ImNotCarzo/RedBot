const { Schema, model, models } = require("mongoose");

const warnSchema = new Schema({
  guildId:   { type: String, required: true },
  userId:    { type: String, required: true },
  moderator: { type: String, required: true },
  reason:    { type: String, default: "Sin razón" },
  warnId:    { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = models.Warn || model("Warn", warnSchema);
