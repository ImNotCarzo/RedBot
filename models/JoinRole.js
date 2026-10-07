const { Schema, model, models } = require("mongoose");

const joinRoleSchema = new Schema({
  guildId:    { type: String, required: true, unique: true },
  roleId:     { type: String, required: true },
  ignoreBots: { type: Boolean, default: false },
}, {
  timestamps: true,
});

module.exports = models.JoinRole || model("JoinRole", joinRoleSchema);
