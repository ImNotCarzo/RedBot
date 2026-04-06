const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DISCORD_ID_PATTERN,
  KNOWN_LANGUAGE_TOKENS,
  looksLikeLanguageToken,
  isDiscordId,
} = require('../../../src/utils/validators');

test('DISCORD_ID_PATTERN matches 17-20 digit IDs', () => {
  assert.equal(DISCORD_ID_PATTERN.test('12345678901234567'), true);
  assert.equal(DISCORD_ID_PATTERN.test('12345678901234567890'), true);
  assert.equal(DISCORD_ID_PATTERN.test('1234567890123456'), false);
  assert.equal(DISCORD_ID_PATTERN.test('123abc78901234567'), false);
});

test('looksLikeLanguageToken recognizes known tokens and is case-insensitive', () => {
  assert.equal(looksLikeLanguageToken('es'), true);
  assert.equal(looksLikeLanguageToken('InGlÉs'), true);
  assert.equal(looksLikeLanguageToken('frances'), true);
  assert.equal(looksLikeLanguageToken('xx'), false);
  assert.equal(looksLikeLanguageToken(null), false);
});

test('isDiscordId delegates to pattern', () => {
  assert.equal(isDiscordId('123456789012345678'), true);
  assert.equal(isDiscordId('not-an-id'), false);
});

test('KNOWN_LANGUAGE_TOKENS exposes expected baseline entries', () => {
  assert.equal(KNOWN_LANGUAGE_TOKENS.has('es'), true);
  assert.equal(KNOWN_LANGUAGE_TOKENS.has('en'), true);
});
