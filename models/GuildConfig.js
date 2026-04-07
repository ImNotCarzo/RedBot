const { Schema, model, models } = require("mongoose");

const guildSchema = new Schema({
  guildId: { type: String, required: true, unique: true },
  prefix: {
    type: String,
    default: ".",
    trim: true,
    minlength: 1,
    maxlength: 3,
  },
}, {
  timestamps: true,
});

module.exports = models.GuildConfig || model("GuildConfig", guildSchema);
