// Saved-data upgrade v1 -> v2 on a fixture written by the real v1 app
// (tests/fixtures/v1-localstorage.json: plant name, 5 entries incl. a resolved follow-up, renamed and added areas).
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, save, normalize, V1_KEY, V2_KEY, SCHEMA } = require('../../migrate.js');
const fixture = require('../fixtures/v1-localstorage.json');

class Mem { constructor(o = {}) { this.m = new Map(Object.entries(o)); } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } removeItem(k) { this.m.delete(k); } }

test('v1 log upgrades to v2 with every area and entry intact; v1 kept as backup', () => {
  const s = new Mem(fixture);
  const r = load(s);
  assert.equal(r.from, 1); assert.equal(r.ok, true);
  const v1 = JSON.parse(fixture[V1_KEY]);
  assert.equal(r.state.schema, SCHEMA);
  assert.deepEqual(r.state.areas, v1.areas);
  assert.deepEqual(r.state.entries, v1.entries); // the audit trail is unchanged, field for field
  assert.equal(r.state.plant, 'North Mill');
  assert.equal(s.getItem(V1_KEY), fixture[V1_KEY]); // untouched backup
  assert.deepEqual(JSON.parse(s.getItem(V2_KEY)), r.state);
});

test('second load reads v2 and changes nothing', () => {
  const s = new Mem(fixture);
  load(s);
  const before = new Map(s.m);
  assert.equal(load(s).from, 2);
  assert.deepEqual(s.m, before);
});

test('saves go to v2 only', () => {
  const s = new Mem(fixture);
  const { state } = load(s);
  state.entries.push({ id: 'x', areaId: 'a1', area: 'Mixing room floor', ts: 1, operator: 'A', condition: 'clean', action: 'none', method: '', note: '' });
  assert.ok(save(s, state));
  assert.equal(JSON.parse(s.getItem(V2_KEY)).entries.length, 6);
  assert.equal(s.getItem(V1_KEY), fixture[V1_KEY]);
});

test('odd or hostile data never throws and never drops a real entry', () => {
  const n = normalize({ areas: [null, { id: 'z', name: '<b>x</b>', freq: 'hourly' }], entries: [5, { id: 'e', ts: '12', condition: { a: 1 } }], plant: 7 });
  assert.equal(n.areas.length, 1); assert.equal(n.areas[0].freq, 'daily');
  assert.equal(n.entries.length, 1); assert.equal(n.entries[0].ts, 12); assert.equal(typeof n.entries[0].condition, 'string');
  assert.equal(n.plant, '7');
  assert.doesNotThrow(() => normalize(null));
  const s = new Mem({ [V1_KEY]: '{broken' });
  const r = load(s);
  assert.equal(r.state, null); assert.equal(s.getItem(V1_KEY), '{broken');
});

test('blocked storage reports not ok', () => {
  const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} };
  assert.equal(load(bad).ok, false);
  assert.equal(save(bad, {}), false);
});
