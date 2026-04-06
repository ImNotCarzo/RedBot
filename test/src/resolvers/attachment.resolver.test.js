const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAttachmentFromUrl,
  resolveAttachmentInput,
} = require('../../../src/resolvers/attachment.resolver');

test('buildAttachmentFromUrl returns null for non-http input', () => {
  assert.equal(buildAttachmentFromUrl(null), null);
  assert.equal(buildAttachmentFromUrl('ftp://site/file.png'), null);
  assert.equal(buildAttachmentFromUrl('not-url'), null);
});

test('buildAttachmentFromUrl infers image content type and strips query', () => {
  const out = buildAttachmentFromUrl('https://cdn.site/path/file.PNG?x=1');
  assert.deepEqual(out, {
    name: 'file.PNG',
    url: 'https://cdn.site/path/file.PNG?x=1',
    contentType: 'image/png',
    size: 0,
  });
});

test('buildAttachmentFromUrl infers audio/video content type', () => {
  assert.equal(buildAttachmentFromUrl('https://site/a/test.mp3').contentType, 'audio/mpeg');
  assert.equal(buildAttachmentFromUrl('https://site/a/test.webm').contentType, 'video/webm');
});

test('buildAttachmentFromUrl returns null contentType for unknown extensions', () => {
  const out = buildAttachmentFromUrl('https://site/a/file.bin');
  assert.equal(out.contentType, null);
  assert.equal(out.name, 'file.bin');
});

test('resolveAttachmentInput prefers real attachment from context', () => {
  const attached = { id: 'att-1', url: 'https://discord/file' };
  const ctx = { message: { attachments: { first: () => attached } } };
  assert.strictEqual(resolveAttachmentInput(ctx, 'https://site/file.png'), attached);
});

test('resolveAttachmentInput falls back to URL token when no message attachment', () => {
  const ctx = { message: { attachments: { first: () => null } } };
  const out = resolveAttachmentInput(ctx, 'https://site/file.jpg');
  assert.equal(out.contentType, 'image/jpeg');
});
