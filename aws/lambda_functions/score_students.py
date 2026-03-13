"""
PiazzaLens — Score Students Lambda Function
Scores students for at-risk detection based on post activity,
unresolved questions, and sentiment trends.
"""

import json
import os
import boto3

comprehend = boto3.client("comprehend", region_name=os.environ.get("AWS_REGION", "us-east-1"))


def handler(event, context):
    """
    POST /score-students
    Body: { "posts": [...], "totalStudents": 187 }
    Returns: { "students": [ { "name": ..., "riskScore": ..., "riskLevel": ..., ... } ] }
    """
    try:
        body = json.loads(event.get("body", "{}"))
        posts = body.get("posts", [])
        total_students = body.get("totalStudents", 100)

        if not posts:
            return response(400, {"error": "No posts provided"})

        # Group posts by author
        by_author = {}
        for post in posts:
            author = post.get("author", "Unknown")
            if author in ("Unknown", "Anonymous"):
                continue

            if author not in by_author:
                by_author[author] = {
                    "name": author,
                    "posts": [],
                    "postsCount": 0,
                    "unresolvedCount": 0,
                    "confusionSignals": 0,
                    "totalUpvotes": 0,
                    "topics": [],
                    "negativeSentimentCount": 0,
                    "assignmentsSubmitted": post.get("assignmentsSubmitted"),
                    "assignmentsTotal": post.get("assignmentsTotal")
                }

            entry = by_author[author]
            entry["posts"].append(post)
            entry["postsCount"] += 1

            if not post.get("resolved", True):
                entry["unresolvedCount"] += 1
                entry["confusionSignals"] += 1

            entry["totalUpvotes"] += post.get("upvotes", 0)

            topic = post.get("topic") or (post.get("tags", [None])[0] if post.get("tags") else None)
            if topic and topic not in entry["topics"]:
                entry["topics"].append(topic)

            # Run sentiment analysis
            text = f"{post.get('title', '')} {post.get('body', '')}"
            sentiment = analyze_sentiment(text)
            if sentiment in ("NEGATIVE", "MIXED"):
                entry["negativeSentimentCount"] += 1
                entry["confusionSignals"] += 1

        # Score each student
        students = []
        for author, data in by_author.items():
            # Risk score formula:
            #   - High post count with many unresolved = struggling
            #   - Negative sentiment trend = disengaging
            #   - Missing assignments = falling behind
            post_factor = min(30, data["postsCount"] * 5)
            unresolved_factor = min(30, data["unresolvedCount"] * 10)
            sentiment_factor = min(20, data["negativeSentimentCount"] * 7)
            assignment_factor = 0

            if (data["assignmentsSubmitted"] is not None
                    and data["assignmentsTotal"] is not None
                    and data["assignmentsTotal"] > 0):
                missed = data["assignmentsTotal"] - data["assignmentsSubmitted"]
                assignment_factor = min(20, missed * 10)

            risk_score = min(100, post_factor + unresolved_factor + sentiment_factor + assignment_factor)

            if risk_score >= 70:
                risk_level = "high"
            elif risk_score >= 40:
                risk_level = "medium"
            else:
                risk_level = "low"

            students.append({
                "name": data["name"],
                "postsCount": data["postsCount"],
                "confusionSignals": data["confusionSignals"],
                "assignmentsSubmitted": data["assignmentsSubmitted"],
                "assignmentsTotal": data["assignmentsTotal"],
                "riskScore": risk_score,
                "riskLevel": risk_level,
                "topics": data["topics"][:5]
            })

        # Sort by risk score descending
        students.sort(key=lambda s: s["riskScore"], reverse=True)

        return response(200, {"students": students})

    except Exception as e:
        print(f"Error: {e}")
        return response(500, {"error": str(e)})


def analyze_sentiment(text):
    """Use Amazon Comprehend for sentiment analysis."""
    if not text or not text.strip():
        return "NEUTRAL"
    try:
        result = comprehend.detect_sentiment(
            Text=text[:4500],
            LanguageCode="en"
        )
        return result.get("Sentiment", "NEUTRAL")
    except Exception as e:
        print(f"Comprehend error: {e}")
        return "NEUTRAL"


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
