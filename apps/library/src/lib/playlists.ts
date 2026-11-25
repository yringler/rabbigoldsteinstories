/**
 * User playlists (docs/sites/library.md §8): stored in this browser only, exported and imported as
 * a versioned JSON file ("goldstein-playlists", version 1). The JSON Schema below is published at
 * /schemas/playlists-1.json; `validateDoc` implements exactly that schema (a test checks the two
 * agree) and adds the import policy: size limit, specific messages, newer versions.
 */

export const FORMAT = "goldstein-playlists";
export const VERSION = 1;
export const MAX_PLAYLISTS = 100;
export const MAX_ITEMS = 500;
export const MAX_FILE_BYTES = 1024 * 1024;

export interface PlaylistEntry {
  rec: string;
  start?: number;
  end?: number;
  label?: string;
  note?: string;
  title?: string;
  dur?: number;
}

export interface UserPlaylist {
  id: string;
  name: string;
  note?: string;
  created?: string;
  updated?: string;
  origin?: string;
  items: PlaylistEntry[];
}

export interface PlaylistDoc {
  format: typeof FORMAT;
  version: typeof VERSION;
  exported?: string;
  site?: string;
  playlists: UserPlaylist[];
}

export function playlistSchema(siteOrigin: string): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${siteOrigin}/schemas/playlists-1.json`,
    title: "Goldstein Story Archive playlists",
    type: "object",
    required: ["format", "version", "playlists"],
    additionalProperties: false,
    properties: {
      format: { const: FORMAT },
      version: { const: VERSION },
      exported: { type: "string", format: "date-time" },
      site: { type: "string", format: "uri" },
      playlists: {
        type: "array",
        maxItems: MAX_PLAYLISTS,
        items: {
          type: "object",
          required: ["id", "name", "items"],
          additionalProperties: false,
          properties: {
            id: { type: "string", pattern: "^[a-z0-9]{12}$" },
            name: { type: "string", minLength: 1, maxLength: 120 },
            note: { type: "string", maxLength: 2000 },
            created: { type: "string", format: "date-time" },
            updated: { type: "string", format: "date-time" },
            origin: {
              type: "string",
              maxLength: 200,
              description: "e.g. 'tonight:2026-11-25:calm' when copied from tonight's playlists",
            },
            items: {
              type: "array",
              maxItems: MAX_ITEMS,
              items: {
                type: "object",
                required: ["rec"],
                additionalProperties: false,
                properties: {
                  rec: { type: "string", pattern: "^[0-9a-f]{10}$" },
                  start: { type: "number", minimum: 0 },
                  end: { type: "number", exclusiveMinimum: 0 },
                  label: {
                    type: "string",
                    maxLength: 200,
                    description: "segment title when start/end are set",
                  },
                  note: { type: "string", maxLength: 1000 },
                  title: {
                    type: "string",
                    maxLength: 300,
                    description: "snapshot for readability; refreshed on import",
                  },
                  dur: { type: "number", minimum: 0 },
                },
              },
            },
          },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Validation

export type ValidateResult =
  { ok: true; doc: PlaylistDoc; warnings: string[] } | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i;

function str(
  o: Record<string, unknown>,
  k: string,
  max: number,
  errs: string[],
  where: string,
  min = 0,
): string | undefined {
  const v = o[k];
  if (v === undefined) return undefined;
  if (typeof v !== "string") errs.push(`${where}: "${k}" must be text.`);
  else if (v.length < min) errs.push(`${where}: "${k}" must not be empty.`);
  else if (v.length > max) errs.push(`${where}: "${k}" is longer than ${max} characters.`);
  else return v;
  return undefined;
}

function date(
  o: Record<string, unknown>,
  k: string,
  errs: string[],
  where: string,
): string | undefined {
  const v = str(o, k, 64, errs, where);
  if (v !== undefined && !ISO.test(v)) errs.push(`${where}: "${k}" is not a date-time.`);
  return v;
}

function unknownKeys(
  o: Record<string, unknown>,
  allowed: readonly string[],
  errs: string[],
  where: string,
  strict: boolean,
) {
  if (!strict) return;
  for (const k of Object.keys(o))
    if (!allowed.includes(k)) errs.push(`${where}: unknown field "${k}".`);
}

function validateItem(
  v: unknown,
  where: string,
  errs: string[],
  strict: boolean,
): PlaylistEntry | null {
  if (!isObj(v)) {
    errs.push(`${where} is not an object.`);
    return null;
  }
  unknownKeys(v, ["rec", "start", "end", "label", "note", "title", "dur"], errs, where, strict);
  const before = errs.length;
  if (typeof v["rec"] !== "string" || !/^[0-9a-f]{10}$/.test(v["rec"]))
    errs.push(`${where}: "rec" must be a 10-character recording id.`);
  const num = (k: string, ok: (n: number) => boolean, msg: string) => {
    const n = v[k];
    if (n === undefined) return undefined;
    if (typeof n !== "number" || !Number.isFinite(n) || !ok(n))
      errs.push(`${where}: "${k}" ${msg}.`);
    else return n;
    return undefined;
  };
  const start = num("start", (n) => n >= 0, "must be a number ≥ 0");
  const end = num("end", (n) => n > 0, "must be a number > 0");
  const dur = num("dur", (n) => n >= 0, "must be a number ≥ 0");
  const label = str(v, "label", 200, errs, where);
  const note = str(v, "note", 1000, errs, where);
  const title = str(v, "title", 300, errs, where);
  if (start !== undefined && end !== undefined && end <= start)
    errs.push(`${where}: "end" (${end}) must be after "start" (${start}).`);
  if (errs.length > before) return null;
  const out: PlaylistEntry = { rec: v["rec"] as string };
  if (start !== undefined) out.start = start;
  if (end !== undefined) out.end = end;
  if (label !== undefined) out.label = label;
  if (note !== undefined) out.note = note;
  if (title !== undefined) out.title = title;
  if (dur !== undefined) out.dur = dur;
  return out;
}

function validatePlaylist(
  v: unknown,
  where: string,
  errs: string[],
  strict: boolean,
): UserPlaylist | null {
  if (!isObj(v)) {
    errs.push(`${where} is not an object.`);
    return null;
  }
  unknownKeys(
    v,
    ["id", "name", "note", "created", "updated", "origin", "items"],
    errs,
    where,
    strict,
  );
  const before = errs.length;
  if (typeof v["id"] !== "string" || !/^[a-z0-9]{12}$/.test(v["id"]))
    errs.push(`${where}: "id" must be 12 lowercase letters or digits.`);
  if (v["name"] === undefined) errs.push(`${where}: "name" is missing.`);
  const name = str(v, "name", 120, errs, where, 1);
  const note = str(v, "note", 2000, errs, where);
  const created = date(v, "created", errs, where);
  const updated = date(v, "updated", errs, where);
  const origin = str(v, "origin", 200, errs, where);
  const items: PlaylistEntry[] = [];
  if (!Array.isArray(v["items"])) errs.push(`${where}: "items" must be a list.`);
  else if (v["items"].length > MAX_ITEMS) errs.push(`${where} has more than ${MAX_ITEMS} items.`);
  else
    v["items"].forEach((it, i) => {
      const ok = validateItem(it, `${where}, item ${i + 1}`, errs, strict);
      if (ok) items.push(ok);
    });
  if (errs.length > before || name === undefined) return null;
  const out: UserPlaylist = { id: v["id"] as string, name, items };
  if (note !== undefined) out.note = note;
  if (created !== undefined) out.created = created;
  if (updated !== undefined) out.updated = updated;
  if (origin !== undefined) out.origin = origin;
  return out;
}

/** Validate parsed JSON. Version 1 must match the schema exactly; newer versions import what validates. */
export function validateDoc(json: unknown): ValidateResult {
  if (!isObj(json))
    return { ok: false, errors: ["The file is not a playlists file (expected a JSON object)."] };
  if (json["format"] !== FORMAT)
    return {
      ok: false,
      errors: [`The file is not a playlists file ("format" should be "${FORMAT}").`],
    };
  const version = json["version"];
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1)
    return { ok: false, errors: ['"version" must be a whole number (1).'] };
  const newer = version > VERSION;
  const errs: string[] = [];
  unknownKeys(json, ["format", "version", "exported", "site", "playlists"], errs, "File", !newer);
  const exported = date(json, "exported", errs, "File");
  const site = str(json, "site", 300, errs, "File");
  if (!Array.isArray(json["playlists"]))
    return { ok: false, errors: [...errs, '"playlists" must be a list.'] };
  if (json["playlists"].length > MAX_PLAYLISTS)
    return { ok: false, errors: [`The file has more than ${MAX_PLAYLISTS} playlists.`] };
  const playlists: UserPlaylist[] = [];
  const warnings: string[] = [];
  json["playlists"].forEach((p, i) => {
    const pErrs: string[] = [];
    const ok = validatePlaylist(p, `Playlist ${i + 1}`, pErrs, !newer);
    if (ok) playlists.push(ok);
    else if (newer)
      warnings.push(`Playlist ${i + 1} was skipped: it uses features this site does not know.`);
    errs.push(...(newer ? [] : pErrs));
  });
  if (errs.length) return { ok: false, errors: errs.slice(0, 12) };
  if (newer)
    warnings.unshift(
      `This file is version ${version}; this site knows version ${VERSION}. Everything that could be read was imported.`,
    );
  const doc: PlaylistDoc = { format: FORMAT, version: VERSION, playlists };
  if (exported !== undefined) doc.exported = exported;
  if (site !== undefined) doc.site = site;
  return { ok: true, doc, warnings };
}

/** Parse file text (size-checked) and validate. */
export function parseImport(
  text: string,
  byteLength = new TextEncoder().encode(text).length,
): ValidateResult {
  if (byteLength > MAX_FILE_BYTES)
    return {
      ok: false,
      errors: [`The file is ${(byteLength / 1048576).toFixed(1)} MB; the limit is 1 MB.`],
    };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["The file is not valid JSON."] };
  }
  return validateDoc(json);
}

// ---------------------------------------------------------------------------------------------
// Building, exporting, merging

export function newId(random: () => number = Math.random): string {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 12; i++) s += abc[Math.floor(random() * abc.length)] ?? "a";
  return s;
}

export function exportDoc(
  playlists: readonly UserPlaylist[],
  site: string,
  now = new Date(),
): PlaylistDoc {
  return {
    format: FORMAT,
    version: VERSION,
    exported: now.toISOString(),
    site,
    playlists: playlists.map(clone),
  };
}

export function serialize(doc: PlaylistDoc): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function exportFileName(now = new Date()): string {
  return `goldstein-playlists-${now.toISOString().slice(0, 10)}.json`;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export type ConflictChoice = "replace" | "keep-both" | "skip";

export interface ImportOutcome {
  playlists: UserPlaylist[];
  added: number;
  replaced: number;
  skipped: number;
}

/** Merge imported playlists into the existing ones; `choose` decides each id conflict. */
export function mergeImport(
  existing: readonly UserPlaylist[],
  incoming: readonly UserPlaylist[],
  choose: (p: UserPlaylist) => ConflictChoice,
  random: () => number = Math.random,
): ImportOutcome {
  const out = existing.map(clone);
  let added = 0;
  let replaced = 0;
  let skipped = 0;
  for (const p of incoming) {
    const i = out.findIndex((e) => e.id === p.id);
    if (i < 0) {
      if (out.length >= MAX_PLAYLISTS) {
        skipped++;
        continue;
      }
      out.push(clone(p));
      added++;
      continue;
    }
    const c = choose(p);
    if (c === "replace") {
      out[i] = clone(p);
      replaced++;
    } else if (c === "keep-both" && out.length < MAX_PLAYLISTS) {
      out.push({ ...clone(p), id: newId(random), name: `${p.name} (imported)`.slice(0, 120) });
      added++;
    } else skipped++;
  }
  return { playlists: out, added, replaced, skipped };
}

// ---------------------------------------------------------------------------------------------
// Share links: /my-playlists/#p=<base64url(deflate-raw(json))>

export const SHARE_LIMIT = 1800;

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** Encoded share fragment for one playlist, or null when it would be too long. */
export async function encodeShare(p: UserPlaylist): Promise<string | null> {
  const slim: UserPlaylist = {
    id: p.id,
    name: p.name,
    items: p.items.map(({ rec, start, end, label, note }) => {
      const e: PlaylistEntry = { rec };
      if (start !== undefined) e.start = start;
      if (end !== undefined) e.end = end;
      if (label !== undefined) e.label = label;
      if (note !== undefined) e.note = note;
      return e;
    }),
  };
  if (p.note !== undefined) slim.note = p.note;
  const bytes = new TextEncoder().encode(JSON.stringify(slim));
  const enc = b64url(await pipe(bytes, new CompressionStream("deflate-raw")));
  return enc.length <= SHARE_LIMIT ? enc : null;
}

export async function decodeShare(fragment: string): Promise<UserPlaylist | null> {
  try {
    const bytes = await pipe(unb64url(fragment), new DecompressionStream("deflate-raw"));
    const json: unknown = JSON.parse(new TextDecoder().decode(bytes));
    const res = validateDoc({ format: FORMAT, version: VERSION, playlists: [json] });
    return res.ok ? (res.doc.playlists[0] ?? null) : null;
  } catch {
    return null;
  }
}
