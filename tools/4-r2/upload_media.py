"""Upload StoryArchive/documents (non-audio files: tape catalogs, PDFs, images) to R2 as <prefix>media/<same relative path>.

Resumable (skips same-size keys). Writes media_manifest.csv: id, original_path, key, url, content_type, size, etag.
Run: python -X utf8 upload_media.py
"""
import csv, mimetypes, os, sys, urllib.parse
sys.path.insert(0, os.path.dirname(__file__))
from r2 import s3, BUCKET, PREFIX

ARCH = r"C:\Users\ybrin\Downloads\StoryArchive"
DOCS = os.path.join(ARCH, "documents")
HOST = "storiesmedia.torahlearningtools.com"
HERE = os.path.dirname(os.path.abspath(__file__))
TYPES = {".pdf": "application/pdf", ".png": "image/png", ".jpeg": "image/jpeg", ".jpg": "image/jpeg",
         ".doc": "application/msword",
         ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}

# catalog rows with status=document carry the stable id and the original path inside the Drive zips
docs = {r["out_path"]: r for r in csv.DictReader(open(os.path.join(ARCH, "catalog.csv"), encoding="utf-8-sig")) if r["status"] == "document"}
existing = {o["Key"]: o["Size"] for p in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=PREFIX + "media/")
            for o in p.get("Contents", [])}
rows = []
for root, _, files in os.walk(DOCS):
    for f in sorted(files):
        path = os.path.join(root, f)
        rel = os.path.relpath(path, DOCS).replace("\\", "/")
        key = f"{PREFIX}media/{rel}"
        ctype = TYPES.get(os.path.splitext(f)[1].lower()) or mimetypes.guess_type(f)[0] or "application/octet-stream"
        size = os.path.getsize(path)
        cat = docs.get(f"documents/{rel}", {})
        if existing.get(key) != size:
            s3.upload_file(path, BUCKET, key, ExtraArgs={"ContentType": ctype, "Metadata": {"item-id": cat.get("id", "")}})
        etag = s3.head_object(Bucket=BUCKET, Key=key)["ETag"].strip('"')
        rows.append([cat.get("id", ""), cat.get("original_path", ""), key, f"https://{HOST}/" + urllib.parse.quote(key, safe="/"),
                     ctype, size, etag])
with open(os.path.join(HERE, "media_manifest.csv"), "w", newline="", encoding="utf-8-sig") as fh:
    w = csv.writer(fh); w.writerow(["id", "original_path", "key", "url", "content_type", "size", "etag"]); w.writerows(rows)
print(f"{len(rows)} media files in R2 under {PREFIX}media/; {sum(r[5] for r in rows)/1e6:.1f} MB; "
      f"{sum(1 for r in rows if not r[0])} without a catalog id")
