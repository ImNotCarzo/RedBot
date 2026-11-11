const { InteractionBuilder, Interactions } = require("gralonium");

const TRANSLATE_LANGUAGES = [
  { name: "Español (es)", value: "es" },
  { name: "Inglés (en)", value: "en" },
  { name: "Portugués (pt)", value: "pt" },
  { name: "Francés (fr)", value: "fr" },
  { name: "Alemán (de)", value: "de" },
  { name: "Italiano (it)", value: "it" },
  { name: "Japonés (ja)", value: "ja" },
  { name: "Coreano (ko)", value: "ko" },
  { name: "Chino simplificado (zh-CN)", value: "zh-CN" },
  { name: "Ruso (ru)", value: "ru" },
  { name: "Árabe (ar)", value: "ar" },
  { name: "Neerlandés (nl)", value: "nl" },
];

const data = {
  data: new InteractionBuilder({
    name: "util",
    type: Interactions.Autocomplete,
  }),

  async code(interaction) {
    const subcommand = interaction.options?.getSubcommand?.(false);
    const focused = interaction.options?.getFocused?.(true);
    if (subcommand !== "translate" || focused?.name !== "idioma") return;

    const query = String(focused.value ?? "").trim().toLowerCase();
    const matches = TRANSLATE_LANGUAGES.filter(
      (lang) => !query || lang.name.toLowerCase().includes(query) || lang.value.toLowerCase().includes(query)
    );

    await interaction.respond(matches.slice(0, 25)).catch(() => {});
  },
};

module.exports = { data };
