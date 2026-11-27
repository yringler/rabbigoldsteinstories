"""Write data/catalog/audio_frames.csv: where the MP3 frames are in each audio file, for HLS.

The playlist Worker serves a night as one HLS stream whose segments are byte ranges of the original
files (docs/design/hls.md). Every file is constant bitrate, so a frame's offset follows from the
first frame's offset and the profile; this script records that offset and the frame count per file
and checks the formula against the real bytes. It reads only the public media host (HTTP range
requests, a few KB per file), no credentials.

    python -X utf8 tools/4-r2/scan_audio_frames.py            (from the repo root)

Columns: id, variant (original | clean), first_byte (offset of frame 0, the LAME "Info" frame; the
audio starts at frame 1), frame_count (frames including frame 0), bitrate_kbps, sample_rate,
size_bytes. A file whose header or samples do not match a known profile is left out and listed.

Known profiles (MPEG-1 Layer III, mono, CBR). Frame k (0-based) starts at
first_byte + (k * 144000 * bitrate_kbps + PHASE) // sample_rate, where PHASE is the encoder's padding
phase, measured on every frame of sample files and confirmed here on 3 random frames per file.
"""
import csv, glob, json, os, random, sys, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "data", "catalog", "audio_frames.csv")
HOST = "https://storiesmedia.torahlearningtools.com/"
UA = {"User-Agent": "goldstein-frame-scan/1"}
PHASE = {(96, 44100): 1800, (128, 48000): 0}
BR = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
SR = [44100, 48000, 32000]


def get(url, a, b):
    req = urllib.request.Request(url, headers={**UA, "Range": f"bytes={a}-{b}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        total = int(r.headers["Content-Range"].rsplit("/", 1)[1])
        return r.read(), total


def header(b, i):
    """(bitrate_kbps, sample_rate, frame_len) of an MPEG-1 Layer III frame at b[i], else None."""
    if i + 4 > len(b) or b[i] != 0xFF or (b[i + 1] & 0xFE) != 0xFA:  # sync, MPEG-1, Layer III
        return None
    bi, si = b[i + 2] >> 4, (b[i + 2] >> 2) & 3
    if bi in (0, 15) or si == 3:
        return None
    br, sr = BR[bi], SR[si]
    return br, sr, 144000 * br // sr + ((b[i + 2] >> 1) & 1)


def offset(k, br, sr):
    return (k * 144000 * br + PHASE[(br, sr)]) // sr


def scan(row):
    id_, variant, url = row
    try:
        head, size = get(url, 0, 65535)
        first = 0
        if head[:3] == b"ID3":
            first = 10 + ((head[6] & 0x7F) << 21 | (head[7] & 0x7F) << 14 | (head[8] & 0x7F) << 7 | (head[9] & 0x7F))
            if head[5] & 0x10:
                first += 10
            if first + 4096 > len(head):
                head, _ = get(url, 0, first + 65535)
        h = header(head, first)
        if not h:
            return id_, variant, None, f"no frame at {first}"
        br, sr, _ = h
        if (br, sr) not in PHASE:
            return id_, variant, None, f"unknown profile {br} kbps {sr} Hz"
        frame0 = head[first : first + 200]
        if b"Info" not in frame0:
            return id_, variant, None, "no LAME Info frame (not marked CBR)"
        span = size - first
        n = span * sr // (144000 * br)
        while offset(n, br, sr) < span:
            n += 1
        if offset(n, br, sr) != span:
            return id_, variant, None, f"size {size} is not a whole number of frames"
        for k in random.sample(range(1, n), min(3, n - 1)):
            o = first + offset(k, br, sr)
            b, _ = get(url, o, o + 3)
            if not header(b, 0):
                return id_, variant, None, f"no frame sync at predicted frame {k}"
        return id_, variant, dict(first_byte=first, frame_count=n, bitrate_kbps=br, sample_rate=sr, size_bytes=size), None
    except Exception as e:  # network and parse errors: report, don't stop the scan
        return id_, variant, None, str(e)


def main():
    rows = []
    for p in glob.glob(os.path.join(ROOT, "data", "recordings", "**", "*.meta.json"), recursive=True):
        m = json.load(open(p, encoding="utf-8"))
        rows.append((m["id"], "original", m["media"]["url"]))
    clean = os.path.join(ROOT, "data", "catalog", "r2_clean_manifest.csv")
    if os.path.exists(clean):
        for r in csv.DictReader(open(clean, encoding="utf-8-sig")):
            rows.append((r["id"], "clean", HOST + urllib.parse.quote(r["key"])))
    with ThreadPoolExecutor(32) as ex:
        results = list(ex.map(scan, rows))
    ok = sorted((r for r in results if r[2]), key=lambda r: (r[0], r[1]))
    bad = [r for r in results if not r[2]]
    with open(OUT, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["id", "variant", "first_byte", "frame_count", "bitrate_kbps", "sample_rate", "size_bytes"])
        for id_, variant, d, _ in ok:
            w.writerow([id_, variant, d["first_byte"], d["frame_count"], d["bitrate_kbps"], d["sample_rate"], d["size_bytes"]])
    print(f"{len(ok)} files written to {os.path.relpath(OUT, ROOT)}; {len(bad)} left out")
    for id_, variant, _, why in bad:
        print(f"  {id_} {variant}: {why}")
    return 0 if not bad else 1


if __name__ == "__main__":
    sys.exit(main())
