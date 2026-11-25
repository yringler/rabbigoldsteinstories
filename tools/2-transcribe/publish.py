"""Copy transcripts into StoryArchive/transcripts/<id>.{json,txt} and write transcripts_index.csv with QA stats and flags."""
import json, glob, os, csv, shutil, collections
ARCH = r"C:\Users\ybrin\Downloads\StoryArchive"
SRC = r"C:\Users\ybrin\Downloads\_transcribe\tx_out\tx"
DST = os.path.join(ARCH, "transcripts")
os.makedirs(DST, exist_ok=True)
cat = {r["id"]: r for r in csv.DictReader(open(os.path.join(ARCH, "catalog.csv"), encoding="utf-8-sig"))}
MANUAL = {"6d98153d65": "defective_source: the audio is a ~3 s clip looped for 31 min; transcript is meaningless. Re-download from Drive if a good copy exists",
          "870d0298c2": "retranscribed: auto-detect picked English; redone locally with the Yiddish model"}
out = []
for p in sorted(glob.glob(os.path.join(SRC, "*.json"))):
    j = json.load(open(p, encoding="utf-8")); i = j["id"]
    for ext in (".json", ".txt"): shutil.copy(p[:-5] + ext, DST)
    segs = j["segments"]; words = " ".join(s["text"] for s in segs).split()
    dur = j["duration"] or 1; wpm = len(words) / (dur / 60)
    grams = collections.Counter(tuple(words[k:k+4]) for k in range(len(words) - 3))
    top4 = grams.most_common(1)[0][1] / max(1, len(words) - 3) if grams else 0
    flags = []
    if wpm < 40: flags.append("little_speech_maybe_song")
    if top4 > 0.1 and i not in MANUAL: flags.append("repetitive_check")
    if i in MANUAL: flags.append(MANUAL[i])
    c = cat[i]
    out.append({"id": i, "title_guess": c["title_guess"], "audio_path": c["out_path"], "transcript_txt": f"transcripts/{i}.txt",
                "transcript_json": f"transcripts/{i}.json", "language": j["language"], "detected_language": j.get("detected_language") or "",
                "model": j["model"], "duration_min": round(dur / 60, 1), "words": len(words), "words_per_min": round(wpm),
                "mean_logprob": round(sum(s["avg_logprob"] for s in segs) / len(segs), 2) if segs else "", "flags": "; ".join(flags)})
with open(os.path.join(ARCH, "transcripts_index.csv"), "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=list(out[0])); w.writeheader(); w.writerows(out)
print(len(out), "transcripts published;", sum(bool(r["flags"]) for r in out), "flagged")
for r in out:
    if r["flags"]: print(" ", r["duration_min"], "min |", r["title_guess"][:45], "|", r["flags"][:90])
