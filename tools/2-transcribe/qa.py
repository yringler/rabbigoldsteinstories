import json, glob, os, csv, collections, re
cat = {r["id"]: r for r in csv.DictReader(open(r"C:\Users\ybrin\Downloads\StoryArchive\catalog.csv", encoding="utf-8-sig"))}
rows = []
for p in glob.glob("tx_out/tx/*.json"):
    j = json.load(open(p, encoding="utf-8"))
    segs = j["segments"]; text = " ".join(s["text"] for s in segs)
    words = text.split(); dur = j["duration"] or 1
    # repetition: share of segments whose text duplicates the previous segment
    rep = sum(1 for a, b in zip(segs, segs[1:]) if a["text"] and a["text"] == b["text"]) / max(1, len(segs) - 1)
    # most common 4-gram share, a looping signal
    grams = collections.Counter(tuple(words[i:i+4]) for i in range(len(words) - 3))
    top = grams.most_common(1)[0][1] / max(1, len(words) - 3) if grams else 0
    lp = sum(s["avg_logprob"] for s in segs) / len(segs) if segs else -9
    rows.append(dict(id=j["id"], lang=j["language"], det=j.get("detected_language"), min=round(dur / 60, 1),
                     wpm=round(len(words) / (dur / 60), 1), rep=round(rep, 3), top4=round(top, 3), logprob=round(lp, 2),
                     path=cat[j["id"]]["out_path"]))
print("transcripts:", len(rows), "| in catalog:", sum(r["id"] in cat for r in rows))
print("by language:", collections.Counter(r["lang"] for r in rows))
for lang in ("en", "yi"):
    w = sorted(r["wpm"] for r in rows if r["lang"] == lang)
    print(lang, "words/min median", w[len(w)//2], "p5", w[len(w)//20])
print("\nUNKNOWN-language items:")
for r in rows:
    if cat[r["id"]]["language_guess"] == "unknown": print(" ", r["lang"], r["det"], r["min"], "min |", r["path"][-70:])
flag = [r for r in rows if r["wpm"] < 40 or r["rep"] > 0.05 or r["top4"] > 0.02 or r["logprob"] < -0.6]
print("\nFLAGGED:", len(flag))
for r in sorted(flag, key=lambda r: r["wpm"]): print(" ", r["lang"], f"{r['min']}min wpm={r['wpm']} rep={r['rep']} top4={r['top4']} lp={r['logprob']} |", r["path"][-75:])
json.dump(rows, open("qa.json", "w", encoding="utf-8"), ensure_ascii=False)
