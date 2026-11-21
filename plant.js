// The plant floor on the Today tab. A drawing of the floor paints at once (and stays on weak devices,
// without WebGL, or with Reduce Motion on); on capable devices the 3D floor (3d/plant-floor.js) loads
// after first paint and fades in over it. Tap a zone (either view) to open that area's log sheet.
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var live = null; // { view, stage }

  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  // Isometric view from the front-right, like the 3D camera.
  function iso(x, y, z) { return [(x - z) * 0.866 * 60, (-y + (x + z) * 0.5) * 60]; }

  var WORDS = { good: 'clean and on time', watch: 'needs watching', act: 'act now', none: 'not logged yet' };
  var STATUS = { ok: 'done', due: 'due', overdue: 'overdue' };

  /** The flat floor: one diamond tile per zone, keyboard and screen-reader reachable. */
  function drawing(model, onTap) {
    var svg = el('svg', { class: 'plant-svg', role: 'group', 'aria-label': 'Plant floor: one tile per area' });
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    var t = model.tile;
    // Far to near so nearer tiles overlap correctly.
    var order = model.zones.slice().sort(function (a, b) { return (a.x + a.z) - (b.x + b.z); });
    order.forEach(function (zn) {
      var hx = t[0] / 2 - 0.04, hz = t[1] / 2 - 0.04, h = 0.08;
      var P = function (dx, dy, dz) {
        var p = iso(zn.x + dx * hx, dy * h, zn.z + dz * hz);
        minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
        return p[0].toFixed(1) + ',' + p[1].toFixed(1);
      };
      var g = el('g', { class: 'zone zone-' + zn.level, role: 'button', tabindex: '0', 'data-zone': zn.id,
        'aria-label': zn.name + ': ' + WORDS[zn.level] + ' (' + (STATUS[zn.status] || zn.status) + '). Open the log' }, svg);
      el('polygon', { class: 'z-top', points: [P(-1, 1, -1), P(1, 1, -1), P(1, 1, 1), P(-1, 1, 1)].join(' ') }, g);
      el('polygon', { class: 'z-side', points: [P(1, 1, -1), P(1, 1, 1), P(1, -1, 1), P(1, -1, -1)].join(' ') }, g);
      el('polygon', { class: 'z-front', points: [P(-1, 1, 1), P(1, 1, 1), P(1, -1, 1), P(-1, -1, 1)].join(' ') }, g);
      // A simple block for the equipment on the tile (taller for silos and legs).
      var tall = { silo: 0.9, leg: 1.1, collector: 0.7, mixer: 0.55, panel: 0.6, sifter: 0.45 }[zn.kind] || 0.3;
      if (zn.kind !== 'floor') {
        var bx = 0.32, bz = 0.26;
        var Q = function (dx, dy, dz) { var p = iso(zn.x + dx * bx, h + (dy > 0 ? tall : 0), zn.z + dz * bz); minY = Math.min(minY, p[1]); return p[0].toFixed(1) + ',' + p[1].toFixed(1); };
        el('polygon', { class: 'e-top', points: [Q(-1, 1, -1), Q(1, 1, -1), Q(1, 1, 1), Q(-1, 1, 1)].join(' ') }, g);
        el('polygon', { class: 'e-side', points: [Q(1, 1, -1), Q(1, 1, 1), Q(1, -1, 1), Q(1, -1, -1)].join(' ') }, g);
        el('polygon', { class: 'e-front', points: [Q(-1, 1, 1), Q(1, 1, 1), Q(1, -1, 1), Q(-1, -1, 1)].join(' ') }, g);
      }
      var open = function () { onTap(zn.id); };
      g.addEventListener('click', open);
      g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
    var pad = 10;
    if (!isFinite(minX)) { minX = minY = 0; maxX = maxY = 10; }
    svg.setAttribute('viewBox', [minX - pad, minY - pad, maxX - minX + 2 * pad, maxY - minY + 2 * pad].map(function (n) { return n.toFixed(0); }).join(' '));
    return svg;
  }

  /** Mount (or refresh) the floor inside `host`. */
  function mount(host, model, onTap) {
    var stage = document.createElement('div');
    stage.className = 'stage3d plant-stage';
    stage.appendChild(drawing(model, onTap));
    host.replaceChildren(stage);
    if (live) { live.view.dispose(); live = null; }
    start3D(stage, model, onTap);
  }

  function start3D(stage, model, onTap) {
    import('./ui/support.js').then(function (s) {
      var gate = s.decide3D(s.probeDevice(), s.forcedMode());
      stage.dataset.mode = gate.use3D ? '3d-pending' : '2d:' + gate.reason;
      if (!gate.use3D) return null;
      return s.afterFirstPaint().then(function () { return import('./3d/plant-floor.js'); });
    }).then(function (m) {
      if (!m || !stage.isConnected) return;
      if (live) { live.view.dispose(); live = null; }
      var canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true'); // the drawing underneath stays the accessible version
      stage.appendChild(canvas);
      var view = m.mount(canvas, {
        model: model, onTap: onTap,
        onLost: function () { view.dispose(); canvas.remove(); stage.dataset.live = 'false'; stage.dataset.mode = '2d:context-lost'; live = null; },
      });
      live = { view: view, stage: stage };
      requestAnimationFrame(function () { stage.dataset.live = 'true'; });
      stage.dataset.mode = '3d';
      if (location.search.indexOf('debug3d') >= 0) window.__scene3d = view;
    }).catch(function () { stage.dataset.mode = '2d:load-failed'; });
  }

  function dispose() { if (live) { live.view.dispose(); live = null; } }

  window.DustPlant = { mount: mount, dispose: dispose, drawing: drawing };
})();
