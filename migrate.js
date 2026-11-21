// Saved-data versions for the Dust Log.
// v1 (2026-10, key "milldust.v1"): { plant, shift, operator, areas[], entries[] }.
// v2 (key "milldust.v2"): the same shape plus `schema: 2`, with every record checked. The v1 value is left
// in place untouched as the backup of what was there before the upgrade. Entries are an audit trail:
// they are never dropped or changed, only made safe to read (types coerced, unknown values kept).
(function (root) {
  'use strict';
  var SCHEMA = 2, V1_KEY = 'milldust.v1', V2_KEY = 'milldust.v2';
  var FREQS = ['shift', 'daily', 'weekly', 'monthly'];

  function str(v, max) { return v == null ? '' : String(v).slice(0, max || 500); }
  function obj(x) { return x && typeof x === 'object' && !Array.isArray(x); }

  /** Any saved or restored log (v1 or v2) -> a valid v2 state. Never throws on odd input. */
  function normalize(s) {
    s = obj(s) ? s : {};
    var areas = (Array.isArray(s.areas) ? s.areas : []).filter(obj).map(function (a, i) {
      return { id: str(a.id || 'a' + (i + 1), 60), name: str(a.name, 80) || 'Area ' + (i + 1), freq: FREQS.indexOf(a.freq) >= 0 ? a.freq : 'daily', hint: str(a.hint, 200) };
    });
    var entries = (Array.isArray(s.entries) ? s.entries : []).filter(obj).map(function (e) {
      var out = {};
      for (var k in e) if (Object.prototype.hasOwnProperty.call(e, k)) out[k] = e[k];
      out.id = str(e.id, 60); out.areaId = str(e.areaId, 60); out.area = str(e.area, 80);
      out.operator = str(e.operator, 80); out.shift = str(e.shift, 20); out.note = str(e.note, 2000);
      out.condition = str(e.condition, 20); out.action = str(e.action, 20); out.method = str(e.method, 20);
      out.ts = Number.isFinite(+e.ts) ? +e.ts : 0;
      if (obj(e.resolved)) out.resolved = { ts: Number.isFinite(+e.resolved.ts) ? +e.resolved.ts : 0, by: str(e.resolved.by, 80) };
      else delete out.resolved;
      if (e.photo) out.photo = str(e.photo, 60); else delete out.photo;
      return out;
    });
    return { schema: SCHEMA, plant: str(s.plant, 80), shift: str(s.shift, 20) || 'Day', operator: str(s.operator, 80), areas: areas, entries: entries };
  }

  /**
   * Read the log from a Storage-like object, upgrading v1 once.
   * @returns {{ state: object|null, from: number, ok: boolean }} state null = nothing saved yet
   */
  function load(store) {
    try {
      var v2 = store.getItem(V2_KEY);
      if (v2) { var p = JSON.parse(v2); if (obj(p)) return { state: normalize(p), from: 2, ok: true }; }
      var v1 = store.getItem(V1_KEY);
      if (v1) {
        var o = JSON.parse(v1);
        if (obj(o) && Array.isArray(o.areas) && Array.isArray(o.entries)) {
          var next = normalize(o);
          store.setItem(V2_KEY, JSON.stringify(next)); // v1 stays as it was: the backup
          return { state: next, from: 1, ok: true };
        }
      }
      store.setItem('milldust.probe', '1'); store.removeItem('milldust.probe');
      return { state: null, from: 0, ok: true };
    } catch (e) {
      return { state: null, from: 0, ok: false };
    }
  }

  function save(store, state) {
    try { store.setItem(V2_KEY, JSON.stringify(normalize(state))); return true; } catch (e) { return false; }
  }

  var api = { SCHEMA: SCHEMA, V1_KEY: V1_KEY, V2_KEY: V2_KEY, normalize: normalize, load: load, save: save };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DustStore = api;
})(typeof self !== 'undefined' ? self : this);
