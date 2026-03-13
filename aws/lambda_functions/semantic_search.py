"""
PiazzaLens — Semantic Search Lambda Function
Performs similarity search on questions using Bedrock embeddings.
"""

import json
import os
import math
import boto3

bedrock = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))
EMBED_MODEL_ID = "amazon.titan-embed-text-v1"


def handler(event, context):
    """
    POST /semantic-search
    Body: { "query": "...", "questions": [...] }
    Returns: { "results": [ { "id": ..., "title": ..., "similarity": ..., "excerpt": ... } ], "similarCount": ... }
    """
    try:
        body = json.loads(event.get("body", "{}"))
        query = body.get("query", "")
        questions = body.get("questions", [])

        if not query:
            return response(400, {"error": "No query provided"})

        try:
            results = search_with_embeddings(query, questions)
        except Exception as e:
            print(f"Embedding error: {e}, falling back to keyword search")
            results = keyword_search(query, questions)

        # Count total similar
        similar_count = sum(1 for r in results if r["similarity"] > 0.5)

        return response(200, {
            "query": query,
            "results": results[:5],
            "similarCount": max(similar_count, len(results))
        })

    except Exception as e:
        print(f"Error: {e}")
        return response(500, {"error": str(e)})


def search_with_embeddings(query, questions):
    """Use Bedrock embeddings for semantic similarity search."""
    
    # Get query embedding
    query_embedding = get_embedding(query)

    # Get embeddings for all questions and compute similarity
    results = []
    for q in questions:
        text = f"{q.get('title', '')} {q.get('body', '')}"
        q_embedding = get_embedding(text)
        similarity = cosine_similarity(query_embedding, q_embedding)
        
        if similarity > 0.3:  # Threshold
            results.append({
                "id": q.get("id"),
                "title": q.get("title", ""),
                "similarity": round(similarity, 2),
                "excerpt": q.get("body", "")[:150]
            })

    # Sort by similarity
    results.sort(key=lambda x: x["similarity"], reverse=True)
    return results


def get_embedding(text):
    """Get text embedding from Amazon Bedrock Titan."""
    request_body = json.dumps({
        "inputText": text[:2000]  # Titan limit
    })

    bedrock_response = bedrock.invoke_model(
        modelId=EMBED_MODEL_ID,
        body=request_body,
        contentType="application/json",
        accept="application/json"
    )

    result = json.loads(bedrock_response["body"].read())
    return result.get("embedding", [])


def cosine_similarity(vec_a, vec_b):
    """Compute cosine similarity between two vectors."""
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0

    dot_product = sum(a * b for a, b in zip(vec_a, vec_b))
    magnitude_a = math.sqrt(sum(a * a for a in vec_a))
    magnitude_b = math.sqrt(sum(b * b for b in vec_b))

    if magnitude_a == 0 or magnitude_b == 0:
        return 0.0

    return dot_product / (magnitude_a * magnitude_b)


def keyword_search(query, questions):
    """Fallback: simple keyword-based search."""
    query_words = set(query.lower().split())
    results = []

    for q in questions:
        title = q.get("title", "").lower()
        body = q.get("body", "").lower()
        tags = [t.lower() for t in q.get("tags", [])]
        text = f"{title} {body} {' '.join(tags)}"

        # Count matching words
        text_words = set(text.split())
        overlap = len(query_words & text_words)
        
        if overlap > 0:
            # Normalize to 0-1 range
            similarity = min(0.98, overlap / max(len(query_words), 1) * 0.7 + 0.2)
            results.append({
                "id": q.get("id"),
                "title": q.get("title", ""),
                "similarity": round(similarity, 2),
                "excerpt": q.get("body", "")[:150]
            })

    results.sort(key=lambda x: x["similarity"], reverse=True)
    return results[:5]


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
