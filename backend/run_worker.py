#!/usr/bin/env python3
"""
Canvas Background Worker

Run periodic background tasks (alert checker / audit cleanup) in a dedicated process.

Usage:
  python run_worker.py

Tip:
  - In the web API process, set `ENABLE_BACKGROUND_TASKS=false`
  - In this worker process, keep `ENABLE_BACKGROUND_TASKS=true`
"""

import asyncio

from dotenv import load_dotenv

# Load env vars from .env for local/dev runs.
load_dotenv()

from app.core.logging import setup_logging

setup_logging()

from app.background_worker import run_background_worker


if __name__ == "__main__":
    asyncio.run(run_background_worker())

