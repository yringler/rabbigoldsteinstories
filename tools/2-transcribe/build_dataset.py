"""Build the Kaggle upload folder from StoryArchive/catalog.csv.

Every converted MP3 is hard-linked (no extra disk) as dataset/<id>.mp3, plus manifest.csv
(id, file, language) that the Kaggle kernel reads. Run with: python -I -X utf8 build_dataset.py
"""
import csv, os, json, collections

ARCHIVE = r"C:\Users\ybrin\Downloads\StoryArchive"
OUT = r"C:\Users\ybrin\Downloads\_transcribe\dataset"
LANG = {"english": "en", "yiddish": "yi"}

os.makedirs(OUT, exist_ok=True)
rows = list(csv.DictReader(open(os.path.join(ARCHIVE, "catalog.csv"), encoding="utf-8-sig")))
todo = [r for r in rows if r["status"] == "converted" and r["out_path"].lower().endswith(".mp3")]
counts = collections.Counter()
with open(os.path.join(OUT, "manifest.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["id", "file", "language"])
    for r in todo:
        src = os.path.join(ARCHIVE, r["out_path"])
        dst = os.path.join(OUT, r["id"] + ".mp3")
        if not os.path.exists(dst):
            os.link(src, dst)
        lang = LANG.get(r.get("language_guess", ""), "unknown")
        counts[lang] += 1
        w.writerow([r["id"], r["id"] + ".mp3", lang])
json.dump({"title": "story-archive-audio", "id": "yehudaringler/story-archive-audio",
           "licenses": [{"name": "CC0-1.0"}]}, open(os.path.join(OUT, "dataset-metadata.json"), "w"))
print(len(todo), "files linked;", dict(counts))
