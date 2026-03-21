const mongoose = require("mongoose");

const joinRoleSchema = new mongoose.Schema({
  guildId:    { type: String,  required: true, unique: true },
  roleId:     { type: String,  required: true },
  ignoreBots: { type: Boolean, default: false },
});

const JoinRole = mongoose.models.JoinRole || mongoose.model("JoinRole", joinRoleSchema);

const event = {
  name: "guildMemberAdd",
  async code(bot, member) {
    try {
      const config = await JoinRole.findOne({ guildId: member.guild.id });
      if (!config) return;

      if (config.ignoreBots && member.user.bot) return;

      const role = member.guild.roles.cache.get(config.roleId);
      if (!role) {
        await JoinRole.deleteOne({ guildId: member.guild.id });
        return;
      }

      if (role.position >= member.guild.members.me.roles.highest.position) return;

      await member.roles.add(role, "Rol automático al unirse");
    } catch (err) {
      console.error("[guildMemberAdd]", err);
    }
  },
};

module.exports = { data: event, JoinRole };
