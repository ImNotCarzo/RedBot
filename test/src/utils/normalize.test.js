const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeReplyPayload } = require('../../../src/utils/normalize');

test('normalizeReplyPayload returns content object for string', () => {
  assert.deepEqual(normalizeReplyPayload('hola'), { content: 'hola' });
});

test('normalizeReplyPayload joins array with newlines', () => {
  assert.deepEqual(normalizeReplyPayload(['a', 'b', 'c']), { content: 'a\nb\nc' });
});

test('normalizeReplyPayload stringifies non-object values', () => {
  assert.deepEqual(normalizeReplyPayload(123), { content: '123' });
  assert.deepEqual(normalizeReplyPayload(null), { content: '' });
  assert.deepEqual(normalizeReplyPayload(undefined), { content: '' });
});

test('normalizeReplyPayload returns objects unchanged', () => {
  const payload = { embeds: [{ title: 'T' }], ephemeral: true };
  assert.strictEqual(normalizeReplyPayload(payload), payload);
});
