const { Schema, model, models } = require("mongoose");

const tempBanSchema = new Schema({
  guildId: { type: String, required: true },
  userId:  { type: String, required: true },
  unbanAt: { type: Date,   required: true },
});

module.exports = models.TempBan || model("TempBan", tempBanSchema);
