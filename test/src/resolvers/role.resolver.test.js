const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveRoleFlexible } = require('../../../src/resolvers/role.resolver');

function createCtx(fetchImpl, cacheFindImpl) {
  return {
    guild: {
      roles: {
        fetch: fetchImpl,
        cache: { find: cacheFindImpl },
      },
    },
  };
}

test('resolveRoleFlexible returns null without guild or input', async () => {
  assert.equal(await resolveRoleFlexible(null, 'x'), null);
  assert.equal(await resolveRoleFlexible({ guild: {} }, ''), null);
});

test('resolveRoleFlexible resolves by mention ID', async () => {
  const role = { id: '123456789012345678', name: 'admin' };
  const ctx = createCtx(async (id) => {
    assert.equal(id, '123456789012345678');
    return role;
  }, () => null);

  assert.strictEqual(await resolveRoleFlexible(ctx, '<@&123456789012345678>'), role);
});

test('resolveRoleFlexible resolves by raw snowflake ID', async () => {
  const role = { id: '123456789012345678', name: 'mod' };
  const ctx = createCtx(async () => role, () => null);
  assert.strictEqual(await resolveRoleFlexible(ctx, '123456789012345678'), role);
});

test('resolveRoleFlexible falls back to cache substring search when fetch fails', async () => {
  const role = { id: '1', name: 'Moderators' };
  const ctx = createCtx(async () => { throw new Error('fail'); }, (fn) => fn(role) ? role : null);
  assert.strictEqual(await resolveRoleFlexible(ctx, 'modera'), role);
});

test('resolveRoleFlexible returns null when not found anywhere', async () => {
  const ctx = createCtx(async () => null, () => null);
  assert.equal(await resolveRoleFlexible(ctx, 'unknown-role'), null);
});
