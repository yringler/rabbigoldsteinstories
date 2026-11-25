"""Rename a confirmed placeholder speaker id everywhere and archive its now-resolved identity guesses.
Usage: python -I -X utf8 scripts/rename_speaker.py OLD NEW"""
import json, glob, sys, os
OLD, NEW = sys.argv[1:3]

def walk(x):
    if isinstance(x, dict): return {k: walk(v) for k, v in x.items()}
    if isinstance(x, list): return [walk(v) for v in x]
    return NEW if x == OLD else x

resolved, changed = [], 0
for p in glob.glob("items/*.json"):
    d = json.load(open(p, encoding="utf-8"))
    g = d.get("identity_guesses") or []
    keep = [e for e in g if e.get("placeholder_id") != OLD]
    resolved += [dict(e, item=d["id"]) for e in g if e.get("placeholder_id") == OLD]
    if len(keep) != len(g): d["identity_guesses"] = keep
    new = walk(d)
    if new != json.load(open(p, encoding="utf-8")):
        json.dump(new, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1); changed += 1
json.dump(resolved, open(f"scripts/out/resolved_identity_guesses_{OLD}.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for p in ("vocabularies.json", "examples.json"):
    json.dump(walk(json.load(open(p, encoding="utf-8"))), open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for p in ("vocab_compact.txt", "PASS1_INSTRUCTIONS.md"):
    t = open(p, encoding="utf-8").read(); open(p, "w", encoding="utf-8").write(t.replace(OLD, NEW))
print(f"{changed} items updated; {len(resolved)} resolved guesses archived")
