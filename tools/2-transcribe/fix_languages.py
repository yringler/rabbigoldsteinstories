"""Re-check the spoken language of items whose language was guessed from the filename, and re-transcribe mismatches.

Stock Whisper labels Yiddish as German, so 'de'/'yi'/'he' count as Yiddish. Six 30 s windows per file are voted on.
Writes the same JSON/TXT format as the Kaggle kernel into tx_out/tx (originals backed up to tx_out/tx_before_langfix).
Usage: python fix_languages.py lang_candidates.txt
"""
import json, os, sys, shutil, subprocess, collections, numpy as np
from faster_whisper import WhisperModel, BatchedInferencePipeline

ARCH = r"C:\Users\ybrin\Downloads\StoryArchive"
TX = r"C:\Users\ybrin\Downloads\_transcribe\tx_out\tx"
BACKUP = r"C:\Users\ybrin\Downloads\_transcribe\tx_out\tx_before_langfix"
MODELS = {"en": "large-v3-turbo", "yi": "ivrit-ai/yi-whisper-large-v3-turbo-ct2"}
EN_PROMPT = ("Uncle Yossi, Tzivos Hashem, Hashem, the Rebbe, the Lubavitcher Rebbe, the Baal Shem Tov, the Besht, "
             "the Alter Rebbe, Chassidim, Chassidus, mitzvah, mitzvos, Torah, Shabbos, Yom Tov, tzaddik, tzedakah, Moshiach.")
os.makedirs(BACKUP, exist_ok=True)


def load_audio(p):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-f", "s16le", "-ac", "1", "-ar", "16000", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0


models = {lang: WhisperModel(name, device="cpu", compute_type="int8", cpu_threads=12) for lang, name in MODELS.items()}
pipes = {lang: BatchedInferencePipeline(m) for lang, m in models.items()}
cat = {}
import csv
for r in csv.DictReader(open(os.path.join(ARCH, "catalog.csv"), encoding="utf-8-sig")):
    cat[r["id"]] = r
ids = [l.split()[0] for l in open(sys.argv[1], encoding="utf-8") if len(l.split()) > 1 and len(l.split()[0]) == 10]
report = []
for i in ids:
    audio = load_audio(os.path.join(ARCH, cat[i]["out_path"]))
    n = len(audio); win = 30 * 16000
    votes = collections.Counter()
    for k in range(6):
        start = int((k + 0.5) / 6 * max(0, n - win))
        lang, prob, _ = models["en"].detect_language(audio[start:start + win])
        votes["en" if lang == "en" else "yi"] += 1
    spoken = votes.most_common(1)[0][0]
    current = json.load(open(os.path.join(TX, i + ".json"), encoding="utf-8"))["language"]
    rec = {"id": i, "path": cat[i]["out_path"], "votes": dict(votes), "spoken": spoken, "was": current, "redone": False}
    if spoken != current:
        for ext in (".json", ".txt"):
            shutil.copy(os.path.join(TX, i + ext), BACKUP)
        kw = dict(language=spoken, word_timestamps=True, vad_filter=True, batch_size=8, condition_on_previous_text=False)
        if spoken == "en":
            kw["initial_prompt"] = EN_PROMPT
        segs, info = pipes[spoken].transcribe(audio, **kw)
        segs = [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip(),
                 "avg_logprob": round(s.avg_logprob, 3), "no_speech_prob": round(s.no_speech_prob, 3),
                 "words": [[round(w.start, 2), round(w.end, 2), w.word, round(w.probability, 3)] for w in (s.words or [])]}
                for s in segs]
        json.dump({"id": i, "language": spoken, "detected_language": None, "model": MODELS[spoken], "duration": info.duration,
                   "segments": segs, "note": f"re-transcribed locally after language check (window votes {dict(votes)})"},
                  open(os.path.join(TX, i + ".json"), "w", encoding="utf-8"), ensure_ascii=False)
        with open(os.path.join(TX, i + ".txt"), "w", encoding="utf-8") as f:
            for s in segs:
                m, sec = divmod(s["start"], 60)
                f.write(f"[{int(m):02d}:{sec:05.2f}] {s['text']}\n")
        rec["redone"] = True
    report.append(rec)
    print(json.dumps(rec, ensure_ascii=False), flush=True)
json.dump(report, open(r"C:\Users\ybrin\Downloads\_transcribe\langfix_report.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("DONE", sum(r["redone"] for r in report), "re-transcribed of", len(report))
