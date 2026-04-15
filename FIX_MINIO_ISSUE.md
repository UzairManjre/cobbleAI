# How to Fix Document Upload Issues

## Problem
Your MinIO bucket is **empty** - PDF files were never stored in MinIO storage, only database entries were created.

## Solution

### Step 1: Clean up stale database entries
```bash
cd C:\CLG\cobbleAI\backend
.\venv\Scripts\python.exe cleanup_stale_docs.py
```

### Step 2: Ensure MinIO is running
Check if MinIO is accessible:
```bash
curl http://localhost:9002
```

If not running, start it with Docker:
```bash
docker-compose up -d minio
```

### Step 3: Re-upload documents
1. Go to Course Detail page
2. Click "+ Add Documents"
3. Select your PDF files
4. Wait for upload to complete

### Step 4: Generate graph
1. Click "Generate Graph" button
2. Wait for processing (check backend logs)
3. Enter Study Mode to see the graph

## Why This Happened
- Documents were uploaded when MinIO wasn't running OR
- Upload to MinIO failed silently during initial uploads
- Database entries were created but file storage failed

## Verification
After re-uploading, verify files are in MinIO:
```bash
cd C:\CLG\cobbleAI\backend
.\venv\Scripts\python.exe -c "from app.core.storage import get_s3_client, S3_BUCKET; s3 = get_s3_client(); paginator = s3.get_paginator('list_objects_v2'); pages = paginator.paginate(Bucket=S3_BUCKET); files = [o['Key'] for p in pages for o in p.get('Contents', [])]; print(f'Files in MinIO: {len(files)}'); [print(f'  - {f}') for f in files[:10]]"
```
