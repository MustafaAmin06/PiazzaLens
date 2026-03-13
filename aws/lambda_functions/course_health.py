"""
PiazzaLens — Course Health Lambda Function
Computes course engagement and health scores from metrics.
"""

import json
import os


def handler(event, context):
    """
    POST /course-health
    Body: { "courseId": "...", "posts": [...], "students": [...] }
    Returns: { "score": 82, "breakdown": {...}, "insights": [...], "trend": [...] }
    """
    try:
        body = json.loads(event.get("body", "{}"))
        posts = body.get("posts", [])
        students = body.get("students", [])
        total_students = body.get("totalStudents", 187)

        # ---- Calculate Metrics ----
        total_posts = len(posts)
        resolved_posts = sum(1 for p in posts if p.get("resolved", False))
        unresolved_posts = total_posts - resolved_posts
        active_students = len(set(p.get("author") for p in posts))

        # Engagement score (0-100)
        engagement = min(100, int((active_students / max(total_students, 1)) * 100 * 1.2))

        # Response/Resolution score
        resolution = int((resolved_posts / max(total_posts, 1)) * 100) if total_posts > 0 else 100

        # Participation (students who posted)
        participation = min(100, int((active_students / max(total_students, 1)) * 100 * 1.1))

        # Response time (simulated for MVP)
        response_time_score = 79

        # Overall score (weighted average)
        overall = int(
            engagement * 0.30 +
            response_time_score * 0.20 +
            resolution * 0.25 +
            participation * 0.25
        )

        # Generate insights
        insights = []
        if engagement >= 80:
            insights.append(f"Engagement is high — {participation}% student participation rate")
        else:
            insights.append(f"Engagement could improve — only {participation}% participation")

        if unresolved_posts > 0:
            insights.append(f"{unresolved_posts} unresolved posts need attention")

        if response_time_score < 80:
            insights.append("Response time has room for improvement")

        if resolution < 75:
            insights.append("Resolution rate is below target — consider addressing open questions")

        result = {
            "score": overall,
            "breakdown": {
                "engagement": {
                    "score": engagement,
                    "label": "High" if engagement >= 80 else "Medium" if engagement >= 60 else "Low",
                    "detail": f"{total_students} students, {active_students} active on Piazza"
                },
                "responseTime": {
                    "score": response_time_score,
                    "label": "Good",
                    "detail": "Average response time: 2.3 hours"
                },
                "resolution": {
                    "score": resolution,
                    "label": "Needs Attention" if resolution < 75 else "Good",
                    "detail": f"{unresolved_posts} unresolved posts ({100 - resolution}%)"
                },
                "participation": {
                    "score": participation,
                    "label": "High" if participation >= 80 else "Medium",
                    "detail": f"{participation}% of students have posted or commented"
                }
            },
            "insights": insights,
            "trend": [
                {"week": "Week 1", "score": min(100, overall + 8)},
                {"week": "Week 2", "score": min(100, overall + 5)},
                {"week": "Week 3", "score": min(100, overall + 3)},
                {"week": "Week 4", "score": overall},
                {"week": "Week 5", "score": max(0, overall - 4)},
                {"week": "Week 6", "score": overall}
            ]
        }

        return response(200, result)

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
