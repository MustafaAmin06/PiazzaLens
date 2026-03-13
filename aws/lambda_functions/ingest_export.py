"""
PiazzaLens — Export Ingestion Lambda Function
Validates normalized Piazza export payloads and stores them in DynamoDB.
"""

import json
import os
import uuid
from datetime import datetime, timezone

import boto3


dynamodb = boto3.resource("dynamodb")
questions_table = dynamodb.Table(os.environ.get("QUESTIONS_TABLE", "piazzalens-questions"))
course_metrics_table = dynamodb.Table(os.environ.get("COURSE_METRICS_TABLE", "piazzalens-course-metrics"))
exports_table = dynamodb.Table(os.environ.get("EXPORTS_TABLE", "piazzalens-exports"))


def handler(event, context):
    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        return response(400, {"error": "Request body must be valid JSON"})

    posts = body.get("posts", [])
    course = body.get("course", {})
    source = body.get("source", {})
    page = body.get("page", {})
    students = body.get("students", [])
    warnings = body.get("warnings", [])

    if not isinstance(posts, list) or not posts:
        return response(422, {"error": "Export payload must contain at least one post"})

    course_id = sanitize_identifier(course.get("id")) or derive_course_id(source.get("url", ""))
    export_id = str(uuid.uuid4())
    extracted_at = body.get("extractedAt") or now_iso()

    stored_posts = store_posts(posts, course_id, extracted_at, source)

    exports_table.put_item(
        Item={
            "exportId": export_id,
            "courseId": course_id,
            "courseName": course.get("name", "Unknown course"),
            "pageType": page.get("type", "unknown"),
            "sourceUrl": source.get("url", ""),
            "sourceTitle": source.get("title", ""),
            "extractionMode": body.get("extractionMode", "visible-dom-v1"),
            "schemaVersion": body.get("schemaVersion", "1.0.0"),
            "extractedAt": extracted_at,
            "postCount": stored_posts,
            "studentCount": len(students),
            "warningCount": len(warnings),
            "warnings": warnings[:10],
        }
    )

    course_metrics_table.put_item(
        Item={
            "courseId": course_id,
            "courseName": course.get("name", "Unknown course"),
            "lastExportId": export_id,
            "lastExportAt": extracted_at,
            "lastSourceUrl": source.get("url", ""),
            "lastPageType": page.get("type", "unknown"),
            "postCount": stored_posts,
            "studentCount": len(students),
            "warningCount": len(warnings),
        }
    )

    return response(
        200,
        {
            "exportId": export_id,
            "courseId": course_id,
            "storedPosts": stored_posts,
            "studentCount": len(students),
            "warningCount": len(warnings),
            "pageType": page.get("type", "unknown"),
            "uploadedAt": now_iso(),
        },
    )


def store_posts(posts, course_id, extracted_at, source):
    stored_posts = 0
    with questions_table.batch_writer() as batch:
        for index, post in enumerate(posts):
            post_id = sanitize_identifier(post.get("id")) or f"{course_id}#visible-{index + 1}"
            batch.put_item(
                Item={
                    "id": post_id,
                    "courseId": course_id,
                    "title": trim_text(post.get("title") or "Untitled Piazza Post", 250),
                    "body": trim_text(post.get("body") or "", 3500),
                    "author": post.get("author") or "Unknown",
                    "timestamp": post.get("timestamp") or extracted_at,
                    "upvotes": int(post.get("upvotes", 0) or 0),
                    "resolved": bool(post.get("resolved", False)),
                    "tags": [tag for tag in post.get("tags", []) if tag],
                    "topic": trim_text(post.get("topic") or "general", 80),
                    "lecture": post.get("lecture"),
                    "sourceUrl": post.get("url") or source.get("url", ""),
                    "sourceId": post.get("sourceId"),
                    "scrapedAt": extracted_at,
                }
            )
            stored_posts += 1

    return stored_posts


def sanitize_identifier(value):
    if not value:
        return None
    return str(value).strip().replace(" ", "-")


def derive_course_id(url):
    if not url:
        return "unknown-course"

    parts = [part for part in url.split("/") if part]
    for part in reversed(parts):
        if part and part not in {"https:", "http:", "piazza.com", "class"}:
            return sanitize_identifier(part.lower())

    return "unknown-course"


def trim_text(value, max_length):
    text = str(value or "").strip()
    if len(text) <= max_length:
        return text
    return text[: max_length - 1] + "..."


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
        "body": json.dumps(body),
    }