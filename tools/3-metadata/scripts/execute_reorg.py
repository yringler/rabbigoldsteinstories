"""Execute reorg/moves_plan.csv: move the MP3s and rewrite every stored path. Reversible via StoryArchive/moves.csv.

Run from _metadata: python -I -X utf8 scripts/execute_reorg.py
Paths are rewritten by exact whole-string match in: StoryArchive catalog.csv/.json, transcripts_index.csv,
probable_duplicates.csv, _metadata facts/ items/ pass2/*.csv|json, and the phase-1 pipeline's state.db.
"""
import csv, glob, json, os, shutil, sqlite3

DL = r"C:\Users\ybrin\Downloads"
ARCH = os.path.join(DL, "StoryArchive")
M = os.path.join(DL, "_metadata")
BACKUP = os.path.join(M, "reorg", "backup")

plan = list(csv.DictReader(open(os.path.join(M, "reorg", "moves_plan.csv"), encoding="utf-8-sig")))
mapping = {r["old_path"]: r["new_path"] for r in plan if r["old_path"] != r["new_path"]}

# preflight: every source exists, no target exists, targets unique
problems = [r for r in plan if not os.path.exists(os.path.join(ARCH, r["old_path"]))]
problems += [r for r in plan if r["old_path"] != r["new_path"] and os.path.exists(os.path.join(ARCH, r["new_path"]))]
assert len({r["new_path"].lower() for r in plan}) == len(plan), "duplicate targets"
if problems:
    raise SystemExit(f"preflight failed for {len(problems)} rows, e.g. {problems[0]}")

# backups of every file whose paths get rewritten
os.makedirs(BACKUP, exist_ok=True)
for f in ("catalog.csv", "catalog.json", "transcripts_index.csv", "probable_duplicates.csv"):
    shutil.copy2(os.path.join(ARCH, f), BACKUP)
shutil.copy2(os.path.join(DL, "_pipeline", "state.db"), BACKUP)
for d in ("facts", "items"):
    if not os.path.exists(os.path.join(BACKUP, d)):
        shutil.copytree(os.path.join(M, d), os.path.join(BACKUP, d))

# move the audio
with open(os.path.join(ARCH, "moves.csv"), "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f); w.writerow(["id", "old_path", "new_path"])
    for r in plan:
        if r["old_path"] == r["new_path"]:
            continue
        dst = os.path.join(ARCH, r["new_path"])
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        os.replace(os.path.join(ARCH, r["old_path"]), dst)
        w.writerow([r["id"], r["old_path"], r["new_path"]])


def walk(x):
    if isinstance(x, dict): return {k: walk(v) for k, v in x.items()}
    if isinstance(x, list): return [walk(v) for v in x]
    return mapping.get(x, x) if isinstance(x, str) else x


def rewrite_json(p):
    d = json.load(open(p, encoding="utf-8")); n = walk(d)
    if n != d: json.dump(n, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1); return 1
    return 0


def rewrite_csv(p):
    raw = open(p, "rb").read(); bom = raw.startswith(b"\xef\xbb\xbf")
    rows = list(csv.reader(open(p, encoding="utf-8-sig", newline="")))
    new = [[mapping.get(c, c) for c in row] for row in rows]
    if new != rows:
        with open(p, "w", newline="", encoding="utf-8-sig" if bom else "utf-8") as f: csv.writer(f).writerows(new)
        return 1
    return 0


changed = 0
for f in ("catalog.csv", "transcripts_index.csv", "probable_duplicates.csv"): changed += rewrite_csv(os.path.join(ARCH, f))
changed += rewrite_json(os.path.join(ARCH, "catalog.json"))
changed += rewrite_json(os.path.join(M, "examples.json"))
for p in glob.glob(os.path.join(M, "facts", "*.json")) + glob.glob(os.path.join(M, "items", "*.json")) + glob.glob(os.path.join(M, "pass2", "*.json")):
    changed += rewrite_json(p)
for p in glob.glob(os.path.join(M, "pass2", "*.csv")): changed += rewrite_csv(p)

db = sqlite3.connect(os.path.join(DL, "_pipeline", "state.db"))
for old, new in mapping.items():
    db.execute("update items set out_path=? where out_path=?", (new, old))
    db.execute("update outpaths set path=?, path_cf=? where path=?", (new, new.casefold(), old))
db.commit(); db.close()

# remove the emptied old folders
for root, dirs, files in sorted(os.walk(os.path.join(ARCH, "audio")), key=lambda t: -len(t[0])):
    if not os.listdir(root): os.rmdir(root)

# verify
cat = list(csv.DictReader(open(os.path.join(ARCH, "catalog.csv"), encoding="utf-8-sig")))
conv = [r for r in cat if r["status"] == "converted"]
missing = [r["out_path"] for r in conv if not os.path.exists(os.path.join(ARCH, r["out_path"]))]
on_disk = sum(len([f for f in fs if f.endswith(".mp3")]) for _, _, fs in os.walk(os.path.join(ARCH, "audio")))
print(f"moved {len(mapping)}; files rewritten {changed}; catalog converted rows {len(conv)}, missing {len(missing)}; mp3 on disk {on_disk}")
