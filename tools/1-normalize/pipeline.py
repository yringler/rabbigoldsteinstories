#!/usr/bin/env python
"""Phase-1 normalization pipeline for the story recordings archive.

Run (always isolated, UTF-8):
    C:\\Users\\ybrin\\Downloads\\_pipeline\\.venv\\Scripts\\python.exe -I -X utf8 C:\\Users\\ybrin\\Downloads\\_pipeline\\pipeline.py <command>

Commands:
    init        register all inputs (loose MP4s + zip members) in the state DB
    run         process everything (resumable); loose MP4s first, then zips one at a time
    status      print counts
    dedup       near-duplicate (fingerprint) pass; --apply to actually remove redundant outputs
    export      write StoryArchive/catalog.csv + catalog.json
    fptest      validate the fingerprint on synthetic variants of given audio files

State lives in _pipeline/state.db (SQLite).  Extracted content is untrusted data: it is only
ever passed to ffmpeg/ffprobe as file arguments (staged under neutral numeric names).
"""
import argparse
import csv
import hashlib
import json
import logging
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
import traceback
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np

ROOT = r"C:\Users\ybrin\Downloads"
PIPE = os.path.join(ROOT, "_pipeline")
FFMPEG = "ffmpeg"
FFPROBE = "ffprobe"
GB = 1024 ** 3
MIN_FREE = 15 * GB

AUDIO_EXT = {".mp3", ".wav", ".m4a", ".mp4", ".wma", ".avi", ".aac", ".flac", ".ogg", ".opus",
             ".aif", ".aiff", ".mov", ".m4v", ".3gp", ".amr", ".webm", ".mkv", ".mpga", ".mpeg", ".mpg"}
DOC_EXT = {".pdf", ".png", ".jpg", ".jpeg", ".gif", ".doc", ".docx", ".txt", ".rtf", ".xls",
           ".xlsx", ".ppt", ".pptx", ".tif", ".tiff", ".bmp"}
TERMINAL = ("converted", "duplicate", "document", "failed", "skipped")
HEB = re.compile(r"[\u0590-\u05FF]")
LATIN = re.compile(r"[A-Za-z]")

CATALOG_COLS = [
    "id", "status", "out_path", "source_container", "original_path", "original_ext",
    "original_size_bytes", "original_sha256", "original_codec", "original_bitrate",
    "original_channels", "original_sample_rate", "had_video", "duration_sec", "input_lufs",
    "input_true_peak", "input_lra", "output_size_bytes", "dup_of", "dup_method", "collection",
    "folder", "title_guess", "language_guess", "notes",
    # extra columns
    "original_format", "container_duration_sec", "output_duration_sec", "norm_type",
    "output_lufs_est", "decoded_pcm_md5",
]
EXTRA_DB_COLS = ["key", "seq", "container", "member_index", "kind", "base_name", "album",
                 "fp_path", "error", "attempts", "updated_at", "input_thresh", "target_offset"]

log = logging.getLogger("pipe")


class FatalStop(Exception):
    pass


# ----------------------------------------------------------------------------- utils
def lp(p):
    """Long-path-safe absolute Windows path for Python file operations."""
    p = os.path.abspath(p)
    if p.startswith("\\\\?\\"):
        return p
    return "\\\\?\\" + p


def collapse(s):
    return re.sub(r"\s+", " ", s).strip()


def clean_component(s):
    s = collapse(s).rstrip(". ")
    return s or "_"


def sha256_file(path, bufsize=8 * 1024 * 1024):
    h = hashlib.sha256()
    with open(lp(path), "rb") as f:
        while True:
            b = f.read(bufsize)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def free_bytes():
    return shutil.disk_usage(ROOT).free


def fileurl(p):
    return "file:" + p


def run(cmd, timeout=None, stdout=subprocess.PIPE, stderr=subprocess.PIPE):
    flags = getattr(subprocess, "BELOW_NORMAL_PRIORITY_CLASS", 0) | getattr(subprocess, "CREATE_NO_WINDOW", 0)
    return subprocess.run(cmd, stdout=stdout, stderr=stderr, timeout=timeout, creationflags=flags)


def popen(cmd, stdout, stderr):
    flags = getattr(subprocess, "BELOW_NORMAL_PRIORITY_CLASS", 0) | getattr(subprocess, "CREATE_NO_WINDOW", 0)
    return subprocess.Popen(cmd, stdout=stdout, stderr=stderr, stdin=subprocess.DEVNULL, creationflags=flags)


def ffprobe(path):
    r = run([FFPROBE, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", fileurl(path)],
            timeout=600)
    try:
        return json.loads(r.stdout.decode("utf-8", "replace") or "{}"), r.returncode, r.stderr.decode("utf-8", "replace")
    except json.JSONDecodeError:
        return {}, r.returncode, r.stderr.decode("utf-8", "replace")


def fnum(x):
    try:
        v = float(x)
        return v
    except (TypeError, ValueError):
        return None


def title_guess(stem):
    t = collapse(stem)
    t = re.sub(r"(?i)^copy of\s+", "", t)
    for _ in range(2):
        t = re.sub(r"(?i)\s*-\s*copy(\s*\(\d+\))?$", "", t)
        t = re.sub(r"(?i)\s+copy(\s*\d+)?$", "", t)
        t = re.sub(r"\s*\(\d+\)$", "", t)
    # episode-length suffixes like "10m 44s", "8m18s"
    t = re.sub(r"\s+\d{1,3}m ?\d{1,2}s\b", "", t)
    # Google Drive character substitutions
    t = re.sub(r"_s\b", "'s", t)
    t = re.sub(r"_(?=\s*(-|$))", "?", t)
    t = re.sub(r"(?<=\w)_(?=\w)", "'", t)
    t = t.replace("_", " ")
    t = collapse(t).strip(" -")
    return t or collapse(stem)


def language_guess(components, stem):
    joined = "/".join(components)
    if "אידיש" in components:
        return "yiddish", "language from folder אידיש"
    if HEB.search(stem):
        if not LATIN.search(stem):
            return "yiddish", "language guessed from Hebrew-script name (could be Hebrew)"
        return "unknown", "mixed Hebrew/Latin name"
    low = (joined + "/" + stem).lower()
    if "yiddish" in low:
        if "english" in low:
            return "unknown", "name mentions Yiddish and English"
        return "yiddish", "name mentions Yiddish"
    return "english", ""


# ----------------------------------------------------------------------------- DB
class DB:
    def __init__(self, path):
        self.c = sqlite3.connect(path, check_same_thread=False, isolation_level=None, timeout=120)
        self.c.row_factory = sqlite3.Row
        self.c.execute("PRAGMA journal_mode=WAL")
        self.c.execute("PRAGMA synchronous=NORMAL")
        self.lock = threading.RLock()
        cols = []
        for col in CATALOG_COLS + EXTRA_DB_COLS:
            if col == "key":
                cols.append("key TEXT PRIMARY KEY")
            elif col == "id":
                cols.append("id TEXT UNIQUE")
            else:
                cols.append(f"{col}")
        self.c.execute(f"CREATE TABLE IF NOT EXISTS items ({', '.join(cols)})")
        self.c.execute("CREATE TABLE IF NOT EXISTS containers (name TEXT PRIMARY KEY, kind TEXT, status TEXT, "
                       "size INTEGER, n_members INTEGER, seq INTEGER, updated_at TEXT)")
        self.c.execute("CREATE TABLE IF NOT EXISTS sha_claims (sha TEXT PRIMARY KEY, item_key TEXT)")
        self.c.execute("CREATE TABLE IF NOT EXISTS pcm_claims (md5 TEXT PRIMARY KEY, item_key TEXT)")
        self.c.execute("CREATE TABLE IF NOT EXISTS outpaths (path_cf TEXT PRIMARY KEY, path TEXT, item_key TEXT)")
        self.c.execute("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)")

    def q(self, sql, args=()):
        with self.lock:
            return self.c.execute(sql, args).fetchall()

    def one(self, sql, args=()):
        r = self.q(sql, args)
        return r[0] if r else None

    def upd(self, key, **kw):
        kw["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
        sets = ", ".join(f"{k}=?" for k in kw)
        with self.lock:
            self.c.execute(f"UPDATE items SET {sets} WHERE key=?", list(kw.values()) + [key])

    def item(self, key):
        return self.one("SELECT * FROM items WHERE key=?", (key,))

    def by_id(self, iid):
        return self.one("SELECT * FROM items WHERE id=?", (iid,))


# ----------------------------------------------------------------------------- fingerprint features
FP_SR = 16000
FP_N = 4096
FP_HOP = 2000          # 8 frames / s
FP_BANDS = 16
_edges = np.geomspace(150, 5500, FP_BANDS + 1)
_freqs = np.fft.rfftfreq(FP_N, 1.0 / FP_SR)
FP_MAT = np.zeros((len(_freqs), FP_BANDS), dtype=np.float32)
for _b in range(FP_BANDS):
    FP_MAT[(_freqs >= _edges[_b]) & (_freqs < _edges[_b + 1]), _b] = 1.0
FP_WIN = np.hanning(FP_N).astype(np.float32)


class PcmAnalyzer:
    """Consumes 16 kHz mono s16le PCM incrementally: md5, length, peak, rms, band-energy features."""

    def __init__(self):
        self.md5 = hashlib.md5()
        self.n = 0
        self.peak = 0
        self.sumsq = 0.0
        self.buf = np.zeros(0, dtype=np.int16)
        self.carry = b""
        self.feats = []

    def feed(self, data):
        self.md5.update(data)
        data = self.carry + data
        if len(data) % 2:
            self.carry = data[-1:]
            data = data[:-1]
        else:
            self.carry = b""
        if not data:
            return
        x = np.frombuffer(data, dtype=np.int16)
        self.n += len(x)
        if len(x):
            self.peak = max(self.peak, int(np.abs(x.astype(np.int32)).max()))
            xf = x.astype(np.float64)
            self.sumsq += float(np.dot(xf, xf))
        self.buf = np.concatenate([self.buf, x])
        if len(self.buf) >= FP_N:
            nfr = (len(self.buf) - FP_N) // FP_HOP + 1
            fr = np.lib.stride_tricks.sliding_window_view(self.buf, FP_N)[::FP_HOP][:nfr].astype(np.float32)
            spec = np.fft.rfft(fr * FP_WIN, axis=1)
            p = (spec.real ** 2 + spec.imag ** 2).astype(np.float32) @ FP_MAT
            self.feats.append(np.log10(p + 100.0).astype(np.float16))
            self.buf = self.buf[nfr * FP_HOP:].copy()

    def features(self):
        if not self.feats:
            return np.zeros((0, FP_BANDS), dtype=np.float16)
        return np.concatenate(self.feats, axis=0)


# ----------------------------------------------------------------------------- pipeline
class Pipeline:
    def __init__(self, args):
        self.args = args
        self.archive = args.archive
        self.stage = args.stage
        self.tmp = os.path.join(args.workdir, "tmp")
        self.fpdir = os.path.join(args.workdir, "fp")
        for d in (self.archive, self.stage, self.tmp, self.fpdir):
            os.makedirs(d, exist_ok=True)
        self.db = DB(args.db)
        self.keep_sources = args.keep_sources
        self.stop = threading.Event()
        self.counter = 0
        self.total = 0

    # ------------------------------------------------------------------ registration
    def init(self):
        db = self.db
        if db.one("SELECT v FROM meta WHERE k='initialized'"):
            log.info("already initialized")
            return
        seq = 0
        loose = sorted(f for f in os.listdir(ROOT)
                       if f.lower().endswith(".mp4") and os.path.isfile(os.path.join(ROOT, f)))
        zips = sorted(f for f in os.listdir(ROOT)
                      if f.lower().endswith(".zip") and os.path.isfile(os.path.join(ROOT, f))
                      and re.match(r"^(Stories|Uncle Yossi - Tzivos Hashem Radio Program)-\d{8}T\d{6}Z-\d-\d{3}\.zip$", f))
        cseq = 0
        with db.lock:
            db.c.execute("BEGIN")
            for f in loose:
                cseq += 1
                size = os.path.getsize(os.path.join(ROOT, f))
                db.c.execute("INSERT OR IGNORE INTO containers VALUES (?,?,?,?,?,?,?)",
                             (f, "loose", "pending", size, 1, cseq, None))
                stem = os.path.splitext(f)[0]
                stem2 = re.sub(r"-\d{3}$", "", stem)
                comps = ["Stories", "Story Videos"]
                lang, lnote = language_guess(comps, stem2)
                seq += 1
                notes = ["folder inferred (loose Drive download of an oversized file from Stories/Story Videos); "
                         "Drive download suffix '-%s' stripped" % stem[len(stem2) + 1:]]
                if lnote:
                    notes.append(lnote)
                self._insert(seq=seq, key="loose|" + f, container=f, source_container="loose download",
                             original_path=f, member_index=0, original_ext=".mp4", original_size_bytes=size,
                             kind="audio", comps=comps, base=clean_component(stem2), stem=stem2,
                             lang=lang, notes=notes)
            for z in zips:
                cseq += 1
                size = os.path.getsize(os.path.join(ROOT, z))
                with zipfile.ZipFile(os.path.join(ROOT, z)) as zf:
                    infos = [i for i in zf.infolist() if not i.is_dir()]
                db.c.execute("INSERT OR IGNORE INTO containers VALUES (?,?,?,?,?,?,?)",
                             (z, "zip", "pending", size, len(infos), cseq, None))
                for idx, info in sorted(enumerate(infos), key=lambda t: t[1].filename):
                    name = info.filename
                    parts = name.split("/")
                    comps = [clean_component(c) for c in parts[:-1]]
                    fname = parts[-1]
                    stem, ext = os.path.splitext(fname)
                    if not re.fullmatch(r"\.[A-Za-z0-9]{1,5}", ext or ""):
                        stem, ext = fname, ""
                    e = ext.lower()
                    kind = "document" if e in DOC_EXT else ("audio" if e in AUDIO_EXT else "unknown")
                    lang, lnote = language_guess(comps, stem)
                    seq += 1
                    notes = [lnote] if lnote else []
                    self._insert(seq=seq, key=f"{z}|{name}", container=z, source_container=z,
                                 original_path=name, member_index=idx, original_ext=e, original_size_bytes=info.file_size,
                                 kind=kind, comps=comps, base=clean_component(stem) if stem.strip() else "_",
                                 stem=stem, lang=lang, notes=notes, keep_ext=ext)
            db.c.execute("INSERT OR REPLACE INTO meta VALUES ('initialized', ?)", (time.strftime("%Y-%m-%d %H:%M:%S"),))
            db.c.execute("COMMIT")
        log.info("registered %d loose files, %d zips, %d items", len(loose), len(zips), seq)

    def _insert(self, seq, key, container, source_container, original_path, member_index, original_ext,
                original_size_bytes, kind, comps, base, stem, lang, notes, keep_ext=""):
        collection = comps[0] if comps else ""
        folder = "/".join(comps[1:])
        row = dict(key=key, seq=seq, container=container, source_container=source_container,
                   original_path=original_path, member_index=member_index, original_ext=original_ext,
                   original_size_bytes=original_size_bytes, kind=kind, collection=collection, folder=folder,
                   base_name=base + (keep_ext if kind == "document" else ""), album="/".join(comps),
                   title_guess=title_guess(stem), language_guess=lang, notes="; ".join(notes),
                   status="pending", attempts=0)
        cols = ",".join(row)
        self.db.c.execute(f"INSERT OR IGNORE INTO items ({cols}) VALUES ({','.join('?' * len(row))})",
                          list(row.values()))

    # ------------------------------------------------------------------ helpers
    def note(self, key, text):
        r = self.db.item(key)
        cur = r["notes"] or ""
        if text in cur:
            return
        self.db.upd(key, notes=(cur + "; " + text) if cur else text)

    def ensure_free(self, needed, what):
        deadline = time.time() + 600
        while True:
            fb = free_bytes()
            if fb - needed >= MIN_FREE:
                return
            if time.time() > deadline:
                raise FatalStop(f"Not enough disk space for {what}: free {fb / GB:.1f} GB, need {needed / GB:.1f} GB "
                                f"+ {MIN_FREE / GB:.0f} GB reserve. Stopping; rerun 'run' after freeing space.")
            log.warning("low disk space (%.1f GB free, need %.1f GB + reserve) for %s; waiting",
                        fb / GB, needed / GB, what)
            time.sleep(15)

    def alloc_path(self, key, subdir, comps_folder, base, ext):
        """Allocate a unique (case-insensitive) relative output path; never reuses another item's path."""
        r = self.db.item(key)
        with self.db.lock:
            if r["out_path"] and r["out_path"].startswith(subdir + "/"):
                return r["out_path"]
            folder = "/".join(x for x in [subdir, comps_folder] if x)
            n = 1
            while True:
                name = base if n == 1 else f"{base} ({n})"
                rel = f"{folder}/{name}{ext}"
                cf = rel.casefold()
                hit = self.db.one("SELECT item_key FROM outpaths WHERE path_cf=?", (cf,))
                if hit is None and not os.path.exists(lp(os.path.join(self.archive, rel))):
                    self.db.c.execute("INSERT INTO outpaths VALUES (?,?,?)", (cf, rel, key))
                    self.db.upd(key, out_path=rel)
                    return rel
                if hit is not None and hit["item_key"] == key:
                    self.db.upd(key, out_path=rel)
                    return rel
                n += 1

    def stage_path(self, r):
        cname = os.path.splitext(r["container"])[0]
        m = re.match(r"^([A-Za-z]+).*-(\d{3})$", cname)
        cdir = f"{m.group(1)}_{m.group(2)}" if m else re.sub(r"[^A-Za-z0-9]+", "_", cname)[-48:]
        ext = r["original_ext"] if re.fullmatch(r"\.[a-z0-9]{1,5}", r["original_ext"] or "") else ".bin"
        return os.path.join(self.stage, cdir, f"{r['member_index']:05d}{ext}")

    def source_file(self, r):
        if r["source_container"] == "loose download":
            return os.path.join(ROOT, r["original_path"])
        return self.stage_path(r)

    def extract(self, r):
        dst = self.stage_path(r)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        self.ensure_free(r["original_size_bytes"] or 0, r["original_path"])
        h = hashlib.sha256()
        with zipfile.ZipFile(os.path.join(ROOT, r["container"])) as zf:
            info = zf.getinfo(r["original_path"])
            with zf.open(info) as src, open(dst + ".part", "wb") as out:
                while True:
                    b = src.read(8 * 1024 * 1024)
                    if not b:
                        break
                    h.update(b)
                    out.write(b)
        os.replace(dst + ".part", dst)
        if os.path.getsize(dst) != info.file_size:
            raise RuntimeError("extracted size mismatch")
        return dst, h.hexdigest()

    def drop_source(self, r):
        """Delete the staged copy (zip member) or the loose source after its output is verified."""
        src = self.source_file(r)
        if r["source_container"] == "loose download":
            if self.keep_sources:
                return
            st = self.db.item(r["key"])
            if st["status"] in ("converted", "duplicate") and not (st["notes"] or "").count("source kept"):
                if st["status"] == "converted":
                    p = os.path.join(self.archive, st["out_path"])
                    if not os.path.exists(lp(p)):
                        raise RuntimeError("refusing to delete loose source: output missing")
                if os.path.exists(src):
                    os.remove(src)
                    log.info("deleted loose source %s", r["original_path"])
        else:
            if os.path.exists(src):
                os.remove(src)

    def preserve_original(self, key, src, subdir, reason, status):
        """Keep an unconvertible zip member verbatim under StoryArchive/<subdir>/..."""
        r = self.db.item(key)
        if r["source_container"] == "loose download":
            self.db.upd(key, status=status, error=reason)
            self.note(key, "source kept in Downloads (not deleted): " + reason)
            return
        fname = os.path.basename(r["original_path"])
        stem, ext = os.path.splitext(fname)
        if not re.fullmatch(r"\.[A-Za-z0-9]{1,5}", ext or ""):
            stem, ext = fname, ""
        rel = self.alloc_path(key, subdir, "/".join(x for x in [r["collection"], r["folder"]] if x),
                              clean_component(stem), ext)
        dst = os.path.join(self.archive, rel)
        os.makedirs(lp(os.path.dirname(dst)), exist_ok=True)
        shutil.copyfile(lp(src), lp(dst))
        if sha256_file(dst) != r["original_sha256"]:
            raise RuntimeError("copy verification failed for preserved original")
        self.db.upd(key, status=status, error=reason, out_path=rel, output_size_bytes=os.path.getsize(lp(dst)))
        self.note(key, f"original kept verbatim ({reason})")

    # ------------------------------------------------------------------ ffmpeg steps
    def pass1(self, src, iid):
        errf = os.path.join(self.tmp, f"{iid}_p1.log")
        fc = ("[0:a:0]aformat=channel_layouts=mono,asplit=2[m][p];"
              "[m]loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json[mo];"
              "[p]aresample=16000,aformat=sample_fmts=s16:sample_rates=16000:channel_layouts=mono[po]")
        cmd = [FFMPEG, "-hide_banner", "-nostdin", "-nostats", "-v", "info", "-threads", "1",
               "-i", fileurl(src), "-filter_complex", fc,
               "-map", "[mo]", "-f", "null", "-", "-map", "[po]", "-f", "s16le", "pipe:1"]
        an = PcmAnalyzer()
        with open(errf, "wb") as ef:
            p = popen(cmd, stdout=subprocess.PIPE, stderr=ef)
            try:
                while True:
                    b = p.stdout.read(1 << 20)
                    if not b:
                        break
                    an.feed(b)
                rc = p.wait(timeout=7200)
            except Exception:
                p.kill()
                raise
        err = open(errf, "rb").read().decode("utf-8", "replace")
        loud = None
        m = list(re.finditer(r"\{\s*\"input_i\".*?\}", err, re.S))
        if m:
            try:
                loud = json.loads(m[-1].group(0))
            except json.JSONDecodeError:
                loud = None
        errlines = [l for l in err.splitlines()
                    if re.search(r"(?i)error|invalid|corrupt|header missing|overread|truncat", l)]
        return dict(rc=rc, an=an, loud=loud, errlines=errlines, err_tail=err[-1500:])

    def copy_audio(self, src, iid):
        dst = os.path.join(self.tmp, f"{iid}_a.mka")
        r = run([FFMPEG, "-hide_banner", "-nostdin", "-v", "error", "-y", "-i", fileurl(src), "-map", "0:a:0",
                 "-c", "copy", "-vn", "-sn", "-dn", "-map_metadata", "-1", "-map_chapters", "-1", fileurl(dst)],
                timeout=7200)
        if r.returncode != 0 or not os.path.exists(dst) or os.path.getsize(dst) == 0:
            if os.path.exists(dst):
                os.remove(dst)
            return None
        return dst

    def pass2(self, src, iid, loud, normalize, title, album, comment):
        out = os.path.join(self.tmp, f"{iid}.mp3")
        if normalize:
            af = ("aformat=channel_layouts=mono,loudnorm=I=-16:TP=-1.5:LRA=11:"
                  f"measured_I={loud['input_i']}:measured_TP={loud['input_tp']}:measured_LRA={loud['input_lra']}:"
                  f"measured_thresh={loud['input_thresh']}:offset={loud['target_offset']}:linear=true:"
                  "print_format=json,aresample=44100")
        else:
            af = "aformat=channel_layouts=mono,aresample=44100"
        cmd = [FFMPEG, "-hide_banner", "-nostdin", "-nostats", "-v", "info", "-y", "-threads", "1",
               "-i", fileurl(src), "-map", "0:a:0", "-vn", "-sn", "-dn", "-map_metadata", "-1", "-map_chapters", "-1",
               "-af", af, "-c:a", "libmp3lame", "-b:a", "96k", "-ar", "44100", "-ac", "1",
               "-id3v2_version", "3", "-write_xing", "1",
               "-metadata", f"title={title}", "-metadata", f"album={album}", "-metadata", f"comment={comment}",
               fileurl(out)]
        r = run(cmd, timeout=7200)
        err = r.stderr.decode("utf-8", "replace")
        info = None
        m = list(re.finditer(r"\{\s*\"input_i\".*?\}", err, re.S))
        if m:
            try:
                info = json.loads(m[-1].group(0))
            except json.JSONDecodeError:
                pass
        if r.returncode != 0:
            raise RuntimeError("encode failed: " + err[-800:])
        return out, info

    def verify_mp3(self, path, src_dur):
        pr, rc, err = ffprobe(path)
        st = [s for s in pr.get("streams", []) if s.get("codec_type") == "audio"]
        if rc != 0 or not st:
            return False, None, "ffprobe failed on output: " + err[-300:]
        a = st[0]
        if a.get("codec_name") != "mp3" or str(a.get("sample_rate")) != "44100" or int(a.get("channels", 0)) != 1:
            return False, None, f"unexpected output format {a.get('codec_name')} {a.get('sample_rate')} {a.get('channels')}"
        od = fnum(pr.get("format", {}).get("duration"))
        if od is None:
            return False, None, "no output duration"
        tol = max(2.0, 0.01 * src_dur)
        if abs(od - src_dur) > tol:
            return False, od, f"output duration {od:.2f}s vs source {src_dur:.2f}s exceeds tolerance {tol:.2f}s"
        r = run([FFMPEG, "-hide_banner", "-nostdin", "-v", "error", "-i", fileurl(path), "-f", "null", "-"], timeout=3600)
        e = r.stderr.decode("utf-8", "replace").strip()
        if r.returncode != 0 or e:
            return False, od, "output decode check failed: " + e[-300:]
        return True, od, ""

    # ------------------------------------------------------------------ per-item processing
    def process(self, key):
        if self.stop.is_set():
            return key, "stopped"
        db = self.db
        r = db.item(key)
        if r["status"] in TERMINAL:
            return key, r["status"]
        db.upd(key, status="processing", attempts=(r["attempts"] or 0) + 1)
        t0 = time.time()
        src = None
        tmpfiles = []
        try:
            # 1. stage + hash
            if r["source_container"] == "loose download":
                src = self.source_file(r)
                if not os.path.exists(src):
                    raise RuntimeError("loose source missing")
                sha = r["original_sha256"] or sha256_file(src)
            else:
                src, sha = self.extract(r)
            with db.lock:
                r = db.item(key)
                iid = r["id"]
                if not iid:
                    iid = sha[:10]
                    if db.by_id(iid) is not None:
                        iid = sha[:10] + "-" + hashlib.md5(key.encode("utf-8")).hexdigest()[:4]
                db.upd(key, id=iid, original_sha256=sha)
                db.c.execute("INSERT OR IGNORE INTO sha_claims VALUES (?,?)", (sha, key))
                claim = db.one("SELECT item_key FROM sha_claims WHERE sha=?", (sha,))["item_key"]
            if claim != key:
                owner = db.item(claim)
                db.upd(key, status="duplicate", dup_of=owner["id"], dup_method="sha256")
                self.note(key, "byte-identical to " + owner["original_path"])
                self.drop_source(db.item(key))
                return key, "duplicate"

            # 2. documents
            if r["kind"] == "document":
                rel = self.alloc_path(key, "documents", "/".join(x for x in [r["collection"], r["folder"]] if x),
                                      os.path.splitext(r["base_name"])[0], os.path.splitext(r["base_name"])[1])
                dst = os.path.join(self.archive, rel)
                os.makedirs(lp(os.path.dirname(dst)), exist_ok=True)
                shutil.copyfile(lp(src), lp(dst))
                if sha256_file(dst) != sha:
                    raise RuntimeError("document copy verification failed")
                db.upd(key, status="document", output_size_bytes=os.path.getsize(lp(dst)))
                self.drop_source(db.item(key))
                return key, "document"

            # 3. probe
            pr, rc, perr = ffprobe(src)
            streams = pr.get("streams", [])
            fmt = pr.get("format", {})
            auds = [s for s in streams if s.get("codec_type") == "audio"]
            vids = [s for s in streams if s.get("codec_type") == "video"
                    and not (s.get("disposition") or {}).get("attached_pic")]
            db.upd(key, original_format=fmt.get("format_name"), had_video=1 if vids else 0)
            if not auds:
                why = "no audio stream" if fmt else ("not a recognizable media file: " + perr.strip()[-200:])
                status = "skipped" if (fmt and vids) else "failed"
                self.preserve_original(key, src, "unconverted", why, status)
                self.drop_source(db.item(key))
                log.warning("%s %s: %s", status, r["original_path"], why)
                return key, status
            a = auds[0]
            br = a.get("bit_rate") or fmt.get("bit_rate")
            cdur = fnum(a.get("duration")) or fnum(fmt.get("duration"))
            db.upd(key, original_codec=a.get("codec_name"), original_bitrate=int(br) if br and str(br).isdigit() else None,
                   original_channels=a.get("channels"), original_sample_rate=fnum(a.get("sample_rate")),
                   container_duration_sec=round(cdur, 3) if cdur else None)
            if len(auds) > 1:
                self.note(key, f"{len(auds)} audio streams; used the first")
            if r["kind"] == "unknown":
                self.note(key, f"no/unknown extension; detected format {fmt.get('format_name')} / {a.get('codec_name')}")

            # 4. audio-only working copy for big / video files
            work = src
            if vids or (r["original_size_bytes"] or 0) > 400 * 1024 * 1024:
                c = self.copy_audio(src, iid)
                if c:
                    work = c
                    tmpfiles.append(c)

            # 5. pass 1: loudness + decoded hash + fingerprint
            p1 = self.pass1(work, iid)
            tmpfiles.append(os.path.join(self.tmp, f"{iid}_p1.log"))
            an = p1["an"]
            if an.n == 0:
                self.preserve_original(key, src, "unconverted", "audio could not be decoded: " +
                                       " | ".join(p1["errlines"][-3:])[-300:], "failed")
                self.drop_source(db.item(key))
                log.warning("failed (undecodable) %s", r["original_path"])
                return key, "failed"
            dur = an.n / FP_SR
            md5 = an.md5.hexdigest()
            loud = p1["loud"] or {}
            ii, itp, ilra = fnum(loud.get("input_i")), fnum(loud.get("input_tp")), fnum(loud.get("input_lra"))
            peak_db = 20 * np.log10(an.peak / 32768.0) if an.peak > 0 else float("-inf")
            db.upd(key, duration_sec=round(dur, 3), decoded_pcm_md5=md5,
                   input_lufs=ii if ii is not None and np.isfinite(ii) else None,
                   input_true_peak=itp if itp is not None and np.isfinite(itp) else None,
                   input_lra=ilra if ilra is not None and np.isfinite(ilra) else None,
                   input_thresh=fnum(loud.get("input_thresh")), target_offset=fnum(loud.get("target_offset")))
            if p1["rc"] != 0:
                self.note(key, f"decoder exited with code {p1['rc']} (partial decode)")
            if p1["errlines"]:
                self.note(key, f"decoder reported {len(p1['errlines'])} error/warning lines (e.g. '{p1['errlines'][0][-120:]}')")
            keep_original = False
            if cdur and abs(cdur - dur) > max(2.0, 0.01 * dur):
                keep_original = True
                self.note(key, f"DURATION MISMATCH: container says {cdur:.1f}s but decodable audio is {dur:.1f}s")
            silent = (ii is None or not np.isfinite(ii) or ii < -50 or peak_db < -60)
            normalize = not silent and all(fnum(loud.get(k)) is not None and np.isfinite(fnum(loud.get(k)))
                                           for k in ("input_i", "input_tp", "input_lra", "input_thresh", "target_offset"))
            if silent:
                self.note(key, f"SILENT/near-silent source (I={loud.get('input_i')} LUFS, peak {peak_db:.1f} dBFS): "
                               "encoded without loudness normalization")
            elif ii is not None and ii < -35:
                self.note(key, f"very quiet source (I={ii:.1f} LUFS)")
            if dur < 2:
                self.note(key, f"very short ({dur:.2f}s)")

            # 6. decoded-audio dedup
            if not silent and dur >= 3:
                with db.lock:
                    db.c.execute("INSERT OR IGNORE INTO pcm_claims VALUES (?,?)", (md5, key))
                    claim = db.one("SELECT item_key FROM pcm_claims WHERE md5=?", (md5,))["item_key"]
                if claim != key:
                    owner = db.item(claim)
                    db.upd(key, status="duplicate", dup_of=owner["id"], dup_method="decoded_audio_md5")
                    self.note(key, "decoded audio identical to " + owner["original_path"])
                    self.drop_source(db.item(key))
                    return key, "duplicate"
            # 7. fingerprint
            feats = an.features()
            if len(feats) >= 16 and not silent:
                fp = os.path.join(self.fpdir, f"{iid}.npy")
                np.save(fp, feats)
                db.upd(key, fp_path=os.path.basename(fp))

            # 8. encode
            r = db.item(key)
            rel = self.alloc_path(key, "audio", "/".join(x for x in [r["collection"], r["folder"]] if x),
                                  r["base_name"], ".mp3")
            out, info = self.pass2(work, iid, loud, normalize, r["title_guess"], r["album"], f"StoryArchive ID {iid}")
            tmpfiles.append(out)
            ok, od, msg = self.verify_mp3(out, dur)
            if not ok:
                raise RuntimeError("verification failed: " + msg)
            norm_type = (info or {}).get("normalization_type") if normalize else "none"
            dst = os.path.join(self.archive, rel)
            os.makedirs(lp(os.path.dirname(dst)), exist_ok=True)
            os.replace(lp(out), lp(dst))
            if not os.path.exists(lp(dst)):
                raise RuntimeError("output move failed")
            db.upd(key, status="converted", output_size_bytes=os.path.getsize(lp(dst)), output_duration_sec=round(od, 3),
                   norm_type=norm_type, output_lufs_est=fnum((info or {}).get("output_i")), error=None)
            if keep_original:
                if r["source_container"] == "loose download":
                    self.note(key, "source kept in Downloads (not deleted) because of duration mismatch")
                else:
                    self.preserve_original_extra(key, src)
            self.drop_source(db.item(key))
            log.info("converted %s -> %s (%.0fs audio, %.0fs work)", r["original_path"], rel, dur, time.time() - t0)
            return key, "converted"
        except FatalStop:
            db.upd(key, status="pending")
            self.stop.set()
            raise
        except Exception as e:
            tb = traceback.format_exc()
            log.error("error on %s: %s", key, tb)
            r = db.item(key)
            if (r["attempts"] or 0) < 2:
                db.upd(key, status="pending", error=str(e)[-1000:])
                return key, "retry"
            try:
                if src and os.path.exists(src) and r["original_sha256"]:
                    self.preserve_original(key, src, "unconverted", "processing error: " + str(e)[-300:], "failed")
                    self.drop_source(db.item(key))
                else:
                    db.upd(key, status="failed", error=str(e)[-1000:])
            except Exception:
                db.upd(key, status="failed", error=(str(e) + " | " + traceback.format_exc())[-1000:])
            return key, "failed"
        finally:
            for f in tmpfiles:
                try:
                    if os.path.exists(f):
                        os.remove(f)
                except OSError:
                    pass

    def preserve_original_extra(self, key, src):
        r = self.db.item(key)
        fname = os.path.basename(r["original_path"])
        stem, ext = os.path.splitext(fname)
        folder = "/".join(x for x in ["originals_kept", r["collection"], r["folder"]] if x)
        rel = f"{folder}/{clean_component(stem)}{ext}"
        n = 2
        while os.path.exists(lp(os.path.join(self.archive, rel))):
            rel = f"{folder}/{clean_component(stem)} ({n}){ext}"
            n += 1
        dst = os.path.join(self.archive, rel)
        os.makedirs(lp(os.path.dirname(dst)), exist_ok=True)
        shutil.copyfile(lp(src), lp(dst))
        self.note(key, "original also kept verbatim at " + rel)

    # ------------------------------------------------------------------ orchestration
    def recover(self):
        n = self.db.q("SELECT count(*) c FROM items WHERE status='processing'")[0]["c"]
        if n:
            log.info("resetting %d interrupted items to pending", n)
            self.db.q("UPDATE items SET status='pending' WHERE status='processing'")
        for f in os.listdir(self.tmp):
            try:
                os.remove(os.path.join(self.tmp, f))
            except OSError:
                pass
        # loose sources whose processing finished but were not yet deleted
        for r in self.db.q("SELECT * FROM items WHERE source_container='loose download' AND status IN ('converted','duplicate')"):
            if os.path.exists(self.source_file(r)):
                self.drop_source(r)

    def run_keys(self, ex, keys):
        futs = {ex.submit(self.process, k): k for k in keys}
        fatal = None
        for f in as_completed(futs):
            try:
                k, st = f.result()
            except FatalStop as e:
                fatal = e
                continue
            except Exception as e:
                log.error("worker crash %s: %s", futs[f], e)
                continue
            self.counter += 1
            if st not in ("stopped",):
                log.info("[%d/%d] %s %s", self.counter, self.total, st, k)
        if fatal:
            raise fatal

    def finalize_container(self, name):
        db = self.db
        c = db.one("SELECT * FROM containers WHERE name=?", (name,))
        rows = db.q("SELECT * FROM items WHERE container=?", (name,))
        bad = [r for r in rows if r["status"] not in TERMINAL]
        if bad:
            log.warning("container %s not complete (%d items unfinished)", name, len(bad))
            return False
        for r in rows:
            if r["status"] in ("converted", "document") or (r["status"] in ("failed", "skipped") and r["out_path"]):
                if not os.path.exists(lp(os.path.join(self.archive, r["out_path"]))):
                    log.error("output missing for %s; not deleting container", r["key"])
                    return False
            if r["status"] == "duplicate" and not db.by_id(r["dup_of"]):
                log.error("dup_of target missing for %s", r["key"])
                return False
        if c["kind"] == "zip":
            sdir = os.path.dirname(self.stage_path(rows[0])) if rows else None
            if sdir and os.path.isdir(sdir):
                shutil.rmtree(lp(sdir))
            zp = os.path.join(ROOT, name)
            if not self.keep_sources and os.path.exists(zp):
                os.remove(zp)
                log.info("deleted zip %s (all %d members accounted for)", name, len(rows))
            db.q("UPDATE containers SET status=?, updated_at=? WHERE name=?",
                 ("deleted" if not self.keep_sources else "done", time.strftime("%Y-%m-%d %H:%M:%S"), name))
        else:
            src = os.path.join(ROOT, name)
            gone = not os.path.exists(src)
            db.q("UPDATE containers SET status=?, updated_at=? WHERE name=?",
                 ("deleted" if gone else "done", time.strftime("%Y-%m-%d %H:%M:%S"), name))
        return True

    def run(self):
        self.init()
        self.recover()
        db = self.db
        self.total = db.q("SELECT count(*) c FROM items")[0]["c"]
        self.counter = db.q(f"SELECT count(*) c FROM items WHERE status IN {TERMINAL}")[0]["c"]
        only = set(self.args.only or [])
        with ThreadPoolExecutor(max_workers=self.args.workers) as ex:
            conts = db.q("SELECT * FROM containers ORDER BY CASE kind WHEN 'loose' THEN 0 ELSE 1 END, seq")
            loose = [c["name"] for c in conts if c["kind"] == "loose"]
            zips = [c["name"] for c in conts if c["kind"] == "zip"]
            # loose MP4s first (all together)
            keys = [r["key"] for r in db.q(
                f"SELECT key FROM items WHERE source_container='loose download' AND status NOT IN {TERMINAL} ORDER BY seq")]
            if only:
                keys = [k for k in keys if k in only]
            for attempt in range(3):
                if not keys:
                    break
                self.run_keys(ex, keys)
                keys = [r["key"] for r in db.q(
                    f"SELECT key FROM items WHERE source_container='loose download' AND status NOT IN {TERMINAL} ORDER BY seq")]
                if only:
                    keys = [k for k in keys if k in only]
            if not only:
                for n in loose:
                    self.finalize_container(n)
            for z in zips:
                c = db.one("SELECT * FROM containers WHERE name=?", (z,))
                if c["status"] in ("deleted", "done"):
                    continue
                if not os.path.exists(os.path.join(ROOT, z)):
                    raise FatalStop(f"zip {z} missing but not finished")
                for attempt in range(3):
                    keys = [r["key"] for r in db.q(
                        f"SELECT key FROM items WHERE container=? AND status NOT IN {TERMINAL} ORDER BY original_size_bytes DESC", (z,))]
                    if only:
                        keys = [k for k in keys if k in only]
                    if not keys:
                        break
                    if attempt == 0:
                        unc = sum(r["original_size_bytes"] for r in db.q(
                            f"SELECT original_size_bytes FROM items WHERE container=? AND status NOT IN {TERMINAL}", (z,)))
                        fb = free_bytes()
                        log.info("zip %s: %d members to process, %.1f GB uncompressed, %.1f GB free",
                                 z, len(keys), unc / GB, fb / GB)
                        if fb - unc < MIN_FREE:
                            log.warning("free space minus full zip size would be below reserve; extracting member-by-member with checks")
                    self.run_keys(ex, keys)
                if not only:
                    self.finalize_container(z)
        log.info("run finished")


# ----------------------------------------------------------------------------- near-duplicate pass
def load_fp_shape(path):
    return np.load(path, mmap_mode="r")


def load_fp(path):
    f = np.load(path).astype(np.float32)
    return f


def znorm(F):
    F = F - F.mean(axis=0, keepdims=True)
    return F


def subfp_keys(F):
    """Haitsma-Kalker style 15-bit sub-fingerprints combined over t and t+2 into 30-bit keys."""
    if len(F) < 8:
        return np.zeros(0, np.uint32), np.zeros(0, np.int32)
    D = F[:, :-1] - F[:, 1:]
    bits = (D[1:] - D[:-1]) > 0                     # (T-1) x 15
    w = (1 << np.arange(15)).astype(np.uint32)
    k = (bits.astype(np.uint32) * w).sum(axis=1).astype(np.uint32)
    e = F.mean(axis=1)[1:]
    thr = np.percentile(e, 90) - 3.0                 # skip quiet frames (log10 units: 3 = 30 dB below loud)
    t = np.arange(len(k) - 2)
    valid = (e[t] > thr) & (e[t + 2] > thr)
    keys = (k[t] << np.uint32(15)) | k[t + 2]
    return keys[valid], (t[valid] + 1).astype(np.int32)


def active_mask(Fraw):
    e = Fraw.mean(axis=1)
    if len(e) == 0:
        return np.zeros(0, bool)
    return e > (np.percentile(e, 90) - 2.5)


def chunk_match(A, B, Aact, offsets, chunk=240, thr=0.8, drift=0.015):
    """For each active chunk of A (enough signal), find the best correlation against B around the candidate
    offsets; the search radius grows with position to tolerate small speed differences (tape transfers).
    Returns (matched fraction of A's active chunks, corrs of active chunks, fraction of B frames matched)."""
    TA, TB = len(A), len(B)
    corrs = []
    matched = 0
    active = 0
    matchedB = np.zeros(TB, dtype=bool)
    for s in range(0, TA, chunk):
        a = A[s:s + chunk]
        if len(a) < chunk // 3:
            break
        if Aact[s:s + chunk].mean() < 0.2:
            continue
        active += 1
        av = (a - a.mean()).ravel()
        an = np.linalg.norm(av)
        best, bestd = -1.0, None
        radius = min(160, 6 + int(drift * s))
        cand = set()
        for d0 in offsets:
            cand.update(range(d0 - radius, d0 + radius + 1))
        for d in sorted(cand):
            bs = s + d
            lo = max(0, -bs)
            hi = min(len(a), TB - bs)
            if hi - lo < 0.6 * len(a):
                continue
            if lo == 0 and hi == len(a):
                b = B[bs:bs + len(a)]
                bv = (b - b.mean()).ravel()
                avv, ann = av, an
            else:
                asub = a[lo:hi]
                avv = (asub - asub.mean()).ravel()
                ann = np.linalg.norm(avv)
                b = B[bs + lo:bs + hi]
                bv = (b - b.mean()).ravel()
            bn = np.linalg.norm(bv)
            if bn < 1e-6 or ann < 1e-6:
                continue
            c = float(avv @ bv / (ann * bn))
            if c > best:
                best, bestd = c, d
        corrs.append(best)
        if best >= thr:
            matched += 1
            matchedB[max(0, s + bestd): max(0, s + bestd + len(a))] = True
    frac = matched / active if active else 0.0
    return frac, corrs, matchedB.mean() if TB else 0.0


def global_corr(A, B, d):
    """Pearson correlation of the full overlap of A and B at offset d (B index = A index + d)."""
    a0 = max(0, -d)
    a1 = min(len(A), len(B) - d)
    if a1 - a0 < 16:
        return -1.0, 0
    a = A[a0:a1]
    b = B[a0 + d:a1 + d]
    av = (a - a.mean()).ravel()
    bv = (b - b.mean()).ravel()
    n = np.linalg.norm(av) * np.linalg.norm(bv)
    return (float(av @ bv / n) if n > 0 else -1.0), a1 - a0


def env_offsets(A, B, top=3):
    """Best offsets by FFT cross-correlation of the mean energy envelopes."""
    ea = A.mean(axis=1)
    eb = B.mean(axis=1)
    ea = ea - ea.mean()
    eb = eb - eb.mean()
    n = 1
    while n < len(ea) + len(eb):
        n *= 2
    X = np.fft.irfft(np.fft.rfft(eb, n) * np.conj(np.fft.rfft(ea, n)), n)
    lags = np.concatenate([np.arange(0, len(eb)), np.arange(-len(ea) + 1, 0)])
    vals = np.concatenate([X[:len(eb)], X[n - len(ea) + 1:]])
    ov = np.minimum(len(ea), len(eb) - lags) - np.maximum(0, -lags)
    vals = vals / np.maximum(ov, 1)
    ok = ov >= min(len(ea), len(eb)) * 0.3
    vals = np.where(ok, vals, -np.inf)
    idx = np.argsort(vals)[::-1][:top * 20]
    res = []
    for i in idx:
        d = int(lags[i])
        if all(abs(d - x) > 8 for x in res):
            res.append(d)
        if len(res) >= top:
            break
    return res


def compare(Araw, Braw, offsets):
    """Full comparison of feature matrices. Returns dict of scores."""
    Aact, Bact = active_mask(Araw), active_mask(Braw)
    A = znorm(Araw)
    B = znorm(Braw)
    best = (-1.0, 0, 0)
    for d0 in offsets:
        for d in range(d0 - 6, d0 + 7):
            c, ov = global_corr(A, B, d)
            if c > best[0]:
                best = (c, d, ov)
    gc, gd, ov = best
    offs = sorted(set(list(offsets) + [gd]))
    fa, corrs, _ = chunk_match(A, B, Aact, offs)
    fb, corrsb, _ = chunk_match(B, A, Bact, sorted(set(-x for x in offs)))
    return dict(global_corr=gc, offset=gd, overlap=ov, cov_a=fa, cov_b=fb,
                min_chunk=min(corrs) if corrs else -1.0, min_chunk_b=min(corrsb) if corrsb else -1.0)


def norm_title(t):
    t = (t or "").casefold()
    t = re.sub(r"\b(part|pt)\b", "part", t)
    return re.sub(r"[^\w]+|_", "", t)


QUALITY_LOSSLESS = ("pcm_", "flac", "alac", "wavpack", "ape", "tta")


def quality_key(r):
    codec = (r["original_codec"] or "")
    lossless = 1 if codec.startswith(QUALITY_LOSSLESS) else 0
    br = r["original_bitrate"] or 0
    sr = r["original_sample_rate"] or 0
    return (lossless, br, sr, r["duration_sec"] or 0, -(r["seq"] or 0))


HIGH = dict(global_corr=0.95, cov=0.95, min_chunk=0.60, dur=1.0)


def is_high(s, da, db):
    return (abs(da - db) <= HIGH["dur"] and s["global_corr"] >= HIGH["global_corr"]
            and s["cov_a"] >= HIGH["cov"] and s["cov_b"] >= HIGH["cov"]
            and s["min_chunk"] >= HIGH["min_chunk"] and s["min_chunk_b"] >= HIGH["min_chunk"])


def pair_relation(src, cov_a, cov_b, da, db_):
    sc, lc = (cov_a, cov_b) if da <= db_ else (cov_b, cov_a)
    if src == "chained-high-confidence":
        return "near-identical via a third copy (check)"
    if sc >= 0.9 and lc >= 0.9:
        return "same recording, different length/edit/transfer"
    if sc >= 0.9:
        return "shorter is contained in longer (excerpt/segment)"
    if max(cov_a, cov_b) >= 0.3:
        return "partial overlap (shared segment)"
    return "same title, audio differs"


def dedup(args):
    db = DB(args.db)
    fpdir = os.path.join(args.workdir, "fp")
    rows = [r for r in db.q("SELECT * FROM items WHERE status='converted' AND fp_path IS NOT NULL ORDER BY seq")]
    log.info("near-dup pass over %d converted items with fingerprints", len(rows))
    idx = {r["key"]: i for i, r in enumerate(rows)}
    feats = {}

    def F(i):
        if i not in feats:
            feats[i] = load_fp(os.path.join(fpdir, rows[i]["fp_path"]))
        return feats[i]

    # --- candidate generation via hashed sub-fingerprints
    allk, alli, allt = [], [], []
    for i, r in enumerate(rows):
        k, t = subfp_keys(load_fp(os.path.join(fpdir, r["fp_path"])))
        allk.append(k)
        alli.append(np.full(len(k), i, np.int32))
        allt.append(t)
    K = np.concatenate(allk)
    I = np.concatenate(alli)
    T = np.concatenate(allt)
    log.info("%d hashed frames", len(K))
    order = np.argsort(K, kind="stable")
    K, I, T = K[order], I[order], T[order]
    # run lengths
    starts = np.flatnonzero(np.concatenate([[True], K[1:] != K[:-1]]))
    lens = np.diff(np.concatenate([starts, [len(K)]]))
    runlen = np.repeat(lens, lens)
    MAXRUN = 24
    pa, pb, pd, pta, ptb = [], [], [], [], []
    for m in range(1, MAXRUN):
        sel = np.flatnonzero((runlen[:-m] <= MAXRUN) & (K[:-m] == K[m:]))
        if len(sel) == 0:
            break
        a, b = I[sel], I[sel + m]
        ta, tb = T[sel], T[sel + m]
        keep = a != b
        a, b, ta, tb = a[keep], b[keep], ta[keep], tb[keep]
        sw = a > b
        pa.append(np.where(sw, b, a)); pb.append(np.where(sw, a, b))
        pta.append(np.where(sw, tb, ta)); ptb.append(np.where(sw, ta, tb))
    cands = {}
    CH = 240
    nch = np.array([max(1, int(np.ceil(len(load_fp_shape(os.path.join(fpdir, r["fp_path"]))) / CH))) for r in rows])
    if pa:
        pa = np.concatenate(pa).astype(np.int64)
        pb = np.concatenate(pb).astype(np.int64)
        pta = np.concatenate(pta).astype(np.int64)
        ptb = np.concatenate(ptb).astype(np.int64)
        pd = ptb - pta
        N = len(rows)
        pair = pa * N + pb
        # offset votes
        OB = 4
        code = pair * (1 << 21) + (pd // OB) + (1 << 20)
        u, cnt = np.unique(code, return_counts=True)
        upair = u // (1 << 21)
        dbin = (u % (1 << 21)) - (1 << 20)
        votes = {}
        for pc, dbv, c in zip(upair.tolist(), dbin.tolist(), cnt.tolist()):
            votes.setdefault(pc, []).append((c, dbv * OB + OB // 2))
        # spread of matches: number of distinct 30-s chunks (with >=2 matched frames) on each side
        spread = {}
        for side, tt in ((0, pta), (1, ptb)):
            cc = pair * 100000 + tt // CH
            u2, c2 = np.unique(cc, return_counts=True)
            u2 = u2[c2 >= 2] // 100000
            up, nc = np.unique(u2, return_counts=True)
            for pc, n in zip(up.tolist(), nc.tolist()):
                spread.setdefault(pc, [0, 0])[side] = n
        nskip = 0
        for pc, lst in votes.items():
            lst.sort(reverse=True)
            a, b = divmod(pc, N)
            total = sum(c for c, _ in lst)
            sa, sb = spread.get(pc, [0, 0])
            need_a = max(2, int(np.ceil(0.2 * nch[a]))) if nch[a] > 1 else 1
            need_b = max(2, int(np.ceil(0.2 * nch[b]))) if nch[b] > 1 else 1
            if total >= args.min_votes and (sa >= need_a or sb >= need_b):
                cands[(a, b)] = ("hash", [d for _, d in lst[:3]], total)
            elif total >= args.min_votes:
                nskip += 1
        log.info("%d hash-linked pairs skipped as localized matches only (shared intro/jingle etc.)", nskip)
    log.info("%d candidate pairs from hashing (min votes %d)", len(cands), args.min_votes)
    # --- title candidates
    bytitle = {}
    for i, r in enumerate(rows):
        nt = norm_title(r["title_guess"])
        if nt and not nt.isdigit() and len(nt) >= 4:
            bytitle.setdefault(nt, []).append(i)
    ntitle = 0
    for nt, lst in bytitle.items():
        for x in range(len(lst)):
            for y in range(x + 1, len(lst)):
                a, b = lst[x], lst[y]
                if (a, b) not in cands:
                    cands[(a, b)] = ("title", None, 0)
                    ntitle += 1
    # --- equal-duration candidates (within 1 s) that hashing may have missed
    durs = np.array([r["duration_sec"] for r in rows])
    o = np.argsort(durs)
    ndur = 0
    for x in range(len(o)):
        y = x + 1
        while y < len(o) and durs[o[y]] - durs[o[x]] <= 1.0:
            a, b = sorted((int(o[x]), int(o[y])))
            if (a, b) not in cands and durs[a] > 20:
                cands[(a, b)] = ("duration", None, 0)
                ndur += 1
            y += 1
    log.info("+%d title candidates, +%d equal-duration candidates", ntitle, ndur)

    results = []
    for n, ((a, b), (src, offs, v)) in enumerate(sorted(cands.items())):
        A, B = F(a), F(b)
        if offs is None:
            offs = env_offsets(A, B)
        else:
            offs = offs + [o for o in env_offsets(A, B, top=1) if o not in offs]
        s = compare(A, B, offs)
        ra, rb = rows[a], rows[b]
        da, dbb = ra["duration_sec"], rb["duration_sec"]
        hi = is_high(s, da, dbb)
        title_same = norm_title(ra["title_guess"]) == norm_title(rb["title_guess"])
        probable = (not hi) and (max(s["cov_a"], s["cov_b"]) >= args.min_cov or (title_same and src == "title"))
        results.append(dict(a=a, b=b, src=src, votes=v, high=hi, probable=probable, title_same=title_same, **s))
        if len(feats) > 300:
            feats.clear()
        if n % 500 == 0:
            log.info("compared %d/%d", n, len(cands))
    with open(os.path.join(args.workdir, "neardup_scores.json"), "w", encoding="utf-8") as f:
        json.dump([dict(r, key_a=rows[r["a"]]["key"], key_b=rows[r["b"]]["key"]) for r in results], f,
                  ensure_ascii=False, indent=0)
    nh = sum(r["high"] for r in results)
    npb = sum(r["probable"] for r in results)
    log.info("high-confidence pairs: %d, probable pairs: %d", nh, npb)

    # --- choose keepers among high-confidence groups
    parent = list(range(len(rows)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    high_pairs = set()
    for r in results:
        if r["high"]:
            high_pairs.add((r["a"], r["b"]))
            parent[find(r["a"])] = find(r["b"])
    groups = {}
    for i in range(len(rows)):
        groups.setdefault(find(i), []).append(i)
    actions = []
    leftover_pairs = []
    for g in groups.values():
        if len(g) < 2:
            continue
        keeper = max(g, key=lambda i: quality_key(rows[i]))
        for i in g:
            if i == keeper:
                continue
            if (min(i, keeper), max(i, keeper)) in high_pairs:
                actions.append((i, keeper))
            else:
                leftover_pairs.append((i, keeper))
    log.info("%d outputs to remove as high-confidence duplicates; %d chained members kept for review",
             len(actions), len(leftover_pairs))
    removed = set(i for i, _ in actions)

    # --- probable duplicates CSV
    prob = [r for r in results if r["probable"]]
    res_by_pair = {(r["a"], r["b"]): r for r in results}
    for i, k in leftover_pairs:
        a, b = min(i, k), max(i, k)
        r = res_by_pair.get((a, b))
        if r is None:
            A, B = F(a), F(b)
            s = compare(A, B, env_offsets(A, B))
            r = dict(a=a, b=b, src="chain", votes=0, high=False, probable=True,
                     title_same=norm_title(rows[a]["title_guess"]) == norm_title(rows[b]["title_guess"]), **s)
        prob.append(dict(r, src="chained-high-confidence"))
    parent2 = list(range(len(rows)))

    def find2(x):
        while parent2[x] != x:
            parent2[x] = parent2[parent2[x]]
            x = parent2[x]
        return x
    prob = [r for r in prob if not (r["a"] in removed and r["b"] in removed)]
    for r in prob:
        parent2[find2(r["a"])] = find2(r["b"])
    gid = {}
    for r in prob:
        root = find2(r["a"])
        if root not in gid:
            gid[root] = len(gid) + 1
        r["group"] = gid[root]
    prob.sort(key=lambda r: (r["group"], -max(r["cov_a"], r["cov_b"])))

    if args.apply:
        archive = args.archive
        for i, k in actions:
            ri, rk = rows[i], rows[k]
            # rename keeper into the removed item's simpler name when it is "<same base> (n)" in the same folder
            db.upd(ri["key"], status="duplicate", dup_of=rk["id"], dup_method="audio_fingerprint")
            sc = res_by_pair.get((min(i, k), max(i, k)))
            msg = (f"near-identical audio to {rk['original_path']} (corr {sc['global_corr']:.3f}, "
                   f"dur diff {abs(ri['duration_sec'] - rk['duration_sec']):.2f}s); kept the better source")
            db.upd(ri["key"], notes=((ri["notes"] + "; ") if ri["notes"] else "") + msg,
                   output_size_bytes=None, output_duration_sec=None)
            p = os.path.join(archive, ri["out_path"])
            if os.path.exists(lp(p)):
                os.remove(lp(p))
            log.info("removed redundant output %s (dup of %s)", ri["out_path"], rk["out_path"])
            db.upd(ri["key"], out_path=None)
            db.q("DELETE FROM outpaths WHERE item_key=?", (ri["key"],))
            # keep language evidence from the removed copy (e.g. a copy filed under the Yiddish folder)
            rk_now = db.item(rk["key"])
            if ri["language_guess"] != rk_now["language_guess"] and rk_now["language_guess"] != "unknown":
                db.upd(rk["key"], language_guess="unknown")
            if ri["language_guess"] != rk["language_guess"]:
                cur = db.item(rk["key"])["notes"] or ""
                db.upd(rk["key"], notes=(cur + "; " if cur else "") +
                       f"duplicate copy {ri['id']} was filed under '{ri['collection']}/{ri['folder']}' "
                       f"(language guess there: {ri['language_guess']})")
            if norm_title(ri["title_guess"]) != norm_title(rk["title_guess"]):
                cur = db.item(rk["key"])["notes"] or ""
                db.upd(rk["key"], notes=(cur + "; " if cur else "") +
                       f"same audio also appeared as '{ri['original_path'].strip()}' (different title)")
        # tidy names: keeper "X (2).mp3" when "X.mp3" was removed in same folder
        for i, k in actions:
            rk = db.item(rows[k]["key"])
            m = re.match(r"^(.*) \((\d+)\)\.mp3$", rk["out_path"])
            if not m:
                continue
            simple = m.group(1) + ".mp3"
            if db.one("SELECT 1 FROM outpaths WHERE path_cf=?", (simple.casefold(),)):
                continue
            if os.path.exists(lp(os.path.join(archive, simple))):
                continue
            if os.path.splitext(os.path.basename(simple))[0] != rk["base_name"]:
                continue
            os.replace(lp(os.path.join(archive, rk["out_path"])), lp(os.path.join(archive, simple)))
            db.q("DELETE FROM outpaths WHERE item_key=?", (rk["key"],))
            db.q("INSERT INTO outpaths VALUES (?,?,?)", (simple.casefold(), simple, rk["key"]))
            db.upd(rk["key"], out_path=simple)
            log.info("renamed keeper %s -> %s", rk["out_path"], simple)
        db.q("INSERT OR REPLACE INTO meta VALUES ('dedup_applied', ?)", (time.strftime("%Y-%m-%d %H:%M:%S"),))

    # write CSV (after possible renames so paths are final)
    out_csv = os.path.join(args.archive, "probable_duplicates.csv")
    with open(out_csv, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["group", "id_a", "id_b", "out_path_a", "out_path_b", "title_a", "title_b", "duration_a_sec",
                    "duration_b_sec", "duration_diff_sec", "global_corr", "coverage_a", "coverage_b", "offset_sec",
                    "min_chunk_corr", "same_title", "found_by", "status_a", "status_b", "relation"])
        for r in prob:
            ra, rb = db.item(rows[r["a"]]["key"]), db.item(rows[r["b"]]["key"])
            w.writerow([r["group"], ra["id"], rb["id"], ra["out_path"] or "", rb["out_path"] or "",
                        ra["title_guess"], rb["title_guess"], f"{ra['duration_sec']:.1f}", f"{rb['duration_sec']:.1f}",
                        f"{abs(ra['duration_sec'] - rb['duration_sec']):.1f}", f"{r['global_corr']:.3f}",
                        f"{r['cov_a']:.2f}", f"{r['cov_b']:.2f}", f"{r['offset'] / 8.0:.2f}",
                        f"{min(r['min_chunk'], r['min_chunk_b']):.3f}", int(r["title_same"]), r["src"],
                        ra["status"], rb["status"],
                        pair_relation(r["src"], r["cov_a"], r["cov_b"], ra["duration_sec"], rb["duration_sec"])])
    log.info("probable duplicates: %d pairs in %d groups -> %s", len(prob), len(gid), out_csv)
    db.q("INSERT OR REPLACE INTO meta VALUES ('probable_groups', ?)", (str(len(gid)),))
    db.q("INSERT OR REPLACE INTO meta VALUES ('probable_pairs', ?)", (str(len(prob)),))
    if not args.apply:
        for i, k in actions:
            sc = res_by_pair.get((min(i, k), max(i, k)))
            print("WOULD REMOVE", rows[i]["original_path"], "| keep", rows[k]["original_path"],
                  f"corr={sc['global_corr']:.3f} cov={sc['cov_a']:.2f}/{sc['cov_b']:.2f} "
                  f"dur={rows[i]['duration_sec']:.1f}/{rows[k]['duration_sec']:.1f}")


# ----------------------------------------------------------------------------- export
def export(args):
    db = DB(args.db)
    rows = db.q("SELECT * FROM items ORDER BY seq")
    byid = {r["id"]: r for r in rows if r["id"]}
    out = []
    for r in rows:
        d = {c: r[c] for c in CATALOG_COLS}
        if r["status"] == "duplicate" and r["dup_of"]:
            tgt = byid.get(r["dup_of"])
            hops = 0
            while tgt is not None and tgt["status"] == "duplicate" and tgt["dup_of"] and hops < 10:
                d["dup_of"] = tgt["dup_of"]
                tgt = byid.get(tgt["dup_of"])
                hops += 1
            d["out_path"] = tgt["out_path"] if tgt is not None else None
        d["had_video"] = None if r["had_video"] is None else bool(r["had_video"])
        if r["status"] in ("failed",) and r["error"] and r["error"] not in (r["notes"] or ""):
            d["notes"] = ((r["notes"] + "; ") if r["notes"] else "") + "error: " + r["error"]
        if r["status"] == "skipped" and r["error"] and r["error"] not in (r["notes"] or ""):
            d["notes"] = ((r["notes"] + "; ") if r["notes"] else "") + r["error"]
        out.append(d)
    os.makedirs(args.archive, exist_ok=True)
    with open(os.path.join(args.archive, "catalog.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CATALOG_COLS)
        w.writeheader()
        for d in out:
            w.writerow({k: ("" if v is None else v) for k, v in d.items()})
    with open(os.path.join(args.archive, "catalog.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    log.info("exported %d rows", len(out))


def status(args):
    db = DB(args.db)
    for r in db.q("SELECT status, count(*) c, sum(duration_sec)/3600.0 h FROM items GROUP BY status"):
        print(f"{r['status']:12s} {r['c']:6d}  {r['h'] or 0:8.2f} h")
    for r in db.q("SELECT kind, status, count(*) c FROM containers GROUP BY kind, status"):
        print("container", r["kind"], r["status"], r["c"])
    print(f"free: {free_bytes() / GB:.1f} GB")


def fptest(args):
    """Validate fingerprint comparison on synthetic variants of real files."""
    tmp = os.path.join(args.workdir, "fptest")
    os.makedirs(tmp, exist_ok=True)

    def feats_of(path, extra_af=None, ss=None, t=None):
        cmd = [FFMPEG, "-hide_banner", "-nostdin", "-v", "error"]
        if ss:
            cmd += ["-ss", str(ss)]
        if t:
            cmd += ["-t", str(t)]
        cmd += ["-i", fileurl(path), "-vn"]
        af = "aformat=channel_layouts=mono"
        if extra_af:
            af = extra_af + "," + af
        cmd += ["-af", af + ",aresample=16000", "-ar", "16000", "-ac", "1", "-f", "s16le", "pipe:1"]
        r = run(cmd, timeout=3600)
        an = PcmAnalyzer()
        an.feed(r.stdout)
        return an.features().astype(np.float32), an.n / 16000

    def variant(path, name, args_):
        dst = os.path.join(tmp, name)
        run([FFMPEG, "-hide_banner", "-nostdin", "-v", "error", "-y", "-i", fileurl(path), "-vn"] + args_ + [fileurl(dst)],
            timeout=3600)
        return dst

    files = args.files
    base = [feats_of(f) for f in files]
    for f, (A, da) in zip(files, base):
        print("==", os.path.basename(f), f"{da:.1f}s")
        tests = {
            "mp3 64k + 0.37s delay + -7dB": variant(f, "v1.mp3", ["-af", "adelay=370:all=1,volume=-7dB", "-ac", "1", "-b:a", "64k"]),
            "aac 48k 22kHz stereo": variant(f, "v2.m4a", ["-ar", "22050", "-b:a", "48k"]),
            "trimmed first 20s": variant(f, "v3.wav", ["-ss", "20"]),
            "first 70%": variant(f, "v4.wav", ["-t", str(da * 0.7)]),
            "1% speed change": variant(f, "v5.wav", ["-af", "asetrate=44100*1.01,aresample=44100"]),
        }
        for name, p in tests.items():
            B, db_ = feats_of(p)
            k1, t1 = subfp_keys(A)
            k2, t2 = subfp_keys(B)
            common = len(np.intersect1d(k1, k2))
            s = compare(A, B, env_offsets(A, B))
            print(f"  {name:32s} dur {db_:7.1f} hashes-common {common:6d}/{len(k1):6d}  corr {s['global_corr']:.3f} "
                  f"cov {s['cov_a']:.2f}/{s['cov_b']:.2f} minchunk {min(s['min_chunk'], s['min_chunk_b']):.2f} "
                  f"off {s['offset'] / 8:.2f}s HIGH={is_high(s, da, db_)}")
    for i in range(len(files)):
        for j in range(i + 1, len(files)):
            (A, da), (B, db_) = base[i], base[j]
            s = compare(A, B, env_offsets(A, B))
            k1, _ = subfp_keys(A)
            k2, _ = subfp_keys(B)
            print(f"NEG {os.path.basename(files[i])[:30]} vs {os.path.basename(files[j])[:30]}: corr {s['global_corr']:.3f} "
                  f"cov {s['cov_a']:.2f}/{s['cov_b']:.2f} common-hashes {len(np.intersect1d(k1, k2))} HIGH={is_high(s, da, db_)}")


def report(args):
    db = DB(args.db)
    A = args.archive
    rows = [dict(r) for r in db.q("SELECT * FROM items ORDER BY seq")]
    L = []
    w = L.append

    def h(sec):
        return (sec or 0) / 3600.0

    w("# Phase 1 pipeline report")
    w("")
    w(f"Generated {time.strftime('%Y-%m-%d %H:%M')}. One catalog row per original file: "
      "`StoryArchive/catalog.csv` / `catalog.json`.")
    w("")
    w("## Counts by status")
    w("")
    st = {}
    for r in rows:
        st[r["status"]] = st.get(r["status"], 0) + 1
    w("| status | items |")
    w("|---|---|")
    for k in sorted(st):
        w(f"| {k} | {st[k]} |")
    w(f"| **total** | {len(rows)} |")
    w("")
    conv = [r for r in rows if r["status"] == "converted"]
    w("## Audio hours (unique converted items only)")
    w("")
    w(f"Total: **{h(sum(r['duration_sec'] or 0 for r in conv)):.1f} h** in {len(conv)} files.")
    w("")
    w("| collection | folder | files | hours |")
    w("|---|---|---|---|")
    byc = {}
    for r in conv:
        byc.setdefault(r["collection"], []).append(r)
    for c in sorted(byc):
        w(f"| {c} | **(all)** | {len(byc[c])} | {h(sum(x['duration_sec'] or 0 for x in byc[c])):.1f} |")
        byf = {}
        for x in byc[c]:
            byf.setdefault(x["folder"] or "(top level)", []).append(x)
        for f in sorted(byf):
            w(f"| {c} | {f} | {len(byf[f])} | {h(sum(x['duration_sec'] or 0 for x in byf[f])):.2f} |")
    w("")
    nt = {}
    for r in conv:
        nt[str(r["norm_type"])] = nt.get(str(r["norm_type"]), 0) + 1
    w("Loudness normalization mode actually used by loudnorm pass 2: "
      + ", ".join(f"{k}: {v}" for k, v in sorted(nt.items()))
      + ". (`linear=true` was requested; ffmpeg falls back to dynamic mode when the linear gain needed to reach "
        "-16 LUFS would push true peak above -1.5 dBTP, which is the normal case for unprocessed speech. "
        "`none` = silent/near-silent source, encoded without normalization.)")
    w("")
    w("## Sizes and disk")
    w("")
    insz = sum(c["size"] for c in db.q("SELECT size FROM containers"))
    outsz = 0
    nfiles = 0
    for d, _, fs in os.walk(lp(A)):
        for f in fs:
            outsz += os.path.getsize(os.path.join(d, f))
            nfiles += 1

    def gbs(x):
        return f"{x / GB:.1f} GiB ({x / 1e9:.1f} GB)"
    w(f"- Input (19 loose MP4s + 32 zips as downloaded): {gbs(insz)}")
    w(f"- Output (everything under StoryArchive, {nfiles} files): {gbs(outsz)}")
    for sub in ("audio", "documents", "unconverted", "originals_kept"):
        sz = 0
        for d, _, fs in os.walk(lp(os.path.join(A, sub))):
            for f in fs:
                sz += os.path.getsize(os.path.join(d, f))
        if sz:
            w(f"  - {sub}/: {gbs(sz)}")
    w(f"- Net disk freed by the pipeline: {gbs(insz - outsz)}")
    w(f"- Current free space on C: {gbs(free_bytes())}")
    w("")
    w("## Duplicates")
    w("")
    dm = {}
    for r in rows:
        if r["status"] == "duplicate":
            dm[r["dup_method"]] = dm.get(r["dup_method"], 0) + 1
    w(f"Removed as duplicates: **{sum(dm.values())}**")
    desc = {"sha256": "byte-identical file (not converted again)",
            "decoded_audio_md5": "identical decoded audio in a different file/container",
            "audio_fingerprint": "high-confidence near-duplicate (fingerprint corr >= 0.95, >= 95% chunk coverage "
                                 "both ways, duration within 1 s); redundant output deleted, better source kept"}
    for k, v in sorted(dm.items()):
        w(f"- {k}: {v} ({desc.get(k, '')})")
    pg = db.one("SELECT v FROM meta WHERE k='probable_groups'")
    pp = db.one("SELECT v FROM meta WHERE k='probable_pairs'")
    w("")
    w(f"Probable duplicates left for human review: **{pg['v'] if pg else 'n/a'} groups** "
      f"({pp['v'] if pp else 'n/a'} pairs) in `StoryArchive/probable_duplicates.csv` (all kept).")
    w("")
    w("## Failures and oddities")
    w("")
    bad = [r for r in rows if r["status"] in ("failed", "skipped")]
    if not bad:
        w("- No failed or skipped items.")
    for r in bad:
        w(f"- **{r['status']}**: `{r['source_container']}` :: `{r['original_path'].strip()}` -> "
          f"{('`' + r['out_path'] + '`') if r['out_path'] else 'no output'}; {r['error'] or ''}")

    def pick(pat):
        return [r for r in rows if r["notes"] and re.search(pat, r["notes"])]
    for title, pat in (("Silent / near-silent sources (encoded without normalization)", r"SILENT"),
                       ("Duration mismatch between container header and decodable audio (original also kept)",
                        r"DURATION MISMATCH"),
                       ("Decoder reported errors/warnings (output still verified)", r"decoder (reported|exited)"),
                       ("Very quiet sources (< -35 LUFS)", r"very quiet"),
                       ("Very short (< 2 s)", r"very short"),
                       ("Unknown / missing extension", r"no/unknown extension"),
                       ("Multiple audio streams", r"audio streams; used the first")):
        lst = pick(pat)
        w("")
        w(f"**{title}: {len(lst)}**")
        for r in lst[:60]:
            note = [n for n in r["notes"].split("; ") if re.search(pat, n)]
            w(f"- `{r['original_path'].strip()}` ({r['status']}{', ' + r['out_path'] if r['out_path'] else ''}): "
              f"{note[0] if note else ''}")
        if len(lst) > 60:
            w(f"- ... and {len(lst) - 60} more (see catalog notes)")
    for r in [r for r in rows if (r["original_ext"] or "") == ".avi"]:
        w("")
        w(f"**The .avi** `{r['original_path'].strip()}`: status {r['status']}, audio codec {r['original_codec']}, "
          f"{r['duration_sec']} s, had_video={bool(r['had_video'])}, output `{r['out_path']}`.")
    w("")
    w("## Non-English (Yiddish/Hebrew) and uncertain-language items")
    w("")
    for lang in ("yiddish", "unknown"):
        lst = [r for r in rows if r["language_guess"] == lang and r["status"] == "converted"]
        docs = [r for r in rows if r["language_guess"] == lang and r["status"] == "document"]
        w(f"**{lang}**: {len(lst)} unique audio items, {h(sum(r['duration_sec'] or 0 for r in lst)):.1f} h"
          + (f" (+{len(docs)} documents)" if docs else ""))
        byf = {}
        for r in lst:
            byf.setdefault("/".join(x for x in [r["collection"], r["folder"]] if x), []).append(r)
        for f in sorted(byf):
            w(f"- {f}: {len(byf[f])} items, {h(sum(r['duration_sec'] or 0 for r in byf[f])):.2f} h")
        w("")
    w("## Cleanup status")
    w("")
    zips = [f for f in os.listdir(ROOT) if f.lower().endswith(".zip")]
    mp4s = [f for f in os.listdir(ROOT) if f.lower().endswith(".mp4")]
    w(f"- Zip files remaining in Downloads: {len(zips)}" + (": " + ", ".join(zips) if zips else ""))
    w(f"- Loose MP4s remaining in Downloads: {len(mp4s)}" + (": " + ", ".join(mp4s) if mp4s else ""))
    stg = os.path.join(ROOT, "_staging")
    left = []
    if os.path.isdir(stg):
        for d, _, fs in os.walk(stg):
            left += fs
    w(f"- `_staging`: {'removed' if not os.path.isdir(stg) else ('empty' if not left else f'{len(left)} files left')}")
    prot = {}
    pf = os.path.join(PIPE, "protected_hashes.txt")
    if os.path.exists(pf):
        for line in open(pf, encoding="utf-8"):
            parts = line.split()
            if len(parts) == 2:
                prot[parts[0]] = parts[1]
    for name, hsh in prot.items():
        fp = os.path.join(ROOT, name)
        ok = os.path.exists(fp) and sha256_file(fp) == hsh
        w(f"- `{name}`: " + ("present and unchanged (sha256 matches the hash recorded before the run)"
                             if ok else "CHANGED OR MISSING"))
    other = sorted(f for f in os.listdir(ROOT) if f not in prot and f not in ("_pipeline", "_staging", "StoryArchive"))
    w(f"- Other entries in Downloads: {', '.join(other) if other else 'none'}")
    w("")
    w("## Files")
    w("")
    w(f"- Pipeline script: `{os.path.join(PIPE, 'pipeline.py')}` (run with "
      f"`{os.path.join(PIPE, '.venv', 'Scripts', 'python.exe')} -I -X utf8 pipeline.py "
      "run | dedup [--apply] | export | report | status`)")
    w(f"- State DB (resumable): `{os.path.join(PIPE, 'state.db')}`; log: `{os.path.join(PIPE, 'pipeline.log')}`; "
      f"fingerprints: `{os.path.join(PIPE, 'fp')}`; pair scores: `{os.path.join(PIPE, 'neardup_scores.json')}`")
    w(f"- Catalog: `{os.path.join(A, 'catalog.csv')}` (UTF-8 with BOM) and `{os.path.join(A, 'catalog.json')}`")
    w(f"- Review list: `{os.path.join(A, 'probable_duplicates.csv')}`")
    txt = "\n".join(L) + "\n"
    if args.notes_file and os.path.exists(args.notes_file):
        txt += "\n" + open(args.notes_file, encoding="utf-8").read()
    with open(os.path.join(A, "PIPELINE_REPORT.md"), "w", encoding="utf-8") as f:
        f.write(txt)
    print(txt)


# ----------------------------------------------------------------------------- main
def main():
    global ROOT
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["init", "run", "status", "dedup", "export", "fptest", "report"])
    ap.add_argument("--root", default=ROOT, help="input directory (override only for testing)")
    ap.add_argument("--archive", default=os.path.join(ROOT, "StoryArchive"))
    ap.add_argument("--stage", default=os.path.join(ROOT, "_staging"))
    ap.add_argument("--workdir", default=PIPE)
    ap.add_argument("--db", default=os.path.join(PIPE, "state.db"))
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--keep-sources", action="store_true", help="never delete zips/loose files (testing)")
    ap.add_argument("--only", nargs="*", help="process only these item keys (testing)")
    ap.add_argument("--only-file", help="JSON list of item keys to process (testing)")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--notes-file", default=os.path.join(PIPE, "report_notes.txt"))
    ap.add_argument("--min-votes", type=int, default=20)
    ap.add_argument("--min-cov", type=float, default=0.3)
    ap.add_argument("--log", default=None)
    ap.add_argument("files", nargs="*")
    args = ap.parse_args()
    ROOT = args.root
    os.makedirs(args.workdir, exist_ok=True)
    logf = args.log or os.path.join(args.workdir, "pipeline.log")
    handlers = [logging.FileHandler(logf, encoding="utf-8"), logging.StreamHandler(sys.stdout)]
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(threadName)s] %(message)s",
                        handlers=handlers)
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    if args.only_file:
        args.only = json.load(open(args.only_file, encoding="utf-8"))
    if args.workers > 6:
        args.workers = 6
    if args.cmd in ("init", "run"):
        p = Pipeline(args)
        try:
            if args.cmd == "init":
                p.init()
            else:
                p.run()
        except FatalStop as e:
            log.error("FATAL STOP: %s", e)
            sys.exit(2)
    elif args.cmd == "status":
        status(args)
    elif args.cmd == "dedup":
        dedup(args)
    elif args.cmd == "export":
        export(args)
    elif args.cmd == "fptest":
        fptest(args)
    elif args.cmd == "report":
        report(args)


if __name__ == "__main__":
    main()
