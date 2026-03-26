import logging
import os


_CONFIGURED = False


def get_logger(name: str) -> logging.Logger:
    global _CONFIGURED

    if not _CONFIGURED:
        level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
        level = getattr(logging, level_name, logging.INFO)
        logging.basicConfig(
            level=level,
            format="%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
        )
        _CONFIGURED = True

    return logging.getLogger(name)