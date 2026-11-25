# Architecture: the websites monorepo

This repository holds the archive data (`data/`, `docs/`, `review/`, `tools/`, unchanged) and three websites built on it, plus the shared code they use. This document gives the decisions and the reasons for them, the layout, how data flows from `data/` to a published page, the privacy gate, the playlist system, deployment, and the rules each site team follows.

The product concepts are in `docs/sites/{bedtime,kids,library}.md`. The owner's binding decisions are in `docs/DECISIONS.md`. Where this document departs from a concept doc, it says so (§6.6, §11).

## 1. Decisions

| Area | Decision | Why |
|---|---|---|
| Workspaces | npm workspaces, one root `package-lock.json`, Node 22 (`.nvmrc`) | The owner's preference, and it matches his other monorepo (emunas). Three apps and five packages don't need pnpm, Turborepo or Nx. |
| Language | TypeScript strict everywhere: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` (`packages/config/tsconfig.base.json`) | The owner's preference. Packages are imported as `.ts` source, with no build step for packages. |
| Lint and format | Prettier (with the Astro plugin) plus `tsc`/`astro check`. No ESLint. | Kept light, as asked. The type checker catches most of what lint would. |
| Framework | **Astro 7, static output**, for all three sites | Data changes only at rebuild, and Astro builds 1,185 item pages in about 3 s per site. Islands keep pages light. `<ClientRouter />` with a `transition:persist` player gives a persistent player across page loads without making the site an SPA. The library and kids concepts both assumed this, and the owner's emunas sites use it. |
| Hosting | Cloudflare **Workers with static assets** (not Pages): one Worker per site plus **`goldstein-api`** | Pages is in maintenance mode, and Workers assets is where Cloudflare puts new features. Each site Worker serves `dist/`. Only `/playlists/*` and `/api/*` run code (`run_worker_first`), and that code forwards to `goldstein-api` through a service binding, so it is same-origin with no CORS. |
| Separate Workers vs one router | **Separate Worker per site** | Each team deploys independently, a broken deploy can't take down the other sites, and the configs stay simple. Only the playlists are shared at runtime, and they come from one API Worker. |
| Domains | `bedtimestories.`, `kidsstories.`, `storylibrary.torahlearningtools.com` (one table: `packages/config/src/sites.ts`) | Same zone as the audio host. `stories.` is already taken by another project (True Books). Generic `kids.`/`library.` would be ambiguous on a domain shared by several projects. Confirmed by the owner (no dashes), 2026-11-25. |
| Public data | Built by `packages/data` into `packages/data/generated/` (git-ignored, rebuilt by every build) | One build step that drops internal fields and masks transcripts. Apps read only this folder, never `data/`. |
| Playlists | **Generated ahead, stored and frozen in KV by a cron on `goldstein-api`** (option b) | History stays stable when the catalog is edited, and cooldowns can read 90 days back. A missed cron is covered by the 14-day runway. Details in §6. |
| Shared UI | Only `packages/player` (audio core and safe localStorage). No shared components or design tokens. | The three sites deliberately look different. The player logic (ranges, resume, Media Session, sleep timer) is the duplication worth removing. |

## 2. Layout

```
apps/
  bedtime/   Astro site + worker/index.ts (forwards /playlists, /api) + wrangler.jsonc   [bedtime team]
  kids/      same shape; item pages at /listen/<id>/                                     [kids team]
  library/   same shape; item pages at /r/<id>/                                           [library team]
packages/
  config/    tsconfig base; sites.ts: site names, hosts, Workers, item paths, CONTACT_EMAIL
  data/      public dataset build, types (the contract), privacy gate, unit pool
  playlists/ edition clock, published-file contract, recipes, generator, runway/serving logic
  player/    Player (HTMLAudioElement wrapper) + createStore (namespaced, safe localStorage)
workers/
  api/       goldstein-api: cron + KV (editions), serves /playlists/*; ./proxy = the site Worker
data/ docs/ review/ tools/   unchanged (archive data, docs, Python pipeline)
.github/     actions/setup (Node + cached node_modules), workflows/ci.yml, workflows/deploy.yml
```

Nothing under `data/`, `tools/` or `review/` moved, so `CLAUDE.md`, the READMEs and the Python scripts are still correct.

Root scripts: `npm run typecheck | test | build` (all workspaces), `npm run data:build` / `data:ensure`, `npm run privacy:gate -- <dirs>`, `npm run playlists:preview [-- --days N]`, `npm run format[:check]`, `npm run dev:api | dev:bedtime | dev:kids | dev:library`.

## 3. Data flow

```
data/recordings/**/*.meta.json ─┐
data/recordings/**/*.transcript.json ─┤  packages/data (tsx src/build/build.ts)
data/vocabulary/vocabularies.json ─┤   1. drop items with publish_recommendation = hide
data/indexes/*.json ───────────┘   2. pick public fields one by one (never copy-then-delete)
                                       3. mask transcripts (hidden spans + archive-wide terms)
                                       4. derive flags (preferred copy, content bounds...)
                                       5. build the playlist unit pool (needs quality/hidden/privacy)
                                       6. run the privacy gate on the output; fail = exit 1
                                              │
                         packages/data/generated/   (public only, git-ignored)
                                              │
      ┌──────────────────────┬────────────────┴──────────────┐
  apps/* (astro build,     workers/api (bundles units.json;     CI: privacy gate again over
  @goldstein/data/load)    cron generates editions into KV)     apps/*/dist and the API bundle
```

`npm run data:ensure` skips the build when the inputs (data files and the package's source) haven't changed, so every app's `dev`/`build` can call it cheaply.

### 3.1 The public dataset (`packages/data/generated/`)

Types live in `packages/data/src/types.ts` (import from `@goldstein/data`). Node loaders are in `@goldstein/data/load` (`loadCatalog`, `loadItem`, `loadTranscript`, `loadSearchDoc`, `loadVocab`, `loadIndex`, `loadLostEpisodes`, `loadUnitPool`, `loadManifest`).

| File | Content | Size (raw / gzip) |
|---|---|---|
| `catalog.json` | `CatalogEntry[]`: slim rows for lists, shelves and facets (1,183) | 1.56 MB / 0.30 MB |
| `items/<id>.json` | `PublicItem`: every public field of one recording (median 4.7 KB, max 12.6 KB) | 5.2 MB total / 1.4 MB |
| `transcripts/<id>.json` | `PublicTranscript`: English display transcript, `t: null` = withheld line (1,104 files) | 11.2 MB / 4.0 MB |
| `search/<id>.json` | `SearchDoc`: masked transcript lines `[start_sec, text]` for indexing (English and Yiddish; Yiddish is never displayed) | 14.4 MB / 4.9 MB |
| `vocab.json` | Public vocabularies (internal lists dropped; unconfirmed entries reduced to id + label + `unconfirmed`), ASR glossary as search synonyms | 46 KB / 13 KB |
| `indexes/{serials,story_groups,series,lost_episodes}.json` | `data/indexes` with references to excluded items removed | 134 / 136 / 11 / 24 KB |
| `units.json` | Playlist unit pool (`UnitPool`, §6.2), bundled into `goldstein-api` | 458 KB / 65 KB |
| `manifest.json` | Counts, hours, input fingerprint | |

Total about 41 MB, built in about 5 s. Measured 2026-11-25: 1,183 of 1,184 items published (1 `hide`), 414.6 hours, 5,139 of 46,089 transcript lines withheld, 483 playlist units.

Fields worth knowing:
- `duration_sec`, `content_start_sec` and `content_end_sec` are always present; the content bounds come from `quality.trim`, because the audio is never edited. Play to `content_end_sec`, and show "content ends at mm:ss" when it is less than `duration_sec`.
- `transcript.display`: `show_with_label` means a transcript file exists (label it "Automatic transcript, may contain errors"); `search_only` means Yiddish, search text only; `none` means nothing. `transcript.masked_lines` gives the number of lines withheld.
- `derived`: `preferred_copy` / `preferred_ids` (from `superseded_by`), `clip_of`, `contains`, `same_audio`, and `unconfirmed_ids` (placeholder vocabulary ids this item uses).
- `segments[]` of types `shema_guest`, `mailbox`, `announcement` and `sponsor` keep only `type`, times and a generic title ("Shema with a guest", "Mailbox", …), per the owner's decision. A site may hide more (kids also hides `opening`/`closing`/`other` titles), but never less.
- `relations[]` only point to public items.
- `slug` (`<title-slug>-<id>`) is there for sites that want readable URLs; the id is the key.

## 4. Privacy and the gate

Binding rules (DECISIONS 1–3; root `CLAUDE.md`): nothing from `hidden`, `source`, `quality`, `provenance`, `proposed_new_terms`, `identity_guesses` or `audience.privacy` is published, and transcript lines that overlap a hidden span are withheld.

**How the build enforces it** (`packages/data/src/privacy.ts`, `build/transform.ts`):
1. **Allow-list shapes.** Every public object is built field by field. A new internal field can't leak by default.
2. **Span masking.** In each item, a transcript line is withheld if it overlaps `[start_sec − 2, (end_sec ?? start_sec + 60) + 2]` of any `hidden.on_air_people|addresses|other_personal` entry. 49 hidden entries have no `end_sec`; they get 60 s.
3. **Archive-wide terms.** Names of two or more words, addresses and phone numbers are collected from every item's hidden block: 1,080 terms. Any transcript line in any item that contains one is withheld (28 lines beyond the spans), and any metadata string that contains one is redacted to "[name withheld]" (0 today; the build lists item and field so the source can be fixed).
   - Terms are matched on whole words, ignoring case, punctuation and apostrophes; phone numbers are also matched with separators removed.
   - Not scanned archive-wide: single first names ("Moshe"), parts of public names in the vocabulary ("Menachem Mendel"), lowercase non-names ("his children"), and phrases in `packages/data/privacy-allowlist.json`. Each allowlist entry needs a reason, and only the four public phrases are there today. Span masking still covers all of these. The owner accepted that first names also appear in public text (DECISIONS, "Website decisions").
4. **Unconfirmed identities.** `identity_guesses` is never emitted. Vocabulary entries marked `unconfirmed` keep only id and label; the label already says "(name unconfirmed)" or "(working title)", and aliases and descriptions are dropped. Sites render the label verbatim and never link a placeholder to a person page. `derived.unconfirmed_ids` tells a page which ids are placeholders.

**The gate** (`packages/data/src/build/gate.ts`) scans every text file under the folders it is given.
- It looks for any sensitive term, and for internal keys in JSON (`hidden`, `provenance`, `identity_guesses`, … everywhere; in the dataset also `source`, `quality`, `privacy`).
- Findings name the file and a term *number*, never the term itself, so CI logs stay clean. Locally, `--reveal` prints the term.
- It runs:
  - at the end of every data build;
  - as `packages/data/test/privacy-gate.test.ts`, in `npm test`. The test also checks span masking against the raw data, that excluded ids appear nowhere, that only English `show_with_label` items have display transcripts, the placeholder vocabulary, the generic private segments and a planted-leak self-test;
  - in CI and before every deploy, over `apps/*/dist` and the API bundle: `npm run privacy:gate -- <dirs>`.

**Rules for site code:** read only `@goldstein/data/load` / `generated/`. Never import from `data/`. Never ship the raw `segments` of private types with titles. Never display Yiddish search text. Run the gate on your `dist/`; CI does it anyway.

## 5. Shared packages

- **`@goldstein/config`**: `tsconfig.base.json`, and `sites.ts`:
  - `SITES` (name, Worker, host, `itemPath`), `itemUrl(site, id)` for cross-site links;
  - `CONTACT_EMAIL = "admin@torahlearningtools.com"`, `MEDIA_HOST`, `DEV_API_ORIGIN`.
  - Placeholder names (owner): "Lights Out Stories", "Story Shelf", "The Goldstein Story Archive". Renaming is a one-line change.
  - A test checks that every `apps/*/wrangler.jsonc` matches this table.
- **`@goldstein/data`**: the public contract (types, `formatDuration`, `slugify`, `idFromSlug`), the build, the gate, the unit pool.
- **`@goldstein/playlists`**:
  - Browser-safe entry: the published-file contract (`Edition`, `Playlist`, `PlaylistItem`, `IndexFile`), `pickEdition`, `fetchCurrentEdition`, and the clock.
  - `/engine`: recipes, `generateEdition`, `ensureRunway`, `buildViews`, `tombstone`.
  - `/testing`: a fake pool for tests.
- **`@goldstein/player`**: `Player`, which wraps one `HTMLAudioElement`.
  - Queue of `{id, title, url, start_sec?, end_sec?}`; plays exactly that range and advances at `end_sec`.
  - Resume positions per `id@start`, Media Session handlers and metadata, sleep timer, `subscribe()`.
  - `createStore(namespace)` is localStorage that never throws (memory fallback), with keys `goldstein:<site>:<key>`.
  - Each app builds its own UI on top. For persistence across navigation, kids and library keep the player's DOM in a `transition:persist` element under `<ClientRouter />`; the stub layouts show the pattern.

## 6. Tonight's playlists

### 6.1 Architecture

Recipes, units, cooldowns and file formats follow `docs/sites/bedtime.md` §4, the shared spec.

- **Clock** (`packages/playlists/src/clock.ts`, `CLOCK`): one global edition per day, flipping at **09:00 America/New_York** (DST-aware). The edition id is that civil date, e.g. `2026-11-25`. `rotationHours: 12` is a one-line change (adds a `-pm` edition 12 h later; halve the cooldowns if you do it). Owner default, DECISIONS "Website decisions".
- **Generation**: `generateEdition(pool, recipes, window, history)` is pure and deterministic: PRNG seeded with `sha256("<RECIPE_VERSION>|<edition>|<type>")`. It does:
  - the weighted fill to target ± tolerance, dedupe keys and same-type cooldowns, plus head cooldowns over the first 40 min;
  - the cross-type head rule and "no unit in two heads" within an edition;
  - at most one block (never first, never in the last 25 min);
  - relaxation (cooldowns × 0.75 up to four times, then the cross-type head rule lapses);
  - a default order (opener, then descending energy, block second) and validation.
- **Storage and freezing** (`runway.ts`, `ensureRunway`): the hourly cron on `goldstein-api` makes sure editions exist from today to +14 days in KV (`edition:<id>`, kept 400 days).
  - Editions that start within 24 h, or already started, are **frozen**.
  - Later ones are regenerated when the pool hash or recipe version changes.
  - A failed generation keeps what was stored.
  - On the first request after a fresh deploy, before the cron has run, one request fills the runway inline; while its KV lock (60 s, best-effort: KV has no compare-and-set) is set, other requests get `503` with `Retry-After: 10`.
- **Serving** (`workers/api/src/app.ts`), same-origin on every site through the site Worker's service binding:

| Path | Content | Cache-Control |
|---|---|---|
| `/playlists/index.json` | `IndexFile`: 7 past + current edition (future editions stay private) | `max-age=300, swr=3600` |
| `/playlists/editions/<id>.json` | `Edition`, only for ids listed in `index.json` (else 404) | `max-age=300, swr=600` |
| `/playlists/tonight.json` | current `Edition` | `max-age=300` |
| `/playlists/history.json` | `{nights: Edition[]}`, 7, newest first | `max-age=300` |
| `/api/health` | pool hash, counts | `no-store` |

  Clients read `index.json` and call `pickEdition` (or just `fetchCurrentEdition()`), falling back to `tonight.json`. A started playlist should be pinned in the client so a flip never interrupts playback.
- **Tombstones at read time**: every served edition is filtered against the *current* unit pool and `overrides.json`. A recording that is unpublished, or a unit that a data fix now puts inside a hidden span, disappears from history and from tonight without rewriting the stored edition.
- **Overrides**: `packages/playlists/overrides.json` (`{unit_id: {energy?, exclude?, note}}`) lets the owner pull a unit from playlists or correct its energy score without touching metadata. It is bundled into the API Worker.
- **Option (a) vs (b)**: deterministic recomputation (a) would rewrite last week whenever a tag or a duplicate link is fixed, and the cooldown history would need recomputing from day 1. Stored editions (b) cost one KV namespace and keep history true. The owner allowed Workers, KV and cron.

### 6.2 The unit pool (`packages/data/src/build/units.ts`)

Built on the private side because it needs `quality`, `hidden` and `audience.privacy`. It implements bedtime.md:
- the base filter B1–B8. B9 (no track overlapping a hidden span) was dropped by the owner on 2026-11-25: names read on air may be *heard* in playlists. Nothing from `hidden` is written to `units.json` as text, and the gate checks it;
- kinds `story`, `clip`, `span`, `set`, `serial`, the clip-versus-parent rule, span advisories and span calendar tags;
- dedupe keys (relations, story groups, set and serial keys);
- the energy score (`energy.ts`).

Measured (2026-11-25): **3,155 units**. Story playlists: 514 units, 126.6 h (story 153, span 266 — one per story segment, clip 50, set 23, serial 22). Radio segments (`kind: "segment"`): 2,383 talks, songs, openings/closings/quizzes/tzedakah and Shema guests. Radio Night: 237 whole episodes + 21 complete serial airings (`episode` / `episodes`). `units.json` is 2.6 MB (the API bundle is 2.8 MB, 0.3 MB gzipped). Details and the reasons for each count: bedtime.md §4.2 and §9.

Tests: `packages/data/test/units.test.ts` (bedtime.md §7 criteria 1–6) and `packages/playlists/test/recipes.test.ts` (real-pool generator: 75 nights of rules and cooldowns, Chanukah, a 730-night run). `npm run playlists:preview -- --days 120` still prints repeat gaps.

### 6.3 Bedtime rules, as built

In `packages/playlists/src/recipes.ts` (hooks `weight`, `admit`, `order`, `validate`, `windDown`), `seasons.ts` and `engine.ts`:
- **Six recipes, in this order** (it is every edition's `playlists[]` order, so all sites show it): Tonight's Mix (first, owner), Little Ones, Big Kids, Quiet Night, Adventure Night, Radio Night (whole episodes). Each has an age label (`Playlist.ages`). Talks and songs are tracks in some types; openings, closings, quizzes and tzedakah occasionally; Shema guests in Little Ones only, behind one constant. bedtime.md §9.
- A type with no eligible units at all is left out of the edition (logged) instead of failing it.
- **Cooldowns** (owner: "only the first 30 minutes are really heard"): whole-playlist repeats after 2 nights; the head (first 40 min) of each type stays fresh for 66 (mix), 20 (little), 48 (big), 23 (calm) and 20 (adventure) days, and Radio Night's first two episodes for 70 (whole episodes: 14), about as far as each type's distinct stories allow. Counted from edition dates. Tables and simulations: bedtime.md §4.6.
- **Seasons** with `@hebcal/hdate` (`hebrew_date`, `season` filled); **wind-down** as a reserved calm tail; **head rules** enforced on the final order; **voices** and **opening-song** rules.
- Not built: the `season` type.

Bump `RECIPE_VERSION` (`contract.ts`, now 4) when selection changes. Future editions regenerate, frozen ones stay.

### 6.4 Where this departs from bedtime.md §4.6, and why

| bedtime.md | Here | Why |
|---|---|---|
| A daily CI job generates editions and **commits** them to `playlists/editions/` in git | The hourly **Worker cron** generates them into **KV** | No daily bot commits to `main`, no redeploying three sites every day to update `tonight.json`, and no write access for CI. The owner has since allowed Workers, KV and cron. The frozen, stored and history semantics are the same. Cost: history lives in KV rather than in git. |
| Tombstone pass rewrites stored files at publish | Tombstones are applied **at read time** | Same effect for visitors; stored editions stay an exact record. |
| B1 excludes `review` | B1 = not `hide` | Owner decision 2026-11-25: `review` items are publishable. |
| Files under `/playlists/` "on each site" | Served by `goldstein-api` through each site's Worker at `/playlists/*` | Same URLs and same origin, so the client code in kids.md §10 and library.md §9 works unchanged (they use the bedtime field names). |
| `hebrew_date`, `season` filled | Filled (`seasons.ts`, `@hebcal/hdate`) | Same as the spec. |

## 7. Deployment

**Workers**:

| Worker | Production | Staging | Notes |
|---|---|---|---|
| `goldstein-api` | no route, `workers_dev: false` | `goldstein-api-staging` | KV `EDITIONS`, hourly cron. Reached only through service bindings. |
| `goldstein-bedtime` / `-kids` / `-library` | custom domain from `SITES` | `*-staging`, `routes: []`, bound to `goldstein-api-staging` | Assets from `dist/`; `run_worker_first: ["/playlists/*", "/api/*"]`. |

**Audio**: `<audio src>` points straight at `storiesmedia.torahlearningtools.com`, which supports range requests. The host sends no CORS headers, so don't `fetch()` audio (a waveform, for example) without adding a CORS rule to the bucket first.

**CI** (`.github/workflows/ci.yml`, every PR and every push to `main`): one job, so the 150 MB checkout happens once.
1. format check;
2. data build (with the gate);
3. typecheck;
4. `npm test` (privacy gate tests, engine, API, player, site table);
5. `npm run build` (API bundle by `wrangler deploy --dry-run`, three Astro builds);
6. the gate over `generated/`, `apps/*/dist` and `workers/api/dist`.

From a clean `npm ci`: install 7 s, typecheck 18 s, tests 34 s, build 28 s. `node_modules` is cached by lockfile hash and saved only from `main`.

**Deploy** (`.github/workflows/deploy.yml`):
- On push to `main` it deploys what changed:
  - anything under `data/`, `packages/`, `workers/api/`, the lockfile or `.github/` deploys the API and all three sites;
  - `apps/<site>/` deploys that site only.
- The "plan" job uses a blobless sparse checkout (no `data/` download).
- Manual dispatch picks production or staging and an optional subset.
- It rebuilds, re-runs the privacy tests and the gate on the exact output, then runs `cloudflare/wrangler-action@v3` (wrangler 4.156.0): API first, then the sites.
- Secrets come from the GitHub environment (`production` / `staging`).

## 8. Conventions for the site teams

**Ownership (each team works in its own worktree, so keep to your files):**

| Team | Owns | May touch, additively, in its own PR |
|---|---|---|
| bedtime | `apps/bedtime/**`, `packages/playlists/src/recipes.ts`, `packages/playlists/overrides.json`, `packages/data/src/build/{units,energy}.ts` | `packages/playlists/src/engine.ts` (season, Hebrew date) |
| kids | `apps/kids/**` | none expected |
| library | `apps/library/**` | none expected |
| foundation | `packages/{config,data,player}`, `packages/playlists` (rest), `workers/api`, `.github/`, root config, this doc | |

- An app may add its own build scripts (for example `apps/library/scripts/build-search.ts` for Pagefind, or a kids-only export in `apps/kids/scripts/`). Derive from `@goldstein/data/load`; don't change the shared dataset to suit one site.
- If a site needs a new public field, add it to `packages/data` (types + transform + a gate test if it carries text) in a separate small PR, so the other teams can rebase onto it.
- Don't edit another app's folder, `docs/DECISIONS.md` or `docs/sites/*` of another team.

**Dependencies and the lockfile:**
- Pin exact versions (`"astro": "7.4.10"`, not `^`). Shared toolchain versions (astro, typescript 6.0.3, vitest 5.1.2, wrangler 4.156.0, `@cloudflare/workers-types`, `@types/node`) are the same in every package; change them only in a foundation PR that updates all packages at once.
- Add an app dependency with `npm install <pkg>@<exact> -w @goldstein/<site>` from the repo root. There is one lockfile at the root, and no `package-lock.json` inside apps.
- On a lockfile merge conflict, never hand-merge. Take `main`'s `package-lock.json` (`git checkout --theirs package-lock.json` during a rebase), run `npm install` at the root, check that `npm ci` works, and commit.
- Prefer few dependencies. The library concept's Preact islands and Pagefind, and the kids' MiniSearch, are fine; anything heavier needs a reason.

**Naming:**
- Packages are `@goldstein/<name>`, Workers `goldstein-<name>` (staging `goldstein-<name>-staging`).
- localStorage keys go through `createStore("<site>")`, giving `goldstein:<site>:<key>`.
- Item URLs: library `/r/<id>/`, kids `/listen/<id>/`. Bedtime has no item pages. Cross-site links use `itemUrl(site, id)`.
- `/playlists/*` and `/api/*` are reserved on every host for `goldstein-api`. Don't create pages there; use another path for "my playlists" pages, or exclude them from `run_worker_first`.

**Each app keeps this shape** so CI and deploy work without changes:
- scripts `dev`, `build` (starts with `npm run ensure -w @goldstein/data`), `typecheck`, `test`, `deploy`, `deploy:staging`, `preview`;
- output in `dist/`;
- `worker/index.ts` re-exporting `siteWorker` from `@goldstein/api/proxy`, unless the site needs its own Worker code. If so, keep forwarding `/playlists/*` and `/api/*` to `env.API`.

**Dev loop:** run `npm run dev:api` (local KV, `--test-scheduled`) in one terminal and `npm run dev:<site>` in another. The Astro dev server proxies `/playlists` and `/api` to `localhost:8787`. `npm run preview -w @goldstein/<site>` serves the built site through its real Worker.

**Adding a fourth app:**
1. Copy `apps/bedtime` (the smallest).
2. Rename the package, the Worker and the staging names.
3. Add the site to `SITES`, the root `workspaces`, the deploy workflow (plan outputs, build loop, a deploy step) and the gate list in `ci.yml`.

## 9. Owner steps (one time)

1. **Cloudflare API token** for CI, with Workers Scripts:Edit, Workers KV Storage:Edit, Workers Routes:Edit, and Zone:DNS:Edit plus Zone:Read for `torahlearningtools.com` (custom domains), and Account Settings:Read.
   - In GitHub → Settings → Environments, create `production` and `staging`. In each, add the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
   - Optionally require approval for `production`.
2. **KV namespaces**: `npx wrangler kv namespace create goldstein-editions` and `… goldstein-editions-staging`. Put the two ids into `workers/api/wrangler.jsonc`, replacing the placeholder zeros.
   - Existing namespaces in the account are `SESSIONS` and `labeled-break-votes`; nothing collides.
3. **Domains** (confirmed, no dashes): the three hosts are in `packages/config/src/sites.ts` and the matching `routes` in `apps/*/wrangler.jsonc`.
   - `wrangler deploy` creates the custom domains and DNS records on the first deploy, if the token has DNS edit on the zone.
   - The names don't exist yet, and `stories.torahlearningtools.com` is taken by True Books.
4. **First deploy**: run "deploy" by hand (production, all). It deploys `goldstein-api` first, which the sites' service bindings need. The first request to `/playlists/*` fills two weeks of editions.
5. **Branch protection** on `main`: require the `ci` check.

The read-only API check found 24 Workers in the account (the `emunas-*` family, `torahlearningtools-home`, …) and R2 buckets including `stories`. No `goldstein-*` resources exist yet. The account id was not read: the proxied API token was rejected for `/accounts`.

## 10. Open questions

- The three hostnames (§9.3), and whether the owner wants a dedicated domain.
- Rotation length: 24 h is set; 12 h is one line.
- The `season` playlist type.
- One hidden `addresses` entry (a Brooklyn street with no house number) occurs in transcript lines of 19 recordings outside their own hidden spans, so those lines are withheld archive-wide. If it is the show's public mailing address, it can go on `privacy-allowlist.json` with that reason.

## 11. Differences from the concept docs (summary)

- **library.md**: "no Worker code". The site is still fully static; the only code is the generic site Worker that forwards `/playlists/*` (the owner allowed Workers). `review` items are exported (owner decision). Pagefind and the search build are the library team's, in `apps/library`, from `generated/search/*.json`.
- **kids.md §10 / library.md §9**: the playlist files use the bedtime field names (`date`, `playlists[].id/type/title/subtitle/total_min/age_min/items[].id/start_sec/end_sec`, `history.json → nights`), as kids.md asked ("adapt field names there").
- **bedtime.md §4.6**: KV and cron instead of committed files (§6.4).
