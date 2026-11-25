"""Re-transcribe one archive item locally on CPU with a forced language; writes the same JSON/TXT format as the Kaggle kernel."""
import json, sys, subprocess, numpy as np
from faster_whisper import WhisperModel, BatchedInferencePipeline
src, item_id, lang, out_dir = sys.argv[1:5]
MODELS = {"en": "large-v3-turbo", "yi": "ivrit-ai/yi-whisper-large-v3-turbo-ct2"}
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-f", "s16le", "-ac", "1", "-ar", "16000", "-"], capture_output=True, check=True).stdout
audio = np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0
pipe = BatchedInferencePipeline(WhisperModel(MODELS[lang], device="cpu", compute_type="int8", cpu_threads=8))
segs, info = pipe.transcribe(audio, language=lang, word_timestamps=True, vad_filter=True, batch_size=8, condition_on_previous_text=False)
segs = [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip(), "avg_logprob": round(s.avg_logprob, 3),
         "no_speech_prob": round(s.no_speech_prob, 3),
         "words": [[round(w.start, 2), round(w.end, 2), w.word, round(w.probability, 3)] for w in (s.words or [])]} for s in segs]
json.dump({"id": item_id, "language": lang, "detected_language": None, "model": MODELS[lang], "duration": info.duration,
           "segments": segs, "note": "re-transcribed locally with forced language"},
          open(f"{out_dir}/{item_id}.json", "w", encoding="utf-8"), ensure_ascii=False)
with open(f"{out_dir}/{item_id}.txt", "w", encoding="utf-8") as f:
    for s in segs:
        m, sec = divmod(s["start"], 60)
        f.write(f"[{int(m):02d}:{sec:05.2f}] {s['text']}\n")
print("\n".join(s["text"] for s in segs)[:500])
