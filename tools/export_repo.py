r"""Rebuild this repo's data/, docs/, review/ and tools/ snapshots from the working folders in Downloads.

The working folders are where the pipeline actually runs:
  StoryArchive\   audio and documents\ (not in git; both live in R2), catalog, transcripts\<id>.*
  _metadata\      items\<id>.json (AI metadata), vocabularies, schema, pass-2 indexes, reports, scripts
  _transcribe\    transcription tooling     _pipeline\  phase-1 normalization     _r2\  R2 upload tooling
Run: python -I -X utf8 tools\export_repo.py   (then review `git status` and commit)
"""
import csv, glob, json, os, shutil

DL = r"C:\Users\ybrin\Downloads"
ARCH, META = os.path.join(DL, "StoryArchive"), os.path.join(DL, "_metadata")
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKFLOWS = r"C:\Users\ybrin\.claude\projects\C--Users-ybrin-Downloads\67113269-dd7f-56e5-8438-7db28b5dc3ba\workflows\scripts"


def cp(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(src, dst)


KEEP = {"README.md", "CLAUDE.md"}  # hand-written guides survive a refresh


def fresh(d):
    os.makedirs(d, exist_ok=True)
    for name in os.listdir(d):
        if name in KEEP:
            continue
        p = os.path.join(d, name)
        shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)


# ---- data/recordings: one folder tree mirroring the audio layout; three files per recording
rec_root = os.path.join(REPO, "data", "recordings")
fresh(rec_root)
catalog = list(csv.DictReader(open(os.path.join(ARCH, "catalog.csv"), encoding="utf-8-sig")))
r2 = {r["id"]: r["key"] for r in csv.DictReader(open(os.path.join(DL, "_r2", "r2_manifest.csv"), encoding="utf-8-sig"))}
index = []
for r in catalog:
    if r["status"] != "converted":
        continue
    i = r["id"]
    rel = r["out_path"][len("audio/"):-len(".mp3")]          # e.g. Uncle Yossi - .../Episodes/5742 (1981-82)/Ep 003 - ...
    base = os.path.join(rec_root, *rel.split("/"))
    cp(os.path.join(META, "items", f"{i}.json"), base + ".meta.json")
    cp(os.path.join(ARCH, "transcripts", f"{i}.json"), base + ".transcript.json")
    cp(os.path.join(ARCH, "transcripts", f"{i}.txt"), base + ".transcript.txt")
    title = json.load(open(os.path.join(META, "items", f"{i}.json"), encoding="utf-8"))["display"]["title"]
    media = json.load(open(os.path.join(META, "items", f"{i}.json"), encoding="utf-8")).get("media", {})
    index.append({"id": i, "title": title, "folder": os.path.dirname(rel), "name": os.path.basename(rel),
                  "audio_url": media.get("url", ""), "audio_r2_key": r2.get(i, ""),
                  "duration_min": round(float(r["duration_sec"]) / 60, 1)})

# ---- data/catalog, vocabulary, indexes, documents
d = lambda *p: os.path.join(REPO, "data", *p)
for sub in ("catalog", "vocabulary", "indexes"):
    fresh(d(sub))
with open(d("catalog", "recordings_index.csv"), "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=list(index[0])); w.writeheader(); w.writerows(sorted(index, key=lambda x: (x["folder"], x["name"])))
for f in ("catalog.csv", "catalog.json", "moves.csv", "probable_duplicates.csv", "transcripts_index.csv"):
    cp(os.path.join(ARCH, f), d("catalog", f))
cp(os.path.join(DL, "_r2", "r2_manifest.csv"), d("catalog", "r2_manifest.csv"))
# non-audio files (tape catalogs, PDFs, images) live in R2 under goldstein/media/; git only keeps their catalog
cp(os.path.join(DL, "_r2", "media_manifest.csv"), d("catalog", "media_catalog.csv"))
for f in ("vocabularies.json", "metadata.schema.json", "vocab_compact.txt", "examples.json"):
    cp(os.path.join(META, f), d("vocabulary", f))
for f in ("serials_index.json", "story_groups.json", "series_summaries.json"):
    cp(os.path.join(META, "pass2", f), d("indexes", f))

# ---- review lists and docs
fresh(os.path.join(REPO, "review"))
for f in ("to_confirm.csv", "family_recordings.csv", "REVIEW_QUEUE.md"):
    cp(os.path.join(META, "pass2", f), os.path.join(REPO, "review", f))
fresh(os.path.join(REPO, "docs"))
for src in (os.path.join(ARCH, "PIPELINE_REPORT.md"), os.path.join(META, "SCHEMA_PROPOSAL.md"), os.path.join(META, "DECISIONS.md"),
            os.path.join(META, "PASS1_INSTRUCTIONS.md"), os.path.join(META, "PASS2_REPORT.md")):
    cp(src, os.path.join(REPO, "docs", os.path.basename(src)))
for p in glob.glob(os.path.join(META, "reports", "*.json")):
    cp(p, os.path.join(REPO, "docs", "runs", "pass1-batch-reports", os.path.basename(p)))
for f in ("vocab", "dates", "serials", "same_story", "versions_speakers", "deliverables", "apply_log"):
    cp(os.path.join(META, "pass2", f + ".json"), os.path.join(REPO, "docs", "runs", "pass2-patches", f + ".json"))
for f in ("run_log.jsonl",):
    cp(os.path.join(DL, "_transcribe", "tx_out", f), os.path.join(REPO, "docs", "runs", "transcription", "kaggle_" + f))
for f in ("langfix_report.json", "qa.json"):
    cp(os.path.join(DL, "_transcribe", f), os.path.join(REPO, "docs", "runs", "transcription", f))
cp(os.path.join(META, "batches.json"), os.path.join(REPO, "docs", "runs", "pass1-batches.json"))

# ---- tools snapshots (scripts only; never credentials)
t = lambda *p: os.path.join(REPO, "tools", *p)
for sub in ("1-normalize", "2-transcribe", "3-metadata", "4-r2"):
    fresh(t(sub))
for f in ("pipeline.py", "list_zips.py"):
    cp(os.path.join(DL, "_pipeline", f), t("1-normalize", f))
for f in ("build_dataset.py", "publish.py", "qa.py", "fix_languages.py", "retranscribe_one.py", "kg.py", "count_files.py"):
    cp(os.path.join(DL, "_transcribe", f), t("2-transcribe", f))
for f in ("story-archive-transcribe.py", "kernel-metadata.json"):
    cp(os.path.join(DL, "_transcribe", "kernel_full", f), t("2-transcribe", "kaggle-kernel", f))
for p in glob.glob(os.path.join(META, "scripts", "*.py")):
    cp(p, t("3-metadata", "scripts", os.path.basename(p)))
for p in glob.glob(os.path.join(WORKFLOWS, "*.js")):
    name = "pass1-workflow.js" if "pass1" in p else "pass2-workflow.js" if "pass2" in p else os.path.basename(p)
    cp(p, t("3-metadata", "workflows", name))
for f in ("r2.py", "upload_audio.py", "upload_media.py", "move_prefix.py"):
    cp(os.path.join(DL, "_r2", f), t("4-r2", f))
print(f"exported {len(index)} recordings")
