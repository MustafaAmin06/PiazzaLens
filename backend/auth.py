import os
from fastapi import Request, HTTPException


PIAZZALENS_API_KEY = os.environ.get("PIAZZALENS_API_KEY", "")


async def verify_api_key(request: Request):
    """Dependency that checks the X-API-Key header."""
    key = request.headers.get("X-API-Key", "")
    if not PIAZZALENS_API_KEY or key != PIAZZALENS_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
