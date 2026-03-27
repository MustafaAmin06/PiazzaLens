import os
import time
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from logging_config import get_logger
from rate_limit import limiter
from openai_client import call_openai, call_openai_json

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

logger = get_logger(__name__)

app = FastAPI(title="PiazzaLens API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Lock to extension ID in production
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    started_at = time.perf_counter()
    status_code = 500

    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    finally:
        duration_ms = (time.perf_counter() - started_at) * 1000
        logger.info(
            "request method=%s path=%s status=%s duration_ms=%.2f",
            request.method,
            request.url.path,
            status_code,
            duration_ms,
        )


@app.on_event("startup")
async def validate_environment():
    if not os.environ.get("OPENAI_API_KEY", ""):
        logger.warning("OPENAI_API_KEY is empty; AI endpoints will return fallback responses")


# ---------------------------------------------------------------------------
# Request / Response Models
# ---------------------------------------------------------------------------


class InsightPost(BaseModel):
    title: str
    resolved: bool = False
    topic: str = "general"


class InsightRequest(BaseModel):
    posts: list[InsightPost] = Field(..., max_length=30)


class ClusterPost(BaseModel):
    title: str
    tags: list[str] = []
    topic: str = "none"


class ClusterRequest(BaseModel):
    posts: list[ClusterPost] = Field(..., max_length=50)


class SearchPost(BaseModel):
    title: str


class SearchRequest(BaseModel):
    query: str = Field(..., max_length=500)
    posts: list[SearchPost] = Field(..., max_length=50)


class EmailRequest(BaseModel):
    studentName: str = Field(..., max_length=200)
    topics: list[str] = Field(default_factory=list, max_length=5)
    professorName: str = Field(default="Prof. Smith", max_length=200)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
async def health():
    return {"status": "ok"}



@app.post("/api/insight")
@limiter.limit("10/minute")
async def insight(request: Request, body: InsightRequest):
    logger.info("POST /api/insight received posts=%d", len(body.posts))
    sample = "\n".join(
        f"- {p.title} [{'resolved' if p.resolved else 'unresolved'}] ({p.topic})"
        for p in body.posts
    )
    prompt = f"""You are an education analytics assistant. Analyze these student questions from a course forum and respond with JSON.

Questions:
{sample}

Respond with a JSON object:
{{
  "topic": "the most confusing topic name",
  "percentage": <number 1-50 representing estimated confusion increase>,
  "suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"]
}}

The suggestions should be specific, actionable teaching recommendations."""

    result = call_openai_json(prompt, max_tokens=512)
    if result is None:
        logger.warning("Returning AI fallback for /api/insight")
    return result or {"error": "AI unavailable"}


@app.post("/api/clusters")
@limiter.limit("10/minute")
async def clusters(request: Request, body: ClusterRequest):
    logger.info("POST /api/clusters received posts=%d", len(body.posts))
    sample = "\n".join(
        f"- {p.title} (tags: {', '.join(p.tags) if p.tags else p.topic})"
        for p in body.posts
    )
    prompt = f"""You are an education analytics assistant. Analyze these student questions and identify the top 5 topic clusters. Respond with JSON.

Questions:
{sample}

Respond with a JSON object:
{{
  "clusters": [
    {{
      "topic": "Topic Name",
      "count": <number of questions in cluster>,
      "exampleQuestions": ["example 1", "example 2"],
      "suggestedAction": "specific teaching recommendation",
      "severity": "high" | "medium" | "low"
    }}
  ]
}}

Severity: high if >10 questions or many unresolved, medium if 5-10, low if <5."""

    result = call_openai_json(prompt, max_tokens=1024)
    if result is None:
        logger.warning("Returning AI fallback for /api/clusters")
    return result or {"error": "AI unavailable"}


@app.post("/api/search")
@limiter.limit("30/minute")
async def search(request: Request, body: SearchRequest):
    logger.info("POST /api/search received query=%r posts=%d", body.query[:50], len(body.posts))
    post_summaries = "\n".join(
        f"{i}: {p.title}" for i, p in enumerate(body.posts)
    )
    prompt = f"""Given this student question: "{body.query}"

And these existing forum posts (index: title):
{post_summaries}

Return a JSON object with the indices of the top 5 most relevant posts and a similarity score (0-1) for each:
{{"results": [{{"index": 0, "similarity": 0.95}}, ...]}}

Only include posts with similarity > 0.3. If none are relevant, return {{"results": []}}."""

    result = call_openai_json(prompt, max_tokens=256)
    if result is None:
        logger.warning("Returning AI fallback for /api/search")
    return result or {"results": []}


@app.post("/api/email")
@limiter.limit("5/minute")
async def email(request: Request, body: EmailRequest):
    logger.info("POST /api/email received student=%s topics=%d", body.studentName, len(body.topics))
    topics_str = " and ".join(body.topics[:3]) if body.topics else "recent topics"
    prompt = f"""You are a caring university professor named {body.professorName}. Write a short, warm email to a student named {body.studentName} who has been struggling with {topics_str}. The email should:
- Have a subject line starting with "Subject: "
- Be empathetic and encouraging
- Offer to meet during office hours
- Be concise (under 150 words)
- Not be condescending

Write just the email, nothing else."""

    result = call_openai(prompt, max_tokens=512)
    if result is None:
        logger.warning("Returning AI fallback for /api/email")
    return {"email": result} if result else {"error": "AI unavailable"}
