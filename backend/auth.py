import os
from fastapi import Request, HTTPException

from logging_config import get_logger


PIAZZALENS_API_KEY = os.environ.get("PIAZZALENS_API_KEY", "")
logger = get_logger(__name__)


async def verify_api_key(request: Request):
    """Dependency that checks the X-API-Key header."""
    key = request.headers.get("X-API-Key", "")
    if not PIAZZALENS_API_KEY or key != PIAZZALENS_API_KEY:
        client_ip = request.client.host if request.client else "unknown"
        logger.warning("API key verification failed path=%s client_ip=%s", request.url.path, client_ip)
        raise HTTPException(status_code=401, detail="Invalid API key")
