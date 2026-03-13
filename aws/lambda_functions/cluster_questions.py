"""
PiazzaLens — Cluster Questions Lambda Function
Clusters Piazza questions using Amazon Bedrock (Claude) and returns top topics.
"""

import json
import os
import boto3
from collections import Counter

# Initialize Bedrock client
bedrock = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))
MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-3-haiku-20240307-v1:0")


def handler(event, context):
    """
    POST /cluster-questions
    Body: { "questions": [ { "id": ..., "title": ..., "body": ..., "tags": [...] }, ... ] }
    Returns: { "clusters": [ { "topic": ..., "count": ..., "exampleQuestions": [...], "suggestedAction": ... } ] }
    """
    try:
        body = json.loads(event.get("body", "{}"))
        questions = body.get("questions", [])

        if not questions:
            return response(400, {"error": "No questions provided"})

        # Try Bedrock first
        try:
            clusters = cluster_with_bedrock(questions)
        except Exception as e:
            print(f"Bedrock error: {e}")
            # Fallback to simple tag-based clustering
            clusters = cluster_with_tags(questions)

        return response(200, {"clusters": clusters})

    except Exception as e:
        print(f"Error: {e}")
        return response(500, {"error": str(e)})


def cluster_with_bedrock(questions):
    """Use Amazon Bedrock (Claude) to intelligently cluster questions."""
    
    # Prepare question summaries for the prompt
    question_text = "\n".join(
        [f"- {q.get('title', '')} (tags: {', '.join(q.get('tags', []))})" for q in questions[:50]]
    )

    prompt = f"""Analyze the following student questions from a course forum and identify the top 5 most common topic clusters.

Questions:
{question_text}

For each cluster, provide:
1. A descriptive topic name
2. Count of questions in that cluster
3. 2-3 example question titles
4. A specific suggested action for the professor to address this in lecture
5. Severity: "high" (>15 questions or fundamental misunderstanding), "medium" (8-15 questions), "low" (<8 questions)

Return ONLY valid JSON in this exact format:
{{
  "clusters": [
    {{
      "topic": "Topic Name",
      "count": 17,
      "exampleQuestions": ["Question 1", "Question 2"],
      "suggestedAction": "Specific suggestion for professor",
      "severity": "high"
    }}
  ]
}}"""

    # Call Bedrock
    request_body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 1024,
        "messages": [
            {"role": "user", "content": prompt}
        ]
    })

    bedrock_response = bedrock.invoke_model(
        modelId=MODEL_ID,
        body=request_body,
        contentType="application/json",
        accept="application/json"
    )

    result = json.loads(bedrock_response["body"].read())
    response_text = result["content"][0]["text"]

    # Parse JSON from response
    parsed = json.loads(response_text)
    return parsed.get("clusters", [])


def cluster_with_tags(questions):
    """Fallback: cluster questions using tag frequency analysis."""
    
    tag_counter = Counter()
    tag_questions = {}

    for q in questions:
        for tag in q.get("tags", []):
            tag_counter[tag] += 1
            if tag not in tag_questions:
                tag_questions[tag] = []
            tag_questions[tag].append(q.get("title", ""))

    # Get top 5 tags as clusters
    clusters = []
    for tag, count in tag_counter.most_common(5):
        examples = tag_questions.get(tag, [])[:3]
        severity = "high" if count > 15 else "medium" if count > 8 else "low"
        clusters.append({
            "topic": tag.replace("-", " ").title(),
            "count": count,
            "exampleQuestions": examples,
            "suggestedAction": f"Review {tag.replace('-', ' ')} concepts. Consider providing additional examples and practice problems.",
            "severity": severity
        })

    return clusters


def response(status_code, body):
    """Create API Gateway response."""
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
