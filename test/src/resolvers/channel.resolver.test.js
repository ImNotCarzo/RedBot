const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveChannelFlexible } = require('../../../src/resolvers/channel.resolver');

function createCtx(fetchImpl, cacheFindImpl) {
  return {
    guild: {
      channels: {
        fetch: fetchImpl,
        cache: { find: cacheFindImpl },
      },
    },
  };
}

test('resolveChannelFlexible returns null without guild or input', async () => {
  assert.equal(await resolveChannelFlexible(null, 'x'), null);
  assert.equal(await resolveChannelFlexible({ guild: {} }, ''), null);
});

test('resolveChannelFlexible resolves by mention ID', async () => {
  const channel = { id: '123456789012345678', name: 'general' };
  const ctx = createCtx(async (id) => {
    assert.equal(id, '123456789012345678');
    return channel;
  }, () => null);

  assert.strictEqual(await resolveChannelFlexible(ctx, '<#123456789012345678>'), channel);
});

test('resolveChannelFlexible resolves by raw snowflake ID', async () => {
  const channel = { id: '123456789012345678', name: 'logs' };
  const ctx = createCtx(async () => channel, () => null);
  assert.strictEqual(await resolveChannelFlexible(ctx, '123456789012345678'), channel);
});

test('resolveChannelFlexible falls back to cache substring search and handles optional name', async () => {
  const c1 = { id: '1', name: undefined };
  const c2 = { id: '2', name: 'voice-general' };
  const ctx = createCtx(async () => { throw new Error('fail'); }, (fn) => (fn(c1) ? c1 : (fn(c2) ? c2 : null)));
  assert.strictEqual(await resolveChannelFlexible(ctx, 'general'), c2);
});

test('resolveChannelFlexible returns null when not found anywhere', async () => {
  const ctx = createCtx(async () => null, () => null);
  assert.equal(await resolveChannelFlexible(ctx, 'unknown-channel'), null);
});
