const { CommandBuilder, Plugins } = require("erine");
const Logger = require("../../src/core/logger");
const log = new Logger("CMD_ADMIN", process.env.LOG_LEVEL);

const data = {
  data: new CommandBuilder({
    name: "admin",
    description: "Comandos de administración del bot.",
    as_prefix: true,
    as_slash: false,
  }),
  plugins: [Plugins.isOwner],
  async code(ctx) {
    const args = ctx.args;
    const sub = args?.[0]?.toLowerCase();

    if (sub === "roleconnections") {
      await ctx.send("⏳ Actualizando role connections metadata...");
      try {
        const res = await fetch(
          `https://discord.com/api/v10/applications/${process.env.CLIENT_ID}/role-connections/metadata`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bot ${process.env.TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify([
              { key: "servidores", name: "Servidores", description: "Servidores", type: 2 },
            ]),
            signal: AbortSignal.timeout(15000),
          }
        );

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status} ${body.slice(0, 100)}`);
        }

        log.info("Role connections metadata actualizada via comando admin");
        await ctx.send("✅ Role connections metadata actualizada.");
      } catch (err) {
        log.error("Error al actualizar role connections metadata", { err: err.message });
        await ctx.send(`❌ Error: ${err.message.slice(0, 200)}`);
      }
      return;
    }

    await ctx.send("**Subcomandos disponibles:**\n`admin roleconnections` — Actualiza role connections metadata");
  },
};

module.exports = { data };
