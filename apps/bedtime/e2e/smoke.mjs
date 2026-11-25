// Browser smoke test for the bedtime site (Playwright + Chromium, not a project dependency).
//   node apps/bedtime/e2e/smoke.mjs [baseUrl] [--shots <dir>] [--scale 2]
// Needs the site and goldstein-api running (npm run dev:api + npm run dev:bedtime, or
// `npm run preview -w @goldstein/bedtime`). Audio requests to the media host are answered with a
// generated silent WAV, so the test does not depend on the network.
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require(join(process.execPath, "..", "..", "lib", "node_modules", "playwright")));
}

const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith("http")) ?? "http://localhost:4321").replace(/\/$/, "");
const shotsAt = args.indexOf("--shots");
const shots = shotsAt >= 0 ? args[shotsAt + 1] : null;
const scale = Number(args[args.indexOf("--scale") + 1] ?? 1) || 1;
if (shots) mkdirSync(shots, { recursive: true });

/** 8 kHz 8-bit mono WAV of near-silence, `sec` long. */
function wav(sec) {
  const rate = 8000;
  const n = rate * sec;
  const b = Buffer.alloc(44 + n);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28);
  b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34);
  b.write("data", 36);
  b.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) b[44 + i] = 128 + Math.round(Math.sin(i / 9) * 1);
  return b;
}
const AUDIO = wav(48 * 60);

const failures = [];
const check = (ok, msg) => {
  if (!ok) failures.push(msg);
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
};

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });

async function session(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale, colorScheme: "dark" });
  await ctx.route(/storiesmedia\.torahlearningtools\.com/, (route) => {
    const range = route.request().headers()["range"];
    const m = range && /bytes=(\d+)-(\d*)/.exec(range);
    if (!m) return route.fulfill({ status: 200, contentType: "audio/wav", body: AUDIO });
    const start = Number(m[1]);
    const end = m[2] ? Math.min(Number(m[2]), AUDIO.length - 1) : AUDIO.length - 1;
    return route.fulfill({
      status: 206,
      contentType: "audio/wav",
      headers: {
        "content-range": `bytes ${start}-${end}/${AUDIO.length}`,
        "accept-ranges": "bytes",
      },
      body: AUDIO.subarray(start, end + 1),
    });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  return { ctx, page, errors };
}
const shot = async (page, name) => {
  if (shots) await page.screenshot({ path: join(shots, `bedtime-${name}.png`) });
};

// ---- phone ----
{
  const { ctx, page, errors } = await session({ width: 390, height: 844 });
  await page.goto(`${base}/`);
  await page.waitForSelector('[data-card="little"]:not([aria-busy])', { timeout: 20000 });
  const cards = await page.$$eval("[data-card]", (els) =>
    els.filter((e) => !e.closest("li").hidden).map((e) => e.dataset.card),
  );
  check(
    cards.join(",") === "little,big,calm,adventure,mix",
    `five cards in order (${cards.join(",")})`,
  );
  const meta = await page.textContent('[data-card="little"] [data-meta]');
  check(/about .* · ages \d\+/.test(meta ?? ""), `card meta "${meta}"`);
  await shot(page, "home-phone");

  // ⋯ opens the list without playing
  await page.click('[data-card="calm"] [data-more]');
  await page.waitForSelector("[data-sheet].open");
  check(await page.$eval("#audio", (a) => a.paused), "⋯ shows the list without playing");
  await page.waitForTimeout(400);
  await shot(page, "list-phone");
  await page.click("[data-close]");
  await page.waitForTimeout(400);

  // one tap to audio
  await page.click('[data-card="calm"] [data-play]');
  await page.waitForSelector("[data-sheet].open");
  await page.waitForFunction(
    () =>
      !document.querySelector("#audio").paused &&
      document.querySelector("#audio").currentTime > 0.3,
    null,
    { timeout: 15000 },
  );
  const t = await page.evaluate(() => {
    const a = document.querySelector("#audio");
    const p = window.bedtime.player.snapshot();
    return {
      current: a.currentTime,
      start: p.playlist.items[0].start_sec,
      title: p.playlist.items[0].title,
    };
  });
  check(
    Math.abs(t.current - t.start) < 3,
    `first track starts at its start_sec (${t.current.toFixed(1)} vs ${t.start})`,
  );
  check((await page.textContent("[data-track-title]")) === t.title, "sheet shows the story title");
  check(
    await page.$eval('input[name="sleep-timer"][value="45"]', (i) => i.checked),
    "sleep timer defaults to 45",
  );
  await page.waitForTimeout(500);
  await shot(page, "player-phone");

  // next track advances inside the playlist
  await page.click("[data-next]");
  await page.waitForFunction(() => window.bedtime.player.snapshot().index === 1, null, {
    timeout: 5000,
  });
  check(true, "next story");
  // snapshot saved for Continue
  const saved = await page
    .waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("goldstein:bedtime:session.v1") ?? "null")?.v?.index === 1,
      null,
      { timeout: 5000 },
    )
    .then(() => true)
    .catch(() => false);
  check(saved, "resume snapshot written");

  // close the sheet → mini player
  await page.click("[data-close]");
  await page.waitForTimeout(400);
  check(await page.isVisible("[data-mini]"), "mini player visible");

  // earlier page keeps playing (persisted player)
  await page.click('a[href="/earlier/"]');
  await page.waitForSelector("[data-earlier]");
  await page.waitForTimeout(1500);
  check(!(await page.$eval("#audio", (a) => a.paused)), "audio keeps playing across navigation");
  const nights = await page.$$eval(".night-row", (els) => els.length);
  console.log(`     earlier: ${nights} nights`);
  await shot(page, "earlier-phone");

  // reload → Continue row
  await page.goto(`${base}/`);
  await page
    .waitForSelector("[data-continue]:not([hidden])", { timeout: 5000 })
    .catch(() => undefined);
  check(await page.isVisible("[data-continue]"), "Continue row after reload");
  await shot(page, "continue-phone");

  // night screen after 20 s without input while playing
  await page.click("[data-continue]");
  await page.waitForFunction(() => !document.querySelector("#audio").paused, null, {
    timeout: 10000,
  });
  await page.waitForTimeout(23500);
  check(await page.isVisible("[data-night]"), "night screen after 20 s");
  await shot(page, "night-phone");
  await page.mouse.click(200, 400);
  await page.waitForTimeout(300);
  check(
    !(await page.isVisible("[data-night]")) && !(await page.$eval("#audio", (a) => a.paused)),
    "first tap only reveals the controls",
  );

  await page.goto(`${base}/about/`);
  await shot(page, "about-phone");
  check(errors.length === 0, `no console errors (${errors.join(" | ")})`);
  await ctx.close();
}

// ---- desktop ----
{
  const { ctx, page, errors } = await session({ width: 1280, height: 800 });
  await page.goto(`${base}/`);
  await page.waitForSelector('[data-card="little"]:not([aria-busy])', { timeout: 20000 });
  await shot(page, "home-desktop");
  await page.click('[data-card="adventure"] [data-play]');
  await page.waitForSelector("[data-sheet].open");
  await page.waitForTimeout(800);
  await shot(page, "player-desktop");
  // deep link opens the list without autoplay
  const date = await page.evaluate(
    () => window.bedtime.player.snapshot().playlist.id.split("/")[0],
  );
  const p2 = await ctx.newPage();
  await p2.goto(`${base}/p/${date}/little/`);
  await p2.waitForSelector("[data-sheet].open", { timeout: 10000 });
  check(
    (await p2.textContent("[data-preview-title]")) === "Little Ones",
    "deep link opens Little Ones' list",
  );
  check(errors.length === 0, `no console errors on desktop (${errors.join(" | ")})`);
  await ctx.close();
}

await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall checks passed");
