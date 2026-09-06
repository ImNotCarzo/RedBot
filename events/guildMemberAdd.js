const JoinRole = require("../models/JoinRole");
const Logger = require("../src/logger");
const log = new Logger("EVENT_GUILD_MEMBER_ADD", process.env.LOG_LEVEL);

const event = {
  name: "guildMemberAdd",
  once: false,
  async code(_bot, member) {
    if (!member?.guild?.id || !member?.user) return;

    const guildId = member.guild.id;
    const userId = member.user.id;

    const config = await JoinRole.findOne({ guildId }).lean();
    if (!config) return;

    if (config.ignoreBots && member.user.bot) return;

    const role = member.guild.roles.cache.get(config.roleId);
    if (!role) {
      await JoinRole.deleteOne({ guildId }).catch((err) => {
        log.warn("No se pudo limpiar configuración de rol automático inválida", {
          event: "guildMemberAdd",
          guildId,
          roleId: config.roleId,
          err: err?.message ?? String(err),
        });
      });
      return;
    }

    const me = member.guild.members.me;
    if (!me?.permissions?.has("ManageRoles")) {
      log.warn("Sin permisos para asignar rol automático", { event: "guildMemberAdd", guildId, userId, roleId: role.id });
      return;
    }
    if (role.position >= me.roles.highest.position) {
      log.warn("Rol automático por encima de la jerarquía del bot", { event: "guildMemberAdd", guildId, userId, roleId: role.id });
      return;
    }

    await member.roles.add(role, "Rol automático al unirse").catch((err) => {
      log.error("Error al asignar rol automático", {
        event: "guildMemberAdd",
        guildId,
        userId,
        roleId: role.id,
        err: err?.message ?? String(err),
      });
    });
  },
};

module.exports = { data: event };
