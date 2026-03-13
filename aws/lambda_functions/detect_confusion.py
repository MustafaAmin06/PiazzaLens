"""
PiazzaLens — Detect Confusion Lambda Function
Analyzes posts by lecture topic and returns confusion scores.
"""

import json
import os
import boto3

bedrock = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))
MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-3-haiku-20240307-v1:0")


def handler(event, context):
    """
    POST /detect-confusion
    Body: { "posts": [...], "lectures": [...] }
    Returns: { "lectures": [ { "lecture": 1, "title": ..., "confusionScore": ..., ... } ] }
    """
    try:
        body = json.loads(event.get("body", "{}"))
        posts = body.get("posts", [])
        lectures = body.get("lectures", [])

        if not posts:
            return response(400, {"error": "No posts provided"})

        # Group posts by lecture
        lecture_posts = {}
        for post in posts:
            lec = post.get("lecture")
            if lec:
                if lec not in lecture_posts:
                    lecture_posts[lec] = []
                lecture_posts[lec].append(post)

        # Calculate confusion scores
        results = []
        for lecture in lectures:
            lec_num = lecture.get("lecture")
            lec_posts = lecture_posts.get(lec_num, [])
            
            # Simple confusion scoring based on:
            # - Number of posts (more posts = more confusion)
            # - Number of unresolved posts
            # - Average upvotes (higher upvotes = more students share the confusion)
            total_posts = len(lec_posts)
            unresolved = sum(1 for p in lec_posts if not p.get("resolved", True))
            avg_upvotes = sum(p.get("upvotes", 0) for p in lec_posts) / max(total_posts, 1)
            
            # Weighted confusion score (0-100)
            confusion_score = min(100, int(
                (total_posts * 5) +       # 5 points per post
                (unresolved * 15) +        # 15 points per unresolved
                (avg_upvotes * 2)          # 2 points per avg upvote
            ))

            results.append({
                "lecture": lec_num,
                "title": lecture.get("title", f"Lecture {lec_num}"),
                "confusionScore": confusion_score,
                "posts": total_posts,
                "unresolvedPosts": unresolved
            })

        # Sort by confusion score descending
        results.sort(key=lambda x: x["confusionScore"], reverse=True)

        return response(200, {"lectures": results})

    except Exception as e:
        print(f"Error: {e}")
        return response(500, {"error": str(e)})


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        },
        "body": json.dumps(body)
    }
