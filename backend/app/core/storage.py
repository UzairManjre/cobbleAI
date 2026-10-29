import boto3
from app.core.config import settings

# Environment variables for S3, using defaults for local MinIO
AWS_ACCESS_KEY_ID = settings.AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY = settings.AWS_SECRET_ACCESS_KEY
S3_ENDPOINT_URL = settings.S3_ENDPOINT_URL
S3_BUCKET = settings.S3_BUCKET

from botocore.config import Config

# Sync client for worker
def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT_URL,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name="us-east-1",
        config=Config(signature_version='s3v4', s3={'addressing_style': 'path'})
    )

# Async wrapper - uses sync client in thread pool (avoids aioboto3 dep hell)
async def get_async_s3_client():
    return get_s3_client()

def ensure_bucket_exists():
    client = get_s3_client()
    try:
        client.head_bucket(Bucket=S3_BUCKET)
    except Exception:
        client.create_bucket(Bucket=S3_BUCKET)


def presigned_get_url(key: str, expires: int = 3600, content_type: str | None = None, filename: str | None = None) -> str:
    """Time-limited URL the browser can fetch directly (video seeking uses HTTP range requests).
    Signed against S3_PUBLIC_ENDPOINT_URL when the browser reaches MinIO at a different host."""
    endpoint = settings.S3_PUBLIC_ENDPOINT_URL or S3_ENDPOINT_URL
    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name="us-east-1",
        config=Config(signature_version='s3v4', s3={'addressing_style': 'path'})
    )
    params = {"Bucket": S3_BUCKET, "Key": key}
    if content_type:
        params["ResponseContentType"] = content_type
    if filename:
        params["ResponseContentDisposition"] = f'inline; filename="{filename}"'
    return client.generate_presigned_url("get_object", Params=params, ExpiresIn=expires)
