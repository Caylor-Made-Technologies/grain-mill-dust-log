// Zone colors: dust left x how overdue, with a legend that names every level used.
const test = require('node:test');
const assert = require('node:assert/strict');
const { LEVELS, dustLeft, level, kind, buildZones } = require('../../zones.js');

test('dust left: cleaned is clean, open follow-up keeps what was found', () => {
  assert.equal(dustLeft(null, 0), null);
  assert.equal(dustLeft({ condition: 'heavy', action: 'cleaned' }, 0), 0);
  assert.equal(dustLeft({ condition: 'heavy', action: 'followup' }, 1), 2);
  assert.equal(dustLeft({ condition: 'light', action: 'none' }, 0), 1);
});

test('levels: the full dust x overdue grid', () => {
  const grid = { 0: { ok: 'good', due: 'good', overdue: 'watch' }, 1: { ok: 'good', due: 'watch', overdue: 'act' }, 2: { ok: 'watch', due: 'act', overdue: 'act' } };
  for (const d of [0, 1, 2]) for (const st of ['ok', 'due', 'overdue']) assert.equal(level(d, st), grid[d][st], `${d}/${st}`);
  assert.equal(level(null, 'ok'), 'none');
});

test('every level has a legend entry', () => {
  for (const k of ['good', 'watch', 'act', 'none']) assert.ok(LEVELS[k] && LEVELS[k].label && LEVELS[k].color);
});

test('zones: one per area, in a grid, stable order', () => {
  const areas = Array.from({ length: 14 }, (_, i) => ({ id: 'a' + i, name: ['Mixer', 'Silo', 'Packaging line', 'Floor'][i % 4], freq: 'daily' }));
  const m = buildZones(areas, () => ({ last: null, open: 0, status: 'due' }));
  assert.equal(m.zones.length, 14); assert.equal(m.cols, 4);
  assert.deepEqual(m.zones.map((z) => z.id), areas.map((a) => a.id));
  assert.ok(m.zones.every((z) => z.level === 'none'));
  assert.equal(new Set(m.zones.map((z) => `${z.x},${z.z}`)).size, 14);
  assert.equal(buildZones([], () => ({})).zones.length, 0);
  assert.equal(kind('Bins and silo area'), 'silo'); assert.equal(kind('Something new'), 'box');
});
