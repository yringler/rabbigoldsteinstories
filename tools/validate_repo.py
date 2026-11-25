"""Validate every data/recordings/**/*.meta.json in this repo: JSON Schema, vocabulary ids, relation targets, segment times.

Works from the repo alone (no Downloads working folders needed). Exit code 0 = all valid.
Run from the repo root: python -X utf8 tools/validate_repo.py
Needs: pip install jsonschema pyluach
"""
import glob, json, os, subprocess, sys, tempfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
metas = sorted(glob.glob(os.path.join(REPO, "data", "recordings", "**", "*.meta.json"), recursive=True))
items = [json.load(open(p, encoding="utf-8")) for p in metas]
ids = [x["id"] for x in items]
dupes = {i for i in ids if ids.count(i) > 1}
if dupes:
    sys.exit(f"duplicate ids: {sorted(dupes)[:10]}")
with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as tmp:
    json.dump({"items": items}, tmp, ensure_ascii=False)
v = os.path.join(REPO, "data", "vocabulary")
r = subprocess.run([sys.executable, "-X", "utf8", os.path.join(REPO, "tools", "3-metadata", "scripts", "validate.py"),
                    os.path.join(v, "metadata.schema.json"), os.path.join(v, "vocabularies.json"), tmp.name,
                    os.path.join(REPO, "data", "catalog", "catalog.csv")])
os.unlink(tmp.name)
sys.exit(r.returncode)
