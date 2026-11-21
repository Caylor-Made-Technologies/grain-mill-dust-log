(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const H = 36e5, DAY = 864e5;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const startOfDay = t => { const d = new Date(t); d.setHours(0,0,0,0); return d.getTime(); };
const fmtDate = t => new Date(t).toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric', year:'numeric'});
const fmtShort = t => new Date(t).toLocaleDateString(undefined, {month:'short', day:'numeric'});
const fmtTime = t => new Date(t).toLocaleTimeString(undefined, {hour:'numeric', minute:'2-digit'});
function when(t){
  const d = Math.round((startOfDay(Date.now()) - startOfDay(t)) / DAY);
  if (d === 0) return 'Today ' + fmtTime(t);
  if (d === 1) return 'Yesterday ' + fmtTime(t);
  return fmtShort(t) + ' ' + fmtTime(t);
}

/* ---------- data ---------- */
const FREQ = {shift:'Every shift', daily:'Daily', weekly:'Weekly', monthly:'Monthly'};
const COND = {clean:'Clean', light:'Light dust', heavy:'Heavy buildup'};
const ACT = {none:'No action needed', cleaned:'Cleaned', followup:'Needs follow-up'};
const METH = {hepa:'HEPA vacuum', brush:'Brush / sweep', wet:'Wet wipe', other:'Other'};

const defaultAreas = () => [
  ['Mixing room floor','daily','Floor around mixers, under equipment and along walls.'],
  ['Mixer and hopper surfaces','daily','Tops, lids, flanges and ledges on and around the mixers.'],
  ['Sifters and purifiers','daily','Outer housings, frames, and the floor beneath them.'],
  ['Packaging line','daily','Fillers, conveyors, scales and the floor around them.'],
  ['Dust collector and hoppers','daily','Collector housing, hopper area, and any spilled product.'],
  ['Forklift and traffic aisles','daily','Dust tracked along travel paths and at doorways.'],
  ['Stairs, walkways and platforms','weekly','Grating, handrails and landings above the main floor.'],
  ['Bins and silo area','weekly','Bin tops, spouts, and surrounding floor.'],
  ['Elevator leg and boot area','weekly','Leg casing, boot pit and nearby floor.'],
  ['Motors, bearings and drives','weekly','Dust packed around motors, vents, bearings and gearboxes.'],
  ['Electrical panels and enclosures','weekly','Outsides of panels, conduit tops and junction boxes.'],
  ['Ductwork and duct joints','monthly','Duct runs, flanges and joints, especially horizontal sections.'],
  ['Rafters, beams and pipe runs','monthly','Overhead steel, pipes and light fixtures. Check from a safe position.']
].map((a, i) => ({id:'a' + (i + 1), name:a[0], freq:a[1], hint:a[2]}));

let storageOK = true;
let state = load();
function fresh(){ return {schema: DustStore.SCHEMA, plant:'', shift:'Day', operator:'', areas:defaultAreas(), entries:[]}; }
// Saved data is versioned (migrate.js): a v1 log is upgraded to v2 once, and the v1 copy is kept as a backup.
function load(){
  const r = DustStore.load(localStorage_());
  storageOK = r.ok;
  return r.state ? Object.assign(fresh(), r.state) : fresh();
}
function localStorage_(){ try { return window.localStorage; } catch (e) { return { getItem(){ throw e; }, setItem(){ throw e; }, removeItem(){} }; } }
function save(){
  if (!DustStore.save(localStorage_(), state) && storageOK) { storageOK = false; renderBanner(); }
}

/* photos live in IndexedDB so the log itself stays small; memory fallback */
const photos = (() => {
  const mem = new Map(); let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    try { const r = indexedDB.open('milldust-photos', 1); r.onupgradeneeded = () => r.result.createObjectStore('p'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }
    catch (e) { rej(e); }
  }));
  return {
    async put(id, blob){ mem.set(id, blob); try { const db = await open(); await new Promise((res, rej) => { const t = db.transaction('p', 'readwrite'); t.objectStore('p').put(blob, id); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch (e) {} },
    async get(id){ if (mem.has(id)) return mem.get(id); try { const db = await open(); return await new Promise((res, rej) => { const r = db.transaction('p').objectStore('p').get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); }); } catch (e) { return null; } }
  };
})();
function shrink(file, max = 900){
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob(b => b ? res(b) : rej(new Error('encode')), 'image/jpeg', .7);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('load')); };
    img.src = url;
  });
}

/* ---------- status logic ---------- */
function lastEntry(areaId){ let b = null; for (const e of state.entries) if (e.areaId === areaId && (!b || e.ts > b.ts)) b = e; return b; }
function openIssues(){ return state.entries.filter(e => e.action === 'followup' && !e.resolved).sort((a, b) => b.ts - a.ts); }
function dueStatus(area, now = Date.now()){
  const le = lastEntry(area.id); if (!le) return 'due';
  const age = now - le.ts;
  if (area.freq === 'shift') return age < 8 * H ? 'ok' : age < 16 * H ? 'due' : 'overdue';
  if (area.freq === 'daily') { const d = Math.round((startOfDay(now) - startOfDay(le.ts)) / DAY); return d <= 0 ? 'ok' : d === 1 ? 'due' : 'overdue'; }
  if (area.freq === 'weekly') return age < 7 * DAY ? 'ok' : age < 14 * DAY ? 'due' : 'overdue';
  return age < 30 * DAY ? 'ok' : age < 60 * DAY ? 'due' : 'overdue';
}
const STATUS = {ok:['ok','✓ Done'], due:['due','Due'], overdue:['bad','! Overdue']};
const pill = (cls, txt) => `<span class="pill ${cls}">${esc(txt)}</span>`;
const condPill = c => pill(c === 'clean' ? 'ok' : c === 'light' ? 'due' : 'bad', COND[c] || c);

/* ---------- views ---------- */
let view = 'today', range = '7';
const TABS = [['today','Today'], ['log','Log'], ['report','Report'], ['areas','Areas']];

function renderBanner(){
  $('#banner').innerHTML = storageOK ? '' : '<div class="banner">This browser is not saving data. Entries will be lost when you close the page. Try a normal (not private) window.</div>';
}
function renderTabs(){
  const n = openIssues().length;
  $('#tabs').innerHTML = TABS.map(([k, l]) => `<button data-act="tab" data-k="${k}" ${view === k ? 'aria-current="page"' : ''}>${l}${k === 'today' && n ? `<span class="count" aria-label="${n} open follow-ups">${n}</span>` : ''}</button>`).join('');
}
function render(){
  renderBanner(); renderTabs();
  const v = $('#view');
  v.innerHTML = ({today:todayHTML, log:logHTML, report:reportHTML, areas:areasHTML})[view]();
  hydratePhotos(v);
  if (view === 'today') mountPlant(); else window.DustPlant?.dispose();
  window.scrollTo(0, 0);
}
function floorModel(){
  const issues = openIssues();
  return DustZones.buildZones(state.areas, (a) => ({ last: lastEntry(a.id), open: issues.filter(e => e.areaId === a.id).length, status: dueStatus(a) }));
}
function mountPlant(){
  const host = $('#plant');
  if (host && window.DustPlant) window.DustPlant.mount(host, floorModel(), openSheet);
}

function todayHTML(){
  const now = Date.now();
  const rows = state.areas.map(a => ({a, st:dueStatus(a, now), le:lastEntry(a.id), open:openIssues().filter(e => e.areaId === a.id).length}));
  const ord = {overdue:0, due:1, ok:2};
  rows.sort((x, y) => ord[x.st] - ord[y.st] || state.areas.indexOf(x.a) - state.areas.indexOf(y.a));
  const done = rows.filter(r => r.st === 'ok').length;
  const issues = openIssues();
  return `
  <div class="top">
    <div><h1>Dust &amp; Debris Log</h1><div class="sub">${esc(state.plant || 'Housekeeping inspections')} · ${fmtDate(now)}</div></div>
    <div class="shift"><label for="shift">Shift</label>
      <select id="shift" data-bind="shift">${['Day','Swing','Night'].map(s => `<option ${state.shift === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
  </div>
  <section class="card hero" aria-labelledby="floorTitle">
    <div class="hero-head"><h2 id="floorTitle">Plant floor</h2><p class="hero-count"><b>${done} of ${rows.length}</b> areas current</p></div>
    <div id="plant" class="plant"></div>
    <p class="hero-tip">Color = dust left × how overdue. Tap a zone to log it.</p>
    <ul class="legend" aria-label="What the colors mean (dust left times how overdue)">${Object.entries(DustZones.LEVELS).map(([k, l]) => `<li><i class="sw sw-${k}" aria-hidden="true"></i>${esc(l.label)}</li>`).join('')}</ul>
  </section>
  ${issues.length ? `<h2 class="sec">Open follow-ups (${issues.length})</h2><div>${issues.map(issueHTML).join('')}</div>` : ''}
  <h2 class="sec">Inspection areas</h2>
  ${rows.length ? `<div class="list">${rows.map(r => `
    <button class="area ${r.st === 'overdue' ? 'overdue' : ''}" data-act="open-area" data-id="${esc(r.a.id)}">
      <span class="main"><div class="name">${esc(r.a.name)}</div>
        <div class="meta">${FREQ[r.a.freq]} · ${r.le ? 'Last: ' + when(r.le.ts) + ' by ' + esc(r.le.operator) : 'Not logged yet'}</div>
        ${r.open ? `<span class="pill flag">${r.open} open follow-up${r.open > 1 ? 's' : ''}</span>` : ''}</span>
      ${pill(STATUS[r.st][0], STATUS[r.st][1])}
    </button>`).join('')}</div>` : '<div class="empty">No areas yet. Add your first one on the Areas tab.</div>'}`;
}
function issueHTML(e){
  return `<div class="card issue"><div class="head"><span class="title">${esc(e.area)}</span>${condPill(e.condition)}</div>
    <div class="meta">Flagged ${when(e.ts)} by ${esc(e.operator)}${e.shift ? ' · ' + esc(e.shift) + ' shift' : ''}</div>
    ${e.note ? `<p class="note">${esc(e.note)}</p>` : ''}
    ${e.photo ? `<img class="thumb" alt="Photo of ${esc(e.area)}" data-photo="${esc(e.photo)}" data-act="lightbox">` : ''}
    <div><button class="btn small" data-act="resolve" data-id="${esc(e.id)}">Mark resolved</button></div></div>`;
}
function entryHTML(e){
  return `<div class="card stack tight"><div class="head"><span class="title">${esc(e.area)}</span><span class="meta">${fmtTime(e.ts)}</span></div>
    <div class="tags">${condPill(e.condition)}${pill(e.action === 'followup' ? (e.resolved ? 'ok' : 'bad') : 'due', e.action === 'followup' && e.resolved ? 'Follow-up resolved' : ACT[e.action])}${e.method ? pill('due', METH[e.method]) : ''}</div>
    <div class="meta">${esc(e.operator)}${e.shift ? ' · ' + esc(e.shift) + ' shift' : ''}${e.resolved ? ' · resolved ' + when(e.resolved.ts) + ' by ' + esc(e.resolved.by) : ''}</div>
    ${e.note ? `<p class="note">${esc(e.note)}</p>` : ''}
    ${e.photo ? `<img class="thumb" alt="Photo of ${esc(e.area)}" data-photo="${esc(e.photo)}" data-act="lightbox">` : ''}</div>`;
}
function logHTML(){
  const list = [...state.entries].sort((a, b) => b.ts - a.ts);
  let out = '<div class="top"><div><h1>Log</h1><div class="sub">Entries can’t be edited. Add a new entry to correct one.</div></div></div>';
  if (!list.length) return out + '<div class="empty">Nothing logged yet. Tap an area on the Today tab to record your first inspection.</div>';
  let day = '';
  for (const e of list.slice(0, 200)) {
    const d = fmtDate(e.ts);
    if (d !== day) { day = d; out += `<div class="day">${d}</div>`; }
    out += entryHTML(e);
  }
  if (list.length > 200) out += `<div class="meta">Showing the newest 200 of ${list.length}. Use Report for the full range.</div>`;
  return out;
}

function inRange(){
  const now = Date.now();
  const from = range === 'today' ? startOfDay(now) : range === 'all' ? 0 : now - (+range) * DAY;
  return state.entries.filter(e => e.ts >= from).sort((a, b) => b.ts - a.ts);
}
const RANGES = {today:'Today', 7:'Last 7 days', 30:'Last 30 days', all:'All time'};
function reportHTML(){
  const es = inRange();
  const cleaned = es.filter(e => e.action === 'cleaned').length;
  const heavy = es.filter(e => e.condition === 'heavy').length;
  const cov = state.areas.map(a => { const mine = es.filter(e => e.areaId === a.id); const le = lastEntry(a.id); return {a, n:mine.length, heavy:mine.filter(e => e.condition === 'heavy').length, le, st:dueStatus(a)}; });
  return `
  <div class="top"><div><h1>Report</h1><div class="sub">${esc(state.plant || 'Housekeeping inspections')}</div></div>
    <div class="shift"><label for="range">Range</label><select id="range" data-bind="range">${Object.entries(RANGES).map(([k, l]) => `<option value="${k}" ${range === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
  <div class="stats">
    <div class="stat"><b>${es.length}</b><span>Inspections logged</span></div>
    <div class="stat"><b>${cleaned}</b><span>Cleanings done</span></div>
    <div class="stat"><b>${heavy}</b><span>Heavy buildup findings</span></div>
    <div class="stat"><b>${openIssues().length}</b><span>Open follow-ups now</span></div>
  </div>
  <div class="row-actions"><button class="btn primary" data-act="copy-csv">Copy as CSV</button></div>
  <div id="csvwrap"></div>
  <h2 class="sec">Area coverage</h2>
  <div class="scroll" role="region" aria-label="Area coverage table" tabindex="0"><table><thead><tr><th>Area</th><th>Frequency</th><th>Entries</th><th>Heavy</th><th>Last logged</th><th>Status</th></tr></thead><tbody>
    ${cov.map(c => `<tr><td class="wrap">${esc(c.a.name)}</td><td>${FREQ[c.a.freq]}</td><td>${c.n}</td><td>${c.heavy}</td><td>${c.le ? when(c.le.ts) : '—'}</td><td>${pill(STATUS[c.st][0], STATUS[c.st][1])}</td></tr>`).join('') || '<tr><td colspan="6">No areas.</td></tr>'}
  </tbody></table></div>
  <h2 class="sec">Entries (${es.length})</h2>
  ${es.length ? `<div class="scroll" role="region" aria-label="Entries table" tabindex="0"><table><thead><tr><th>When</th><th>Area</th><th>Found</th><th>Action</th><th>By</th><th>Note</th></tr></thead><tbody>
    ${es.map(e => `<tr><td>${fmtShort(e.ts)} ${fmtTime(e.ts)}</td><td class="wrap">${esc(e.area)}</td><td>${COND[e.condition]}</td><td>${ACT[e.action]}${e.method ? ' · ' + METH[e.method] : ''}${e.resolved ? ' (resolved)' : ''}</td><td>${esc(e.operator)}</td><td class="wrap">${esc(e.note)}</td></tr>`).join('')}
  </tbody></table></div>` : '<div class="empty">No entries in this range.</div>'}`;
}
function csvCell(v){ let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
function buildCSV(){
  const head = ['Date','Time','Area','Operator','Shift','Condition found','Action','Method','Note','Photo attached','Follow-up resolved'];
  const rows = inRange().slice().reverse().map(e => [new Date(e.ts).toLocaleDateString(), fmtTime(e.ts), e.area, e.operator, e.shift || '', COND[e.condition], ACT[e.action], e.method ? METH[e.method] : '', e.note || '', e.photo ? 'Yes' : 'No', e.resolved ? new Date(e.resolved.ts).toLocaleString() + ' by ' + e.resolved.by : '']);
  return [head, ...rows].map(r => r.map(csvCell).join(',')).join('\n');
}

function areasHTML(){
  return `
  <div class="top"><div><h1>Areas</h1><div class="sub">Starter areas are generic examples. Rename them to match your plant.</div></div></div>
  <div class="card stack"><label class="f" for="plant">Plant or facility name<input type="text" id="plant" data-bind="plant" value="${esc(state.plant)}" placeholder="Shown at the top of the log"></label></div>
  <h2 class="sec">Inspection areas</h2>
  <div class="stack">${state.areas.map(a => `
    <div class="card area-edit">
      <input type="text" class="nm" aria-label="Area name" data-areaname="${esc(a.id)}" value="${esc(a.name)}">
      <select aria-label="How often for ${esc(a.name)}" data-areafreq="${esc(a.id)}">${Object.entries(FREQ).map(([k, l]) => `<option value="${k}" ${a.freq === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="btn small danger" data-act="remove-area" data-id="${esc(a.id)}">Remove</button>
    </div>`).join('')}</div>
  <h2 class="sec">Add an area</h2>
  <div class="card stack">
    <label class="f" for="newName">Area name<input type="text" id="newName" placeholder="e.g. Loading dock floor"></label>
    <label class="f" for="newFreq">How often<select id="newFreq">${Object.entries(FREQ).map(([k, l]) => `<option value="${k}" ${k === 'daily' ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <button class="btn primary block" data-act="add-area">Add area</button>
    <p class="err" id="addErr" hidden></p>
  </div>
  <h2 class="sec">Backup</h2>
  <div class="card stack">
    <p class="note flush">Data is stored only on this device. Copy a backup now and then and keep it somewhere safe. Photos are not included in the backup.</p>
    <button class="btn block" data-act="copy-backup">Copy backup</button>
    <label class="f" for="restore">Restore from a backup<textarea id="restore" placeholder="Paste a backup here"></textarea></label>
    <button class="btn block" data-act="restore">Restore</button>
    <p class="err" id="restoreMsg" hidden></p>
  </div>`;
}

/* ---------- entry sheet ---------- */
let sheetBlob = null, previewURL = null;
const opt = (name, val, title, sub, cls = '') => `<label class="opt ${cls}"><input type="radio" name="${name}" value="${val}"><span><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span></label>`;
function openSheet(id){
  const a = state.areas.find(x => x.id === id); if (!a) return;
  sheetBlob = null;
  $('#sheet').innerHTML = `<div class="scrim" data-act="close-sheet"></div>
  <form class="panel" id="entryForm" data-area="${esc(a.id)}" novalidate>
    <header><div><h2>${esc(a.name)}</h2>${a.hint ? `<p class="hint">${esc(a.hint)}</p>` : ''}</div><button type="button" class="x" data-act="close-sheet" aria-label="Close">✕</button></header>
    <fieldset><legend>What did you find?</legend>
      ${opt('cond', 'clean', 'Clean', 'No visible dust or debris')}
      ${opt('cond', 'light', 'Light dust', 'Thin film, surface still visible through it')}
      ${opt('cond', 'heavy', 'Heavy buildup', 'About 1/32 in. (a paper clip’s thickness) or more, or piles and spills', 'heavy')}
    </fieldset>
    <fieldset><legend>What did you do?</legend>
      ${opt('action', 'none', 'No action needed')}
      ${opt('action', 'cleaned', 'Cleaned it now')}
      ${opt('action', 'followup', 'Needs follow-up', 'Could not clean it. Flags it until someone resolves it.')}
    </fieldset>
    <fieldset class="methods-wrap" hidden><legend>How was it cleaned?</legend>
      <div class="methods">${Object.entries(METH).map(([k, l]) => opt('method', k, l)).join('')}</div>
      <p class="warn">Do not blow dust down with compressed air unless your plant’s written procedure allows it.</p>
    </fieldset>
    <label class="f" for="note">Note (optional)<textarea id="note" name="note" placeholder="Where exactly, how much, what is needed"></textarea></label>
    <div><div class="photo-row">
      <label class="btn" for="photo">Add photo</label><input type="file" id="photo" accept="image/*" capture="environment">
      <span id="photoPrev"></span></div></div>
    <label class="f" for="op">Your name<input type="text" id="op" name="op" autocomplete="name" value="${esc(state.operator)}" placeholder="First name and last initial"></label>
    <p class="err" id="formErr" role="alert" hidden></p>
    <button class="btn primary block" type="submit">Save entry</button>
  </form>`;
  $('#sheet').hidden = false;
}
function closeSheet(){ $('#sheet').hidden = true; $('#sheet').innerHTML = ''; sheetBlob = null; if (previewURL) { URL.revokeObjectURL(previewURL); previewURL = null; } }

async function submitEntry(form){
  const fd = new FormData(form), cond = fd.get('cond'), action = fd.get('action'), method = fd.get('method');
  const op = (fd.get('op') || '').trim(), err = $('#formErr');
  const fail = m => { err.textContent = m; err.hidden = false; err.scrollIntoView({block:'center'}); };
  if (!cond) return fail('Choose what you found.');
  if (!action) return fail('Choose what you did.');
  if (cond === 'heavy' && action === 'none') return fail('Heavy buildup has to be cleaned or flagged for follow-up.');
  if (action === 'cleaned' && !method) return fail('Choose how it was cleaned.');
  if (!op) return fail('Enter your name so the entry can be traced.');
  const a = state.areas.find(x => x.id === form.dataset.area); if (!a) return fail('This area was removed.');
  const e = {id:uid(), areaId:a.id, area:a.name, ts:Date.now(), operator:op, shift:state.shift, condition:cond, action, method:action === 'cleaned' ? method : '', note:(fd.get('note') || '').trim()};
  if (sheetBlob) { e.photo = uid(); await photos.put(e.photo, sheetBlob); }
  state.operator = op; state.entries.push(e); save();
  closeSheet(); render(); toast(action === 'followup' ? 'Saved and flagged for follow-up' : 'Entry saved');
}

/* ---------- helpers ---------- */
let toastT;
function toast(m){ const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); }
async function hydratePhotos(root){
  for (const img of root.querySelectorAll('img[data-photo]')) {
    const b = await photos.get(img.dataset.photo);
    if (b) img.src = URL.createObjectURL(b); else { img.replaceWith(Object.assign(document.createElement('span'), {className:'meta', textContent:'Photo not on this device'})); }
  }
}
function arm(btn, fn){
  if (btn.dataset.armed) { clearTimeout(+btn.dataset.armed); delete btn.dataset.armed; btn.textContent = btn.dataset.label; fn(); return; }
  btn.dataset.label = btn.textContent; btn.textContent = 'Tap again to confirm';
  btn.dataset.armed = setTimeout(() => { delete btn.dataset.armed; btn.textContent = btn.dataset.label; }, 3000);
}
async function copyText(text, showBox){
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
  if (showBox) { showBox.innerHTML = `<textarea class="csvbox" readonly aria-label="Text to copy"></textarea><p class="meta">Copying is blocked here. Press and hold in the box, select all, then copy.</p>`; const ta = showBox.querySelector('textarea'); ta.value = text; ta.focus(); ta.select(); }
  return false;
}

/* ---------- events ---------- */
document.addEventListener('click', async ev => {
  const t = ev.target.closest('[data-act]'); if (!t) return;
  const act = t.dataset.act, id = t.dataset.id;
  if (act === 'tab') { view = t.dataset.k; render(); }
  else if (act === 'open-area') openSheet(id);
  else if (act === 'close-sheet') closeSheet();
  else if (act === 'resolve') { const e = state.entries.find(x => x.id === id); if (e) { e.resolved = {ts:Date.now(), by:state.operator || 'Unknown'}; save(); render(); toast('Marked resolved'); } }
  else if (act === 'lightbox') { $('#lightbox img').src = t.src; $('#lightbox').hidden = false; }
  else if (act === 'copy-csv') { const ok = await copyText(buildCSV(), $('#csvwrap')); if (ok) toast('CSV copied'); }
  else if (act === 'copy-backup') { const ok = await copyText(JSON.stringify(state), $('#restoreMsg')); if (ok) toast('Backup copied'); }
  else if (act === 'restore') {
    const m = $('#restoreMsg'); m.hidden = false;
    try { const s = JSON.parse($('#restore').value); if (!s || !Array.isArray(s.areas) || !Array.isArray(s.entries)) throw 0; state = Object.assign(fresh(), DustStore.normalize(s)); save(); render(); toast('Backup restored'); }
    catch (e) { m.textContent = 'That text is not a valid backup.'; }
  }
  else if (act === 'add-area') {
    const n = $('#newName').value.trim(), er = $('#addErr');
    if (!n) { er.textContent = 'Enter a name for the area.'; er.hidden = false; return; }
    state.areas.push({id:'a' + uid(), name:n, freq:$('#newFreq').value, hint:''}); save(); render(); toast('Area added');
  }
  else if (act === 'remove-area') arm(t, () => { state.areas = state.areas.filter(a => a.id !== id); save(); render(); toast('Area removed. Past entries are kept.'); });
});
$('#lightbox').addEventListener('click', () => { $('#lightbox').hidden = true; });
document.addEventListener('submit', ev => { if (ev.target.id === 'entryForm') { ev.preventDefault(); submitEntry(ev.target); } });
document.addEventListener('input', ev => {
  const t = ev.target;
  if (t.dataset.bind === 'plant') { state.plant = t.value; save(); }
  else if (t.dataset.areaname) { const a = state.areas.find(x => x.id === t.dataset.areaname); if (a && t.value.trim()) { a.name = t.value.trim(); save(); } }
});
document.addEventListener('change', async ev => {
  const t = ev.target;
  if (t.dataset.bind === 'shift') { state.shift = t.value; save(); }
  else if (t.dataset.bind === 'range') { range = t.value; render(); }
  else if (t.dataset.areafreq) { const a = state.areas.find(x => x.id === t.dataset.areafreq); if (a) { a.freq = t.value; save(); } }
  else if (t.name === 'action') { const w = $('.methods-wrap'); if (w) w.hidden = t.value !== 'cleaned'; }
  else if (t.id === 'photo' && t.files && t.files[0]) {
    try { sheetBlob = await shrink(t.files[0]); if (previewURL) URL.revokeObjectURL(previewURL); previewURL = URL.createObjectURL(sheetBlob); $('#photoPrev').innerHTML = `<img class="preview" src="${previewURL}" alt="Photo to attach">`; }
    catch (e) { sheetBlob = null; toast('Could not read that photo'); }
  }
});
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { closeSheet(); $('#lightbox').hidden = true; } });

render();
})();

// Offline support (service worker). Not on file:// pages.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
