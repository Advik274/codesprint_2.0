// Rules shared by admin registration and the self-registration QR flow.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateSelfRegistration, pickTeamColor, generatePasscode, TEAM_COLORS, LIMITS } from '../lib/registration.js';

const team = (name, extra = {}) => ({ name, color: '#fff', passcode: '0000', ...extra });

describe('validateSelfRegistration', () => {
  test('accepts a well-formed team and normalises whitespace', () => {
    const r = validateSelfRegistration({ name: '  Byte   Force ', year: '2nd', members: [' Aarav ', 'Priya', ''] }, []);
    assert.equal(r.ok, true);
    assert.equal(r.value.name, 'Byte Force');
    assert.equal(r.value.year, '2nd');
    assert.deepEqual(r.value.members, ['Aarav', 'Priya']);
  });

  test('rejects a missing or too-short name', () => {
    assert.equal(validateSelfRegistration({ members: ['A'] }, []).ok, false);
    assert.equal(validateSelfRegistration({ name: '   ', members: ['A'] }, []).ok, false);
    assert.equal(validateSelfRegistration({ name: 'X', members: ['A'] }, []).ok, false);
  });

  test('rejects an over-long name', () => {
    const r = validateSelfRegistration({ name: 'x'.repeat(LIMITS.NAME_MAX + 1), members: ['A'] }, []);
    assert.equal(r.ok, false);
    assert.match(r.error, /characters or fewer/);
  });

  test('rejects a duplicate name regardless of case or padding', () => {
    const existing = [team('Byte Force')];
    const r = validateSelfRegistration({ name: '  byte force ', members: ['A'] }, existing);
    assert.equal(r.ok, false);
    assert.match(r.error, /already taken/);
  });

  test('requires at least one member', () => {
    assert.equal(validateSelfRegistration({ name: 'Solo', members: [] }, []).ok, false);
    assert.equal(validateSelfRegistration({ name: 'Solo', members: ['  ', ''] }, []).ok, false);
  });

  test('caps member count and member name length', () => {
    const many = Array.from({ length: 12 }, (_, i) => `Member ${i}`);
    const r = validateSelfRegistration({ name: 'Crowd', members: [...many, 'y'.repeat(80)] }, []);
    assert.equal(r.ok, true);
    assert.equal(r.value.members.length, LIMITS.MAX_MEMBERS);
    r.value.members.forEach(m => assert.ok(m.length <= LIMITS.MEMBER_MAX_LEN));
  });

  test('falls back to 1st year for a missing or bogus year', () => {
    assert.equal(validateSelfRegistration({ name: 'A Team', members: ['A'] }, []).value.year, '1st');
    assert.equal(validateSelfRegistration({ name: 'B Team', members: ['A'], year: 'admin' }, []).value.year, '1st');
  });

  test('enforces the team cap only when one is configured', () => {
    const teams = [team('One'), team('Two')];
    assert.equal(validateSelfRegistration({ name: 'Three', members: ['A'] }, teams, {}).ok, true);
    assert.equal(validateSelfRegistration({ name: 'Three', members: ['A'] }, teams, { self_registration_max_teams: 5 }).ok, true);
    const full = validateSelfRegistration({ name: 'Three', members: ['A'] }, teams, { self_registration_max_teams: 2 });
    assert.equal(full.ok, false);
    assert.match(full.error, /full/);
  });

  test('ignores non-array members and non-string entries', () => {
    assert.equal(validateSelfRegistration({ name: 'Weird', members: 'Aarav' }, []).ok, false);
    const r = validateSelfRegistration({ name: 'Weird', members: [null, 42, 'Aarav'] }, []);
    assert.equal(r.ok, true);
    assert.deepEqual(r.value.members, ['Aarav']);
  });
});

describe('pickTeamColor', () => {
  test('returns the first unused colour', () => {
    assert.equal(pickTeamColor([]), TEAM_COLORS[0]);
    assert.equal(pickTeamColor([TEAM_COLORS[0]]), TEAM_COLORS[1]);
  });

  test('generates a hue once the palette is exhausted', () => {
    const c = pickTeamColor([...TEAM_COLORS], TEAM_COLORS.length);
    assert.match(c, /^hsl\(/);
  });
});

describe('generatePasscode', () => {
  test('is always 4 digits', () => {
    for (let i = 0; i < 50; i++) assert.match(generatePasscode([]), /^\d{4}$/);
  });

  test('avoids codes already in use', () => {
    // Leave exactly one code free and check we land on it
    const taken = [];
    for (let n = 1000; n <= 9999; n++) if (n !== 4242) taken.push(String(n));
    assert.equal(generatePasscode(taken), '4242');
  });
});
