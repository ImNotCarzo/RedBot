const test = require('node:test');
const assert = require('node:assert/strict');

const { parsePrefixedArgsForSlash } = require('../../../src/utils/parsers');

test('parsePrefixedArgsForSlash maps simple string params and tracks required missing', async () => {
  const ctx = { args: ['hola'], message: { attachments: { size: 0, first: () => null } } };
  const slash = { params: { params: [
    { name: 'texto', type: 3, required: true },
    { name: 'idioma', type: 3, required: true },
  ] } };

  const out = await parsePrefixedArgsForSlash(ctx, slash, 'translate');
  assert.deepEqual(out.values, { texto: 'hola', idioma: null });
  assert.equal(out.missingRequired, true);
});

test('parsePrefixedArgsForSlash keeps last language token for translate', async () => {
  const ctx = { args: ['hola', 'mundo', 'en'], message: { attachments: { size: 0, first: () => null } } };
  const slash = { params: { params: [
    { name: 'texto', type: 3, required: true },
    { name: 'idioma', type: 3, required: true },
  ] } };

  const out = await parsePrefixedArgsForSlash(ctx, slash, 'translate');
  assert.deepEqual(out.values, { texto: 'hola mundo', idioma: 'en' });
  assert.equal(out.missingRequired, false);
});

test('parsePrefixedArgsForSlash joins all remaining words for resume string param', async () => {
  const ctx = { args: ['linea', 'uno', 'dos'], message: { attachments: { size: 0, first: () => null } } };
  const slash = { params: { params: [{ name: 'texto', type: 3, required: true }] } };

  const out = await parsePrefixedArgsForSlash(ctx, slash, 'resume');
  assert.deepEqual(out.values, { texto: 'linea uno dos' });
  assert.equal(out.missingRequired, false);
});

test('parsePrefixedArgsForSlash resolves member via helper and consumes token only on success', async () => {
  const member = { id: 'm1', user: { username: 'user' } };
  const slash = { params: { params: [
    { name: 'miembro', type: 6, required: true },
    { name: 'texto', type: 3, required: false },
  ] } };

  const ctx1 = {
    args: ['@ok', 'resto'],
    guild: { members: { fetch: async () => null, cache: { find: () => null } } },
    message: {
      attachments: { size: 0, first: () => null },
      mentions: { members: { size: 1, first: () => member } },
    },
  };
  const out1 = await parsePrefixedArgsForSlash(ctx1, slash, 'x');
  assert.deepEqual(out1.values, { miembro: member, texto: 'resto' });

  const ctx2 = {
    args: ['@bad'],
    guild: { members: { fetch: async () => null, cache: { find: () => null } } },
    message: {
      attachments: { size: 0, first: () => null },
      mentions: { members: { size: 0, first: () => null } },
    },
  };
  const out2 = await parsePrefixedArgsForSlash(ctx2, slash, 'x');
  assert.equal(out2.values.miembro, null);
  assert.equal(out2.values.texto, '@bad');
  assert.equal(out2.missingRequired, true);
});

test('parsePrefixedArgsForSlash uses message attachment and does not consume arg when attachment exists', async () => {
  const attached = { id: 'a1' };
  const ctx = {
    args: ['https://site/file.png', 'nota'],
    message: {
      attachments: {
        size: 1,
        first: () => attached,
      },
    },
  };

  const slash = { params: { params: [
    { name: 'archivo', type: 11, required: true },
    { name: 'nota', type: 3, required: false },
  ] } };

  const out = await parsePrefixedArgsForSlash(ctx, slash, 'x');
  assert.strictEqual(out.values.archivo, attached);
  assert.equal(out.values.nota, 'https://site/file.png nota');
  assert.equal(out.missingRequired, false);
});

test('parsePrefixedArgsForSlash consumes URL arg for attachment when no message attachment exists', async () => {
  const ctx = {
    args: ['https://site/file.png', 'nota'],
    message: {
      attachments: {
        size: 0,
        first: () => null,
      },
    },
  };

  const slash = { params: { params: [
    { name: 'archivo', type: 11, required: true },
    { name: 'nota', type: 3, required: false },
  ] } };

  const out = await parsePrefixedArgsForSlash(ctx, slash, 'x');
  assert.equal(out.values.archivo?.url, 'https://site/file.png');
  assert.equal(out.values.nota, 'nota');
  assert.equal(out.missingRequired, false);
});
