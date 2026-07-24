import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Set credentials BEFORE importing the module — it reads process.env at
// import time. Top-level await works here because server/package.json
// declares "type": "module".
process.env.ADMIN_PASSWORD = 'test-admin-pw';
process.env.ZONE_PASSWORD = 'test-zone-pw';
const { login, authAdmin, authZone } = await import('../lib/auth.js');

describe('login', () => {
  test('correct admin password returns an admin-role token that can do zone things too', () => {
    const result = login('test-admin-pw', 'key-admin');
    assert.equal(result.ok, true);
    assert.equal(result.role, 'admin');
    assert.equal(authAdmin(result.token), true);
    assert.equal(authZone(result.token), true);
  });

  test('correct zone password returns a zone-role token that CANNOT do admin things', () => {
    const result = login('test-zone-pw', 'key-zone');
    assert.equal(result.ok, true);
    assert.equal(result.role, 'zone');
    assert.equal(authAdmin(result.token), false, 'a zone token must never pass an admin-only check');
    assert.equal(authZone(result.token), true);
  });

  test('wrong password is rejected', () => {
    const result = login('totally-wrong', 'key-wrong');
    assert.equal(result.ok, false);
  });

  test('garbage/missing tokens are never authorized', () => {
    assert.equal(authAdmin('not-a-real-token'), false);
    assert.equal(authZone('not-a-real-token'), false);
    assert.equal(authAdmin(undefined), false);
    assert.equal(authAdmin(''), false);
  });

  test('locks out a key after repeated failures, even for the correct password', () => {
    const key = 'lockout-key';
    for (let i = 0; i < 6; i++) login('wrong', key); // 6 failures trips the lock
    const lockedAttempt = login('test-admin-pw', key); // 7th call — correct password, but still locked
    assert.equal(lockedAttempt.ok, false);
    assert.match(lockedAttempt.message, /too many attempts/i);
  });

  test('lockout is scoped per key, not global — an unrelated key is unaffected', () => {
    const result = login('test-admin-pw', 'a-totally-different-key');
    assert.equal(result.ok, true);
  });
});
