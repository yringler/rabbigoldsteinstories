// Lab only: /lab/seg serves one HLS packed-audio segment for /lab/hls/ (id3.m3u8). It fetches a
// byte range of an MP3 from the media host and puts an ID3v2.4 PRIV
// com.apple.streaming.transportStreamTimestamp tag in front of it, as RFC 8216 §3.4 requires of
// packed audio. Same origin as the page, so this variant needs no CORS rule on the bucket.
// Restricted to goldstein/audio*/ keys on the media host and to 2 MB, so it is not an open proxy.

const MEDIA_ORIGIN = "https://storiesmedia.torahlearningtools.com";
const MAX_LENGTH = 2_000_000;
const OWNER = "com.apple.streaming.transportStreamTimestamp";

function syncsafe(n: number): number[] {
  return [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];
}

/** ID3v2.4 tag with one PRIV frame: owner, NUL, then the 33-bit 90 kHz timestamp in 8 bytes. */
export function id3Timestamp(pts90k: number): Uint8Array {
  const owner = new TextEncoder().encode(OWNER);
  const data = new Uint8Array(owner.length + 1 + 8);
  data.set(owner, 0);
  const ts = BigInt(pts90k) & 0x1_ffff_ffffn;
  const view = new DataView(data.buffer);
  view.setBigUint64(owner.length + 1, ts);
  const frame = new Uint8Array(10 + data.length);
  frame.set([0x50, 0x52, 0x49, 0x56, ...syncsafe(data.length), 0, 0], 0); // "PRIV"
  frame.set(data, 10);
  const tag = new Uint8Array(10 + frame.length);
  tag.set([0x49, 0x44, 0x33, 4, 0, 0, ...syncsafe(frame.length)], 0); // "ID3" v2.4
  tag.set(frame, 10);
  return tag;
}

function intParam(q: URLSearchParams, name: string): number | null {
  const v = q.get(name);
  if (v === null || !/^\d{1,12}$/.test(v)) return null;
  return Number(v);
}

export async function labSegment(url: URL): Promise<Response> {
  const key = url.searchParams.get("k") ?? "";
  const offset = intParam(url.searchParams, "o");
  const length = intParam(url.searchParams, "l");
  const pts = intParam(url.searchParams, "t");
  if (
    !/^goldstein\/audio(_clean)?\//.test(key) ||
    key.includes("..") ||
    offset === null ||
    length === null ||
    pts === null ||
    length < 1 ||
    length > MAX_LENGTH
  )
    return new Response("bad segment request", { status: 400 });
  const src = `${MEDIA_ORIGIN}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const upstream = await fetch(src, {
    headers: { range: `bytes=${offset}-${offset + length - 1}` },
    cf: { cacheEverything: true, cacheTtl: 86_400 },
  });
  if (upstream.status !== 206) return new Response("upstream error", { status: 502 });
  const body = new Uint8Array(await upstream.arrayBuffer());
  const tag = id3Timestamp(pts);
  const out = new Uint8Array(tag.length + body.length);
  out.set(tag, 0);
  out.set(body, tag.length);
  return new Response(out, {
    headers: {
      "content-type": "audio/mpeg",
      "cache-control": "public, max-age=86400",
      "access-control-allow-origin": "*",
    },
  });
}
