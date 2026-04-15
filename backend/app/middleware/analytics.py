"""
AnalyticsMiddleware — Automatically logs API calls, latency, and errors.

This middleware wraps every request to track:
- Endpoint access (page_view events for SPA routing)
- API request latency
- Error rates (status_code >= 400)
- User activity patterns

It operates independently of business logic — routes don't need to call it.
"""

import time
import json
from typing import Optional
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.models.analytics.event import AnalyticsEvent
from app.models.analytics.event_taxonomy import UIEvent


class AnalyticsMiddleware(BaseHTTPMiddleware):
    """
    Automatically tracks every API request as an analytics event.

    Events created:
    - "api_request" for successful calls (category: "api")
    - "api_error" for 4xx/5xx calls (category: "api")

    Data recorded:
    - Endpoint path
    - HTTP method
    - Response status code
    - Response latency in ms
    - User ID (from auth headers, if available)
    """

    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()

        # Process the request
        response = await call_next(request)

        # Calculate latency
        latency_ms = int((time.time() - start_time) * 1000)

        # Only track API endpoints (not static assets, health checks, etc.)
        path = request.url.path
        if not path.startswith("/api/") and not path.startswith("/auth/") and not path.startswith("/sessions/") and not path.startswith("/graph/") and not path.startswith("/documents/") and not path.startswith("/courses/") and not path.startswith("/chat"):
            return response

        # Skip health checks and OPTIONS preflight
        if path in ("/health", "/docs", "/openapi.json") or request.method == "OPTIONS":
            return response

        # Try to extract user info from request state (set by auth middleware)
        user_id = None
        user_role = None
        if hasattr(request.state, "user_id") and request.state.user_id:
            user_id = request.state.user_id
        if hasattr(request.state, "user_role") and request.state.user_role:
            user_role = request.state.user_role

        # Determine event type and category based on status code
        is_error = response.status_code >= 400
        event_type = "api_error" if is_error else "api_request"
        event_category = "api"

        # Build payload
        payload = {
            "method": request.method,
            "path": path,
            "status_code": response.status_code,
            "latency_ms": latency_ms,
        }

        # Include query params summary (sanitized — no tokens/passwords)
        if request.query_params:
            safe_params = {
                k: "***" if "token" in k.lower() or "password" in k.lower() else v
                for k, v in request.query_params.items()
            }
            payload["query_params"] = safe_params

        # Record event asynchronously (fire and forget for performance)
        # We use create() instead of await insert() to avoid blocking
        if user_id:
            try:
                event = AnalyticsEvent(
                    user_id=user_id,
                    user_role=user_role or "unknown",
                    event_type=event_type,
                    event_category=event_category,
                    payload=payload,
                )
                # Fire and forget — don't block the response
                import asyncio
                asyncio.create_task(event.insert())
            except Exception:
                # Never let analytics tracking break the app
                pass

        return response


def setup_analytics_middleware(app):
    """Register the analytics middleware on the FastAPI app."""
    app.add_middleware(AnalyticsMiddleware)
