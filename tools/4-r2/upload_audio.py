"""Upload StoryArchive/audio to R2 as <prefix>audio/<same relative path>. Resumable: skips keys already there with the same size.

Writes r2_manifest.csv (id, key, size, etag) and upload.log. Run: python -X utf8 upload_audio.py
"""
import csv, os, sys, time, threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from boto3.s3.transfer import TransferConfig
sys.path.insert(0, os.path.dirname(__file__))
from r2 import s3, BUCKET, PREFIX

ARCH = r"C:\Users\ybrin\Downloads\StoryArchive"
HERE = os.path.dirname(os.path.abspath(__file__))
ids = {r["out_path"]: r["id"] for r in csv.DictReader(open(os.path.join(ARCH, "catalog.csv"), encoding="utf-8-sig")) if r["status"] == "converted"}

existing = {}
for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=PREFIX + "audio/"):
    for o in page.get("Contents", []):
        existing[o["Key"]] = (o["Size"], o["ETag"].strip('"'))

jobs = []
for rel, i in ids.items():
    path = os.path.join(ARCH, rel)
    key = PREFIX + rel.replace("\\", "/")
    jobs.append((i, path, key, os.path.getsize(path)))

cfg = TransferConfig(multipart_threshold=64 * 1024 * 1024, multipart_chunksize=16 * 1024 * 1024, max_concurrency=4)
lock = threading.Lock(); done = [0, 0]; t0 = time.time(); log = open(os.path.join(HERE, "upload.log"), "a", encoding="utf-8")


def up(job):
    i, path, key, size = job
    if existing.get(key, (None,))[0] == size:
        return i, key, size, existing[key][1], "skipped"
    s3.upload_file(path, BUCKET, key, Config=cfg,
                   ExtraArgs={"ContentType": "audio/mpeg", "Metadata": {"item-id": i}})
    etag = s3.head_object(Bucket=BUCKET, Key=key)["ETag"].strip('"')
    return i, key, size, etag, "uploaded"


rows = []
with ThreadPoolExecutor(12) as ex:
    for fut in as_completed([ex.submit(up, j) for j in jobs]):
        try:
            i, key, size, etag, how = fut.result()
        except Exception as e:
            log.write(f"ERROR {e!r}\n"); log.flush(); continue
        rows.append((i, key, size, etag))
        with lock:
            done[0] += 1; done[1] += size
            if done[0] % 50 == 0 or done[0] == len(jobs):
                log.write(f"{done[0]}/{len(jobs)} files, {done[1]/1e9:.1f} GB, {time.time()-t0:.0f}s\n"); log.flush()
with open(os.path.join(HERE, "r2_manifest.csv"), "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f); w.writerow(["id", "key", "size", "etag"]); w.writerows(sorted(rows, key=lambda r: r[1]))
print(f"done: {len(rows)}/{len(jobs)} files in manifest, {sum(r[2] for r in rows)/1e9:.2f} GB, {time.time()-t0:.0f}s")
