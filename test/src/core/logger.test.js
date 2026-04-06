const test = require('node:test');
const assert = require('node:assert/strict');

const Logger = require('../../../src/core/logger');

function withPatchedConsole(fn) {
  const original = console.log;
  const calls = [];
  console.log = (...args) => calls.push(args);
  try {
    fn(calls);
  } finally {
    console.log = original;
  }
}

test('Logger emits messages at or above configured threshold', () => {
  withPatchedConsole((calls) => {
    const logger = new Logger('TEST', 'warn');
    logger.info('hidden');
    logger.warn('visible');
    logger.error('visible-error');

    assert.equal(calls.length, 2);
    assert.match(calls[0][0], /\[TEST\] WARN: visible$/);
    assert.match(calls[1][0], /\[TEST\] ERROR: visible-error$/);
  });
});

test('Logger prints JSON metadata when provided', () => {
  withPatchedConsole((calls) => {
    const logger = new Logger('META', 'debug');
    logger.debug('with-meta', { a: 1, b: 'x' });

    assert.equal(calls.length, 1);
    assert.match(calls[0][0], /\[META\] DEBUG: with-meta$/);
    assert.equal(calls[0][1], JSON.stringify({ a: 1, b: 'x' }));
  });
});

test('Logger ignores unknown severity values', () => {
  withPatchedConsole((calls) => {
    const logger = new Logger('TEST', 'debug');
    logger.log('trace', 'ignored');
    assert.equal(calls.length, 0);
  });
});

test('Logger defaults invalid level to INFO', () => {
  withPatchedConsole((calls) => {
    const logger = new Logger('TEST', 'invalid-level');
    logger.debug('hidden');
    logger.info('visible');
    assert.equal(calls.length, 1);
    assert.match(calls[0][0], /\[TEST\] INFO: visible$/);
  });
});
