const { Schema, model, models } = require("mongoose");

const tempBanSchema = new Schema({
  guildId: { type: String, required: true },
  userId:  { type: String, required: true },
  unbanAt: { type: Date,   required: true },
}, {
  timestamps: true,
});

tempBanSchema.index({ guildId: 1, userId: 1 }, { unique: true });
tempBanSchema.index({ unbanAt: 1 });

module.exports = models.TempBan || model("TempBan", tempBanSchema);
