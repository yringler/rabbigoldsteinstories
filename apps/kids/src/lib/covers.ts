/**
 * Generated covers (docs/sites/kids.md §8.4): an SVG composed from the item's tags, deterministic
 * from its id (or, for serial chapters, the serial's key). No title text on the cover.
 * Pure string building; the caller supplies the hash byte (sha256(id)[0]).
 */
import { iconBody } from "./icons.ts";

export type CoverFamily = "blue" | "coral" | "grape" | "sky" | "leaf";

/** light / mid / dark step of each family. */
export const FAMILY: Readonly<Record<CoverFamily, readonly [string, string, string]>> = {
  blue: ["#4F86D9", "#1F5FBF", "#17468F"],
  coral: ["#F58A78", "#F0624D", "#C8432F"],
  grape: ["#9B78D6", "#7A4FC2", "#5B3699"],
  sky: ["#6FCBEE", "#3DB8E8", "#1F8FBE"],
  leaf: ["#5CBB8E", "#2E9E6B", "#21774F"],
};

export type Pattern =
  "forest" | "hills" | "scroll" | "rooftops" | "crowns" | "dots" | "city" | "waves";

export function patternFor(storyType: readonly string[]): Pattern {
  switch (storyType[0]) {
    case "chassidic":
      return "forest";
    case "tanach_midrash":
      return "hills";
    case "talmudic":
    case "rishonim_acharonim":
      return "scroll";
    case "historical":
      return "rooftops";
    case "mashal_parable":
      return "crowns";
    case "moral_fiction":
      return "dots";
    case "contemporary":
      return "city";
    default:
      return "waves";
  }
}

export interface CoverSpec {
  family: CoverFamily;
  /** 0, 1 or 2 (sha256 byte mod 3). */
  step: number;
  pattern: Pattern;
  emblem: string;
  /** Episode number in a dial (radio shows). */
  episode?: number | undefined;
  /** Chapter / part numeral (serial and part chapters). */
  chapter?: number | undefined;
}

function patternMarkup(p: Pattern, ink: string): string {
  const g = (inner: string) =>
    `<g fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
  switch (p) {
    case "forest": {
      let s = "";
      for (let row = 0; row < 4; row++)
        for (let col = 0; col < 5; col++) {
          const x = col * 28 + (row % 2) * 14 - 4;
          const y = row * 32 + 6;
          s += `<path d="M${x} ${y}l-8 16h16Z M${x} ${y + 16}v6" />`;
        }
      return g(s);
    }
    case "hills":
      return g(
        `<path d="M-5 40q20-18 40 0t40 0 40 0 40 0M-5 70q20-18 40 0t40 0 40 0 40 0M-5 100q20-18 40 0t40 0 40 0 40 0"/>`,
      );
    case "scroll":
      return g(
        `<rect x="8" y="8" width="104" height="104" rx="10"/><rect x="14" y="14" width="92" height="92" rx="6"/><path d="M8 18a8 8 0 0 1 10-10M112 18a8 8 0 0 0-10-10M8 102a8 8 0 0 0 10 10M112 102a8 8 0 0 1-10 10"/>`,
      );
    case "rooftops": {
      let s = "";
      for (let i = 0; i < 6; i++) {
        const x = i * 22 - 4;
        s += `<path d="M${x} 112v-22l10-10 10 10v22M${x + 7} 112v-8h6v8"/><path d="M${x} 46v-14l10-10 10 10v14"/>`;
      }
      return g(s);
    }
    case "crowns": {
      let s = "";
      const pts: [number, number][] = [
        [14, 18],
        [92, 14],
        [100, 92],
        [18, 96],
        [58, 8],
        [8, 58],
        [108, 54],
        [60, 110],
      ];
      pts.forEach(([x, y], i) => {
        s +=
          i % 2 === 0
            ? `<path d="M${x - 7} ${y + 5}l1-10 4 5 2-7 2 7 4-5 1 10Z"/>`
            : `<path d="M${x} ${y - 6}l1.8 4 4.2.6-3 3 .8 4.4-3.8-2-3.8 2 .8-4.4-3-3 4.2-.6Z"/>`;
      });
      return g(s);
    }
    case "dots": {
      let s = "";
      for (let y = 8; y < 120; y += 16)
        for (let x = 8 + ((y / 16) % 2) * 8; x < 120; x += 16)
          s += `<circle cx="${x}" cy="${y}" r="2.6" fill="${ink}"/>`;
      return `<g>${s}</g>`;
    }
    case "city":
      return g(
        `<path d="M0 112V80h14V62h12v50M26 112V70h16v42M42 112V52h14v60M56 112V76h18v36M74 112V58h12v54M86 112V72h18v40M104 112V64h16v48"/><path d="M46 60h6M46 68h6M46 76h6M78 66h4M78 74h4M90 80h10M90 88h10"/>`,
      );
    case "waves":
      return g(
        `<path d="M20 60a40 40 0 0 1 80 0M30 60a30 30 0 0 1 60 0M10 60a50 50 0 0 1 100 0M20 60a40 40 0 0 0 80 0M30 60a30 30 0 0 0 60 0M10 60a50 50 0 0 0 100 0"/>`,
      );
  }
}

/** The cover as a standalone SVG document (512×512 when rasterised). */
export function coverSvg(spec: CoverSpec): string {
  const steps = FAMILY[spec.family];
  const step = ((spec.step % 3) + 3) % 3;
  const bg = steps[step] ?? steps[1];
  const deep = steps[2];
  const patInk = step === 0 ? "#22304A" : "#FFFFFF";
  const patOpacity = step === 0 ? 0.12 : 0.16;
  const ink = "#22304A";
  let corner = "";
  if (spec.episode !== undefined) {
    const n = String(spec.episode);
    const fs = n.length >= 3 ? 12 : 14;
    let ticks = "";
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const x1 = 24 + Math.cos(a) * 15.5;
      const y1 = 24 + Math.sin(a) * 15.5;
      const x2 = 24 + Math.cos(a) * 18;
      const y2 = 24 + Math.sin(a) * 18;
      ticks += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
    }
    corner = `<g><circle cx="24" cy="24" r="19" fill="#FFFFFF" stroke="${ink}" stroke-width="2.5"/><path d="${ticks}" stroke="${ink}" stroke-width="1.6" stroke-linecap="round"/><text x="24" y="${24 + fs * 0.36}" text-anchor="middle" font-family="'Baloo 2','Arial Rounded MT Bold',Arial,sans-serif" font-weight="800" font-size="${fs}" fill="${ink}">${n}</text></g>`;
  }
  if (spec.chapter !== undefined) {
    const n = String(spec.chapter);
    corner += `<g><rect x="80" y="80" width="34" height="34" rx="10" fill="#FFC83D" stroke="${ink}" stroke-width="2.5"/><text x="97" y="${n.length > 1 ? 104 : 106}" text-anchor="middle" font-family="'Baloo 2','Arial Rounded MT Bold',Arial,sans-serif" font-weight="800" font-size="${n.length > 1 ? 20 : 25}" fill="${ink}">${n}</text></g>`;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="512" height="512">` +
    `<rect width="120" height="120" fill="${bg}"/>` +
    `<g opacity="${patOpacity}">${patternMarkup(spec.pattern, patInk)}</g>` +
    `<circle cx="60" cy="63" r="34" fill="${deep}" opacity="0.35"/>` +
    `<circle cx="60" cy="60" r="34" fill="#FFFFFF" stroke="${ink}" stroke-width="2.5"/>` +
    `<g transform="translate(36 36)">${iconBody(spec.emblem, { accent: "#FFC83D" })}</g>` +
    corner +
    `</svg>`
  );
}
