"""Server-side move of every object from one R2 prefix to another (copy, verify size, delete). Usage: move_prefix.py OLD/ NEW/"""
import sys, os
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(__file__))
from r2 import s3, BUCKET
old, new = sys.argv[1:3]
objs = [o for p in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=old) for o in p.get("Contents", [])]

def mv(o):
    k2 = new + o["Key"][len(old):]
    s3.copy_object(Bucket=BUCKET, Key=k2, CopySource={"Bucket": BUCKET, "Key": o["Key"]}, MetadataDirective="COPY")
    assert s3.head_object(Bucket=BUCKET, Key=k2)["ContentLength"] == o["Size"]
    s3.delete_object(Bucket=BUCKET, Key=o["Key"])
    return 1

with ThreadPoolExecutor(16) as ex: n = sum(ex.map(mv, objs))
left = s3.list_objects_v2(Bucket=BUCKET, Prefix=old).get("KeyCount", 0)
print(f"moved {n} objects {old} -> {new}; left under {old}: {left}")
