// The plant floor, as data: one zone per inspection area, colored by how much dust is left there
// times how overdue its housekeeping is. Feeds the 3D floor (3d/plant-floor.js) and the drawing (plant.js).
(function (root) {
  'use strict';
  var DUST = { clean: 0, light: 1, heavy: 2 };
  var OVERDUE = { ok: 0, due: 1, overdue: 2 };

  /** The four colors and what they mean (the legend shows exactly these). */
  var LEVELS = {
    good: { label: 'Clean, on time', color: '#3ddc97' },
    watch: { label: 'Watch', color: '#ffb547' },
    act: { label: 'Act now', color: '#ff6b6b' },
    none: { label: 'Not logged', color: '#5b6a80' },
  };

  /**
   * Dust left in an area after its last inspection: what was found, unless it was cleaned then.
   * An open follow-up keeps the area at what was found.
   */
  function dustLeft(last, openFollowups) {
    if (!last) return null;
    if (openFollowups > 0) return DUST[last.condition] != null ? DUST[last.condition] : 2;
    if (last.action === 'cleaned') return 0;
    return DUST[last.condition] != null ? DUST[last.condition] : 1;
  }

  /** dust (0-2) + overdue (0-2): 0-1 good, 2 watch, 3-4 act. */
  function level(dust, status) {
    if (dust == null) return 'none';
    var s = dust + (OVERDUE[status] != null ? OVERDUE[status] : 1);
    return s <= 1 ? 'good' : s === 2 ? 'watch' : 'act';
  }

  /** What stands on the zone, guessed from the area's name (only changes the little model on the tile). */
  function kind(name) {
    var n = String(name || '').toLowerCase();
    if (/mixer|hopper|blender/.test(n)) return 'mixer';
    if (/silo|bin|tank/.test(n)) return 'silo';
    if (/sifter|purifier|screen/.test(n)) return 'sifter';
    if (/pack|conveyor|line|filler/.test(n)) return 'conveyor';
    if (/collector|filter|baghouse/.test(n)) return 'collector';
    if (/stair|walkway|platform|mezz/.test(n)) return 'stairs';
    if (/duct|pipe|rafter|beam|overhead/.test(n)) return 'overhead';
    if (/elevator|leg|boot/.test(n)) return 'leg';
    if (/motor|bearing|drive|gear/.test(n)) return 'motor';
    if (/electric|panel|enclosure|mcc/.test(n)) return 'panel';
    if (/forklift|aisle|dock|floor|traffic/.test(n)) return 'floor';
    return 'box';
  }

  var TILE = [1.6, 1.25], GAP = 0.22;

  /**
   * @param {{id,name,freq}[]} areas  in the order the Areas tab lists them (stable positions)
   * @param {(area) => {last: object|null, open: number, status: string}} info
   */
  function buildZones(areas, info) {
    var list = Array.isArray(areas) ? areas : [];
    var cols = list.length <= 4 ? 2 : list.length <= 9 ? 3 : 4;
    var rows = Math.max(1, Math.ceil(list.length / cols));
    var w = cols * TILE[0] + (cols - 1) * GAP, d = rows * TILE[1] + (rows - 1) * GAP;
    var zones = list.map(function (a, i) {
      var inf = info(a) || {};
      var dust = dustLeft(inf.last, inf.open || 0);
      var c = i % cols, r = Math.floor(i / cols);
      return {
        id: a.id, name: a.name, kind: kind(a.name), status: inf.status || 'due', dust: dust, level: level(dust, inf.status),
        x: -w / 2 + TILE[0] / 2 + c * (TILE[0] + GAP), z: -d / 2 + TILE[1] / 2 + r * (TILE[1] + GAP),
      };
    });
    return { zones: zones, cols: cols, rows: rows, size: [w, d], tile: TILE };
  }

  var api = { LEVELS: LEVELS, dustLeft: dustLeft, level: level, kind: kind, buildZones: buildZones };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DustZones = api;
})(typeof self !== 'undefined' ? self : this);
