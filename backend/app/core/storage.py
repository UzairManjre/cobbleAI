import boto3
from app.core.config import settings

# Environment variables for S3, using defaults for local MinIO
AWS_ACCESS_KEY_ID = settings.AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY = settings.AWS_SECRET_ACCESS_KEY
S3_ENDPOINT_URL = settings.S3_ENDPOINT_URL
S3_BUCKET = settings.S3_BUCKET

# Sync client for worker
def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT_URL,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
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
