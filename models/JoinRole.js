const mongoose = require("mongoose");

const joinRoleSchema = new mongoose.Schema({
  guildId:    { type: String, required: true, unique: true },
  roleId:     { type: String, required: true },
  ignoreBots: { type: Boolean, default: false },
});

const JoinRole = mongoose.models.JoinRole || mongoose.model("JoinRole", joinRoleSchema);

module.exports = JoinRole;
