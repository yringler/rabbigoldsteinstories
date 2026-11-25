import json, time, csv, queue, threading
import subprocess, sys, os, glob, ctypes, shutil
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "faster-whisper", "nvidia-cublas-cu12", "nvidia-cudnn-cu12==9.*"], check=True)
import torch; print("torch cuda", torch.version.cuda, torch.cuda.device_count(), "gpus", flush=True)
import nvidia.cublas, nvidia.cudnn
for mod in (nvidia.cublas, nvidia.cudnn):
    for so in sorted(glob.glob(os.path.join(list(mod.__path__)[0], "lib", "*.so*"))):
        try:
            ctypes.CDLL(so, mode=ctypes.RTLD_GLOBAL)
        except OSError as e:
            print("preload skip", os.path.basename(so), e)

import numpy as np
from faster_whisper import WhisperModel, BatchedInferencePipeline

MODELS = {"en": "large-v3-turbo", "yi": "ivrit-ai/yi-whisper-large-v3-turbo-ct2"}
EN_PROMPT = ("Uncle Yossi, Tzivos Hashem, Hashem, the Rebbe, the Lubavitcher Rebbe, the Baal Shem Tov, the Besht, "
             "the Alter Rebbe, the Mitteler Rebbe, the Tzemach Tzedek, the Rebbe Rashab, the Frierdiker Rebbe, "
             "Chassidim, Chassidus, mitzvah, mitzvos, Torah, Shabbos, Yom Tov, tzaddik, tzedakah, Moshiach, "
             "Yiddishkeit, davening, yeshiva, cheder, Rabbi Akiva, Eliyahu Hanavi, Pesach, Sukkos, Chanukah, Purim.")
OUT = "/kaggle/working/tx"
TIME_BUDGET = 11 * 3600  # stop taking new files before Kaggle's 12h session limit
T_START = time.time()
log_lock = threading.Lock()
LOG = "/kaggle/working/run_log.jsonl"


def load_audio(p):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-f", "s16le", "-ac", "1", "-ar", "16000", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0


def worker(gpu, q):
    models = {lang: WhisperModel(name, device="cuda", device_index=gpu, compute_type="float16")
              for lang, name in MODELS.items()}
    pipes = {lang: BatchedInferencePipeline(m) for lang, m in models.items()}
    while True:
        try:
            k, p, lang = q.get_nowait()
        except queue.Empty:
            return
        if time.time() - T_START > TIME_BUDGET:
            print(f"gpu{gpu} time budget reached, leaving {k} for the next run", flush=True)
            continue
        t0 = time.time()
        try:
            audio = load_audio(p)
            detected = None
            if lang not in MODELS:  # unknown: let stock Whisper decide, anything non-English goes to the Yiddish model
                detected, prob, _ = models["en"].detect_language(audio)
                lang = "en" if detected == "en" else "yi"
            kw = dict(language=lang, word_timestamps=True, vad_filter=True, batch_size=16,
                      condition_on_previous_text=False)
            if lang == "en":
                kw["initial_prompt"] = EN_PROMPT
            segs, info = pipes[lang].transcribe(audio, **kw)
            segs = [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip(),
                     "avg_logprob": round(s.avg_logprob, 3), "no_speech_prob": round(s.no_speech_prob, 3),
                     "words": [[round(w.start, 2), round(w.end, 2), w.word, round(w.probability, 3)] for w in (s.words or [])]}
                    for s in segs]
            json.dump({"id": k, "language": lang, "detected_language": detected, "model": MODELS[lang],
                       "duration": info.duration, "segments": segs},
                      open(f"{OUT}/{k}.json", "w", encoding="utf-8"), ensure_ascii=False)
            with open(f"{OUT}/{k}.txt", "w", encoding="utf-8") as f:
                for s in segs:
                    m, sec = divmod(s["start"], 60)
                    f.write(f"[{int(m):02d}:{sec:05.2f}] {s['text']}\n")
            rec = {"id": k, "gpu": gpu, "lang": lang, "audio_sec": round(info.duration), "wall_sec": round(time.time() - t0, 1)}
            print(f"gpu{gpu} {k} [{lang}] {info.duration/60:.1f}min in {time.time()-t0:.0f}s", flush=True)
        except Exception as e:
            rec = {"id": k, "gpu": gpu, "lang": lang, "error": repr(e)[:500]}
            print(f"gpu{gpu} {k} FAILED {e!r}", flush=True)
        with log_lock, open(LOG, "a") as f:
            f.write(json.dumps(rec) + "\n")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    # resume: carry over transcripts from a previous run attached as a kernel source
    for prev in glob.glob("/kaggle/input/**/tx/*.json", recursive=True):
        for ext in (".json", ".txt"):
            src = prev[:-5] + ext
            if os.path.exists(src) and not os.path.exists(f"{OUT}/{os.path.basename(src)}"):
                shutil.copy(src, OUT)
    # the audio is split over several datasets (Kaggle caps a dataset at 1000 files), each with its own manifest
    manifests = glob.glob("/kaggle/input/**/manifest.csv", recursive=True)
    jobs, total = [], 0
    for manifest in manifests:
        root = os.path.dirname(manifest)
        for r in csv.DictReader(open(manifest, encoding="utf-8")):
            total += 1
            p = os.path.join(root, r["file"])
            if not os.path.exists(f"{OUT}/{r['id']}.json"):
                jobs.append((r["id"], p, r["language"]))
    print(len(manifests), "manifests,", total, "files listed", flush=True)
    jobs.sort(key=lambda j: os.path.getsize(j[1]), reverse=True)  # longest first so the GPUs finish together
    q = queue.Queue()
    for j in jobs:
        q.put(j)
    n = torch.cuda.device_count()
    print(len(jobs), "files to do on", n, "gpus;", len(glob.glob(f"{OUT}/*.json")), "already done", flush=True)
    ts = [threading.Thread(target=worker, args=(g, q)) for g in range(n)]
    for t in ts: t.start()
    for t in ts: t.join()
    done = len(glob.glob(f"{OUT}/*.json"))
    print(f"ALL DONE {done}/{total} transcribed in {(time.time()-T_START)/3600:.2f} h", flush=True)
