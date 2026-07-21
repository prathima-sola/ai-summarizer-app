const assert = require('node:assert/strict');
const { test } = require('node:test');

const { SHARE_TOKEN_PATTERN, hashShareToken } = require('../src/shares/share-service');

test('hashes capability tokens before database storage', () => {
  const token = 'a'.repeat(43);
  const hash = hashShareToken(token);
  assert.equal(SHARE_TOKEN_PATTERN.test(token), true);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, token);
  assert.equal(hashShareToken(token), hash);
});

test('rejects malformed capability tokens', () => {
  assert.equal(SHARE_TOKEN_PATTERN.test('too-short'), false);
  assert.equal(SHARE_TOKEN_PATTERN.test('a'.repeat(42) + '/'), false);
});
