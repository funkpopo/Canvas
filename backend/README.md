# Canvas Backend

FastAPI service that connects to Kubernetes clusters and exposes REST and WebSocket APIs for the Canvas dashboard.

## Features
- Async wrappers around the official Kubernetes Python client.
- Cached data fetches with optimistic refresh to avoid API server overload.
- WebSocket stream for cluster events.
- Structured logging via `structlog`.

## Getting Started
1. Create a virtual environment targeting Python 3.11+.
2. Install dependencies: `pip install -e .[dev]`.
3. Populate `.env` based on `env.example`.
4. Run the server: `uvicorn app.main:app --reload`.

## Testing
Run the test suite with `pytest`.
