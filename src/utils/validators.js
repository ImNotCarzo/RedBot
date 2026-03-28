/** Discord snowflake ID pattern (17-20 digits). */
const DISCORD_ID_PATTERN = /^\d{17,20}$/;

/** Lowercase language tokens recognised by the translate command. */
const KNOWN_LANGUAGE_TOKENS = new Set([
  "es", "español", "espanol",
  "en", "inglés",  "ingles",
  "fr", "francés", "frances",
  "de", "alemán",  "aleman",
  "it", "italiano",
  "pt", "portugués", "portugues",
  "ru", "ruso",
  "ja", "japonés", "japones",
  "ko", "coreano",
  "zh", "chino",
  "ar", "árabe",   "arabe",
  "hi", "hindi",
]);

/**
 * Return true if the token looks like a BCP-47 language code or name.
 * @param {string} token
 * @returns {boolean}
 */
function looksLikeLanguageToken(token) {
  if (typeof token !== "string") return false;
  return KNOWN_LANGUAGE_TOKENS.has(token.toLowerCase());
}

/**
 * Return true if the string matches the Discord snowflake format.
 * @param {string} value
 * @returns {boolean}
 */
function isDiscordId(value) {
  return DISCORD_ID_PATTERN.test(value);
}

module.exports = { DISCORD_ID_PATTERN, KNOWN_LANGUAGE_TOKENS, looksLikeLanguageToken, isDiscordId };
