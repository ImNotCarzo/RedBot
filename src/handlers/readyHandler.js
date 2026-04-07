const { REST, Routes } = require("discord.js");
const { setId }        = require("../../utils/commandIds");
const { COMMANDS_TO_UPDATE } = require("../config/constants");

/**
 * Register the `clientReady` handler on the bot.
 *
 * Responsibilities:
 * - Update role-connections metadata.
 * - Sync slash commands.
 * - Patch integration_types / contexts for specific commands.
 *
 * @param {import("gralonium").Gralonium} bot
 * @param {{ TOKEN: string, CLIENT_ID: string }} config
 * @param {import("../core/logger")} [log]
 */
function registerReadyHandler(bot, config, log) {
  bot.on("clientReady", async (readyBot) => {
    // ── Role-connections metadata ─────────────────────────────────────────
    try {
      const res = await fetch(
        `https://discord.com/api/v10/applications/${config.CLIENT_ID}/role-connections/metadata`,
        {
          method:  "PUT",
          headers: {
            Authorization:  `Bot ${config.TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([
            { key: "servidores", name: "Servidores", description: "Servidores", type: 2 },
          ]),
          signal: AbortSignal.timeout(10_000),
        }
      );

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        log?.warn(`No se pudo actualizar role connections metadata (${res.status})`, { body });
      }
    } catch (err) {
      log?.error("Error al actualizar role connections metadata", { err: err.message });
    }

    // ── Sync slash commands ───────────────────────────────────────────────
    try {
      await readyBot.sync();
      log?.info("Comandos slash sincronizados");
    } catch (err) {
      log?.error("Error al sincronizar comandos slash", { err: err.message });
    }

    // ── Patch integration_types / contexts ────────────────────────────────
    try {
      const rest     = new REST().setToken(config.TOKEN);
      const commands = await rest.get(Routes.applicationCommands(config.CLIENT_ID));

      for (const cmd of commands) {
        setId(cmd.name, cmd.id);

        if (!COMMANDS_TO_UPDATE.includes(cmd.name)) continue;

        try {
          await rest.patch(Routes.applicationCommand(config.CLIENT_ID, cmd.id), {
            body: {
              integration_types: [0, 1],
              contexts:          [0, 1, 2],
            },
          });
          log?.info(`Contextos actualizados: ${cmd.name}`);
        } catch (patchErr) {
          log?.error(`Error al actualizar contextos de ${cmd.name}`, { err: patchErr.message });
        }
      }

      log?.info("Todos los contextos actualizados");
    } catch (err) {
      log?.error("Error al actualizar contextos", { err: err.message });
    }
  });
}

module.exports = { registerReadyHandler };
