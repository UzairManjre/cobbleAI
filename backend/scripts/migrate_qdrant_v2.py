"""Re-index every ready document into the v2 (dense + BM25, located) Qdrant collections.

Idempotent: point ids are derived from (doc_id, chunk_index), and a document's old
points are removed before its new ones are written, so the script can be re-run.
The legacy `course_<id>` collections are left untouched (retrieval prefers `_v2`
once it exists); delete them with --drop-legacy after checking the results.

Usage (from backend/):
    python -m scripts.migrate_qdrant_v2              # all courses
    python -m scripts.migrate_qdrant_v2 --course <course_id>
    python -m scripts.migrate_qdrant_v2 --dry-run
"""

import argparse
import asyncio
import uuid

from app.core.db import connect_to_mongo
from app.core.qdrant import qdrant_sync, legacy_collection_name
from app.core.storage import get_s3_client, S3_BUCKET
from app.models.document import DocumentModel
from app.services.chunking import chunk_segments, index_chunks
from app.services.ingestion.segments import extract_segments

DOCUMENT_TYPES = {"pdf", "docx", "pptx"}


async def migrate(course_id: str | None, dry_run: bool, drop_legacy: bool) -> None:
    await connect_to_mongo()
    filters = [DocumentModel.status == "ready"]
    if course_id:
        filters.append(DocumentModel.course_id == uuid.UUID(course_id))
    docs = await DocumentModel.find(*filters).to_list()
    docs = [d for d in docs if (d.file_type or "pdf") in DOCUMENT_TYPES]
    print(f"{len(docs)} ready documents to re-index{' (dry run)' if dry_run else ''}")

    s3 = get_s3_client()
    done, failed = 0, 0
    courses = set()
    for doc in docs:
        try:
            body = s3.get_object(Bucket=S3_BUCKET, Key=doc.s3_path)["Body"].read()
            segments = extract_segments(doc.file_type, body)
            chunks, summaries = chunk_segments(segments, str(doc.id))
            if dry_run:
                print(f"  {doc.filename}: {len(segments)} segments -> {len(chunks)} chunks, {len(summaries)} sections")
            else:
                count = index_chunks(chunks, str(doc.course_id), str(doc.id), doc.filename, summaries=summaries)
                doc.chunk_count = count
                await doc.save()
                print(f"  {doc.filename}: {count} chunks")
            courses.add(str(doc.course_id))
            done += 1
        except Exception as e:
            failed += 1
            print(f"  FAILED {doc.filename} ({doc.id}): {e}")

    if drop_legacy and not dry_run and failed == 0:
        for cid in courses:
            name = legacy_collection_name(cid)
            if qdrant_sync.collection_exists(name):
                qdrant_sync.delete_collection(name)
                print(f"  dropped legacy collection {name}")
    print(f"Done: {done} re-indexed, {failed} failed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--course", help="only this course id")
    parser.add_argument("--dry-run", action="store_true", help="extract and chunk but do not write")
    parser.add_argument("--drop-legacy", action="store_true", help="delete course_<id> collections after a clean run")
    args = parser.parse_args()
    asyncio.run(migrate(args.course, args.dry_run, args.drop_legacy))
