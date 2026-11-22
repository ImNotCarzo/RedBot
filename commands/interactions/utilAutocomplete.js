const { InteractionBuilder, Interactions } = require("gralonium");
const { TRANSLATE_LANGUAGES } = require("../../src/shared/utils");

const data = {
  data: new InteractionBuilder({
    name: "util",
    type: Interactions.Autocomplete,
  }),

  async code(interaction) {
    const subcommand = interaction.options?.getSubcommand?.(false);
    const focused = interaction.options?.getFocused?.(true);
    if (subcommand !== "translate" || focused?.name !== "idioma") {
      await interaction.respond([]).catch(() => {});
      return;
    }

    const query = String(focused.value ?? "").trim().toLowerCase();
    const matches = TRANSLATE_LANGUAGES.filter(
      (lang) => !query || lang.name.toLowerCase().includes(query) || lang.value.toLowerCase().includes(query)
    );

    await interaction.respond(matches.slice(0, 25)).catch(() => {});
  },
};

module.exports = { data };
