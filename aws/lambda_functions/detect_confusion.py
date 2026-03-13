"""
PiazzaLens — Detect Confusion Lambda Function
Analyzes posts by lecture topic using Amazon Comprehend sentiment
analysis and returns confusion scores.
"""

import json
import os
import boto3

bedrock = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))
comprehend = boto3.client("comprehend", region_name=os.environ.get("AWS_REGION", "us-east-1"))
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

        # Run sentiment analysis on each post
        enriched_posts = []
        for post in posts:
            text = f"{post.get('title', '')} {post.get('body', '')}"
            sentiment = analyze_sentiment(text)
            enriched_posts.append({**post, "_sentiment": sentiment})

        # Group posts by lecture
        lecture_posts = {}
        for post in enriched_posts:
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

            total_posts = len(lec_posts)
            unresolved = sum(1 for p in lec_posts if not p.get("resolved", True))
            avg_upvotes = sum(p.get("upvotes", 0) for p in lec_posts) / max(total_posts, 1)

            # Count negative/mixed sentiment posts (from Comprehend)
            negative_count = sum(
                1 for p in lec_posts
                if p.get("_sentiment", {}).get("Sentiment") in ("NEGATIVE", "MIXED")
            )
            # Average negative sentiment confidence
            avg_negative_score = sum(
                p.get("_sentiment", {}).get("SentimentScore", {}).get("Negative", 0)
                for p in lec_posts
            ) / max(total_posts, 1)

            # Weighted confusion score (0-100) — now includes sentiment
            confusion_score = min(100, int(
                (total_posts * 4) +             # 4 points per post
                (unresolved * 12) +             # 12 points per unresolved
                (avg_upvotes * 2) +             # 2 points per avg upvote
                (negative_count * 8) +          # 8 points per negative/mixed post
                (avg_negative_score * 20)       # up to 20 points for strong negative sentiment
            ))

            results.append({
                "lecture": lec_num,
                "title": lecture.get("title", f"Lecture {lec_num}"),
                "confusionScore": confusion_score,
                "posts": total_posts,
                "unresolvedPosts": unresolved,
                "negativeCount": negative_count,
                "avgNegativeSentiment": round(avg_negative_score, 2)
            })

        # Sort by confusion score descending
        results.sort(key=lambda x: x["confusionScore"], reverse=True)

        return response(200, {"lectures": results})

    except Exception as e:
        print(f"Error: {e}")
        return response(500, {"error": str(e)})


def analyze_sentiment(text):
    """Use Amazon Comprehend for sentiment analysis."""
    if not text or not text.strip():
        return {"Sentiment": "NEUTRAL", "SentimentScore": {"Positive": 0, "Negative": 0, "Neutral": 1, "Mixed": 0}}
    try:
        result = comprehend.detect_sentiment(
            Text=text[:4500],  # Comprehend character limit
            LanguageCode="en"
        )
        return result
    except Exception as e:
        print(f"Comprehend error: {e}")
        return {"Sentiment": "NEUTRAL", "SentimentScore": {"Positive": 0, "Negative": 0, "Neutral": 1, "Mixed": 0}}


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

