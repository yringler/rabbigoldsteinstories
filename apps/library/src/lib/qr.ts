/** QR codes as compact inline SVG (one path), for print cards and playlist sheets. */
import qrcode from "qrcode-generator";

export function qrSvg(text: string, size = 96, label = "QR code linking to this page"): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const m = 2; // quiet zone, in modules
  let d = "";
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!qr.isDark(r, c)) {
        c++;
        continue;
      }
      let run = 1;
      while (c + run < n && qr.isDark(r, c + run)) run++;
      d += `M${c + m} ${r + m}h${run}v1h-${run}z`;
      c += run;
    }
  }
  const v = n + 2 * m;
  return `<svg class="qr" role="img" aria-label="${label}" width="${size}" height="${size}" viewBox="0 0 ${v} ${v}" shape-rendering="crispEdges"><rect width="${v}" height="${v}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
