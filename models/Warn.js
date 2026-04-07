const { Schema, model, models } = require("mongoose");

const warnSchema = new Schema({
  guildId:   { type: String, required: true },
  userId:    { type: String, required: true },
  moderator: { type: String, required: true },
  reason:    { type: String, default: "Sin razón", trim: true, maxlength: 512 },
  warnId:    { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

warnSchema.index({ guildId: 1, warnId: 1 }, { unique: true });
warnSchema.index({ guildId: 1, userId: 1, createdAt: -1 });

module.exports = models.Warn || model("Warn", warnSchema);
