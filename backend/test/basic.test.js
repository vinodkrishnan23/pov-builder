const test = require('node:test');
const assert = require('node:assert/strict');
const { parseIsoDate, validateGranularity } = require('../server');

test('validateGranularity accepts valid values', () => {
  assert.equal(validateGranularity('hour'), true);
  assert.equal(validateGranularity('day'), true);
  assert.equal(validateGranularity('week'), true);
});

test('validateGranularity rejects invalid values', () => {
  assert.equal(validateGranularity('month'), false);
});

test('parseIsoDate parses valid ISO date', () => {
  const d = parseIsoDate('2024-01-01T00:00:00.000Z');
  assert.ok(d instanceof Date);
  assert.equal(d.toISOString(), '2024-01-01T00:00:00.000Z');
});

test('parseIsoDate rejects invalid date', () => {
  assert.equal(parseIsoDate('not-a-date'), null);
});
