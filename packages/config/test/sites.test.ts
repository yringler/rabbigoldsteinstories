import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ORDER, SITE_IDS, SITES, supportUrl } from "../src/sites.ts";

const root = join(import.meta.dirname, "..", "..", "..");
const jsonc = (path: string) =>
  JSON.parse(
    readFileSync(join(root, path), "utf8")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/,(\s*[}\]])/g, "$1"),
  ) as {
    name: string;
    routes?: { pattern: string; custom_domain?: boolean }[];
    services?: { binding: string; service: string }[];
    env?: Record<string, { name: string; routes?: unknown[]; services?: { service: string }[] }>;
  };

describe("site table matches the wrangler configs", () => {
  for (const id of SITE_IDS) {
    it(id, () => {
      const w = jsonc(`apps/${id}/wrangler.jsonc`);
      expect(w.name).toBe(SITES[id].worker);
      expect(w.routes).toEqual([{ pattern: SITES[id].host, custom_domain: true }]);
      expect(w.services).toEqual([{ binding: "API", service: "goldstein-api" }]);
      expect(w.env?.["staging"]?.name).toBe(`${SITES[id].worker}-staging`);
      expect(w.env?.["staging"]?.routes).toEqual([]);
      expect(w.env?.["staging"]?.services).toEqual([
        { binding: "API", service: "goldstein-api-staging" },
      ]);
    });
  }
});

describe("support page", () => {
  it("lives on the landing site", () => {
    expect(supportUrl()).toBe("https://rabbigoldsteinstories.torahlearningtools.com/support/");
  });
});

describe("order link", () => {
  it("points at the MP3 order form", () => {
    expect(ORDER.url).toBe("https://www.thelivingsidrah.com/order/");
  });
});
