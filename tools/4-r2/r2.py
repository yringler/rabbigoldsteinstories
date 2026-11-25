"""Shared R2 client: reads credentials from r2.env next to this file (never printed)."""
import os, boto3
from botocore.config import Config
ENV = dict(l.strip().split("=", 1) for l in open(os.path.join(os.path.dirname(__file__), "r2.env")) if "=" in l)
BUCKET, PREFIX = ENV["R2_BUCKET"], ENV["R2_PREFIX"]
s3 = boto3.client("s3", endpoint_url=ENV["R2_ENDPOINT"], aws_access_key_id=ENV["R2_ACCESS_KEY_ID"],
                  aws_secret_access_key=ENV["R2_SECRET_ACCESS_KEY"], region_name="auto",
                  config=Config(max_pool_connections=32, retries={"max_attempts": 8, "mode": "adaptive"}))
