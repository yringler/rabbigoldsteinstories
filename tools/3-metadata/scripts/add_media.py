"""Add the `media` block (public audio URL + R2 location) to every item and bump the schema to 0.3.

url = https://<PUBLIC_HOST>/ + percent-encoded R2 key (spaces, apostrophes, parentheses, commas encoded; '/' kept).
Idempotent. Run from _metadata: python -I -X utf8 scripts/add_media.py
"""
import csv, glob, json, shutil, urllib.parse, os

PUBLIC_HOST = "storiesmedia.torahlearningtools.com"
BUCKET = "stories"
VERSION = "0.3"
manifest = {r["id"]: r for r in csv.DictReader(open(r"..\_r2\r2_manifest.csv", encoding="utf-8-sig"))}

schema = json.load(open("metadata.schema.json", encoding="utf-8"))
schema["properties"]["schema_version"] = {"const": VERSION}
schema["properties"]["media"] = {
    "description": "[deterministic] Where the audio lives. url is the public, playable address: "
                   "https://<public_host>/ + percent-encoded r2_key (keep '/').",
    "type": "object", "additionalProperties": False,
    "required": ["url", "public_host", "r2_bucket", "r2_key", "mime_type"],
    "properties": {
        "url": {"type": "string", "pattern": "^https://"},
        "public_host": {"type": "string"},
        "r2_bucket": {"type": "string"},
        "r2_key": {"type": "string"},
        "size_bytes": {"type": "integer", "minimum": 0},
        "mime_type": {"const": "audio/mpeg"},
    },
}
json.dump(schema, open("metadata.schema.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)


def media_for(i):
    m = manifest[i]
    return {"url": f"https://{PUBLIC_HOST}/" + urllib.parse.quote(m["key"], safe="/"), "public_host": PUBLIC_HOST,
            "r2_bucket": BUCKET, "r2_key": m["key"], "size_bytes": int(m["size"]), "mime_type": "audio/mpeg"}


if not os.path.exists(r"scripts\out\items_backup_before_media"):
    shutil.copytree("items", r"scripts\out\items_backup_before_media")
n = 0
for p in glob.glob(r"items\*.json"):
    d = json.load(open(p, encoding="utf-8"))
    d["schema_version"] = VERSION
    d["media"] = media_for(d["id"])
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1); n += 1
ex = json.load(open("examples.json", encoding="utf-8"))
for it in ex["items"]:
    it["schema_version"] = VERSION
    it["media"] = media_for(it["id"])
json.dump(ex, open("examples.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"media added to {n} items and {len(ex['items'])} examples; schema {VERSION}")
