// Browser check: v1 upgrade, the plant floor in 3D and 2D (tap and keyboard), every tab axe-clean, no sideways
// scroll at 320 px, offline reload, zero console errors. Saves the 390x844 screenshots.
// Run: npm run e2e   (uses the Playwright + Chromium that come with the cloud environment)
const { chromium } = require("playwright");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "../..");
const OUT = path.join(__dirname, "../../docs/screenshots");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/\/$/, "/index.html"));
  if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
const fixture = require("../fixtures/v1-localstorage.json");
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failed++; };

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const errors = [];
  const open = async (opts = {}, seed = fixture) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, bypassCSP: true, ...opts });
    if (seed) await ctx.addInitScript((s) => { if (!localStorage.getItem("milldust.v1")) for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, seed);
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("requestfailed", (r) => errors.push("request failed: " + r.url().replace(base, "") + " " + (r.failure() || {}).errorText));
    return { ctx, page };
  };
  const axe = async (page, name) => {
    await page.addScriptTag({ content: axeSrc });
    const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map((v) => v.id + " x" + v.nodes.length + " " + v.nodes[0].target));
    check(r.length === 0, `axe ${name}: ${r.join(", ") || "clean"}`);
  };

  // 1. Real v1 data, 3D floor.
  const { ctx, page } = await open();
  await page.goto(base + "?3d=1&debug3d", { waitUntil: "networkidle" });
  const up = await page.evaluate(() => ({ v2: JSON.parse(localStorage.getItem("milldust.v2") || "null"), v1: !!localStorage.getItem("milldust.v1") }));
  check(up.v2 && up.v2.schema === 2 && up.v2.entries.length === 5 && up.v2.areas.length === 14 && up.v1, "v1 log upgraded to v2 in the browser, v1 kept");
  await page.waitForFunction(() => window.__scene3d, null, { timeout: 20000 });
  for (let i = 0, prev = -1; i < 40; i++) { const f = await page.evaluate(() => window.__scene3d.frames()); if (f === prev) break; prev = f; await page.waitForTimeout(400); }
  await page.screenshot({ path: `${OUT}/after-today-3d.png` });
  const st = await page.evaluate(() => window.__scene3d.stats());
  check(st.calls < 100 && st.triangles < 100000, `3D budget: ${st.calls} draw calls, ${st.triangles} triangles`);
  const f0 = await page.evaluate(() => window.__scene3d.frames());
  await page.waitForTimeout(1500);
  check((await page.evaluate(() => window.__scene3d.frames())) === f0, "idle floor draws 0 frames");
  const legend = await page.locator(".legend li").allTextContents();
  check(legend.length === 4, `legend shows 4 levels: ${legend.join(" / ")}`);
  await axe(page, "today");

  // Tap a zone in 3D -> its log sheet.
  const box = await page.locator(".plant-stage canvas").boundingBox();
  let opened = false;
  for (const [fx, fy] of [[0.5, 0.5], [0.45, 0.45], [0.55, 0.55], [0.4, 0.55], [0.6, 0.45]]) {
    await page.touchscreen.tap(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(400);
    if (await page.isVisible("#entryForm")) { opened = true; break; }
  }
  check(opened, "tapping a zone in 3D opens its log sheet");
  if (opened) {
    await page.screenshot({ path: `${OUT}/after-sheet.png` });
    await axe(page, "log sheet");
    await page.locator("input[name=cond][value=clean]").check({ force: true });
    await page.locator("input[name=action][value=none]").check({ force: true });
    await page.click("#entryForm button[type=submit]");
    await page.waitForTimeout(500);
    const n = await page.evaluate(() => JSON.parse(localStorage.getItem("milldust.v2")).entries.length);
    check(n === 6, `entry saved from the sheet (${n} entries)`);
  }
  for (const k of ["log", "report", "areas"]) {
    await page.click(`[data-act=tab][data-k=${k}]`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/after-${k}.png` });
    await axe(page, k);
  }
  check(!(await page.$(".plant-stage canvas")), "3D disposed when leaving Today");

  // Offline after first visit.
  await page.click("[data-act=tab][data-k=today]");
  await page.waitForTimeout(1500);
  await ctx.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(1200);
  check(await page.isVisible(".plant-stage"), "opens offline after first visit");
  await ctx.setOffline(false);
  await ctx.close();

  // 2. Reduced motion: drawing; keyboard opens a zone; 320 px.
  {
    const { ctx, page } = await open({ reducedMotion: "reduce" });
    await page.goto(base, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const mode = await page.evaluate(() => document.querySelector(".plant-stage").dataset.mode);
    check(/^2d:/.test(mode) && !(await page.$(".plant-stage canvas")), `reduced motion -> drawing (${mode})`);
    await page.screenshot({ path: `${OUT}/after-today-2d.png` });
    await page.focus(".zone");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    check(await page.isVisible("#entryForm"), "keyboard: Enter on a zone opens its log");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 320, height: 640 });
    for (const k of ["today", "log", "report", "areas"]) {
      await page.click(`[data-act=tab][data-k=${k}]`);
      const w = await page.evaluate(() => document.documentElement.scrollWidth);
      check(w <= 320, `320 px ${k}: width ${w}`);
    }
    await ctx.close();
  }

  // 3. Fresh install: empty state, no data.
  {
    const { ctx, page } = await open({}, null);
    await page.goto(base + "?3d=0", { waitUntil: "networkidle" });
    check((await page.locator(".zone").count()) === 13, "fresh install: 13 starter zones, all not logged");
    await page.screenshot({ path: `${OUT}/after-today-fresh.png` });
    await ctx.close();
  }

  check(errors.length === 0, `console errors: ${errors.length ? errors.slice(0, 4).join(" | ") : "none"}`);
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} check(s) failed` : "\nAll browser checks passed");
  process.exit(failed ? 1 : 0);
})();
