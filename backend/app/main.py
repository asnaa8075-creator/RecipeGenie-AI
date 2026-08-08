"""
main.py

Application entrypoint. Responsible only for:
  - creating the FastAPI app instance
  - configuring CORS (so the Vercel-hosted frontend can call this API)
  - registering routers
  - a lightweight health check for uptime monitoring / load balancers

Run locally with:
    uvicorn app.main:app --reload

In production this same ASGI app object can be served by:
  - uvicorn/gunicorn on an AWS ECS/Fargate container, or
  - Mangum (AWS Lambda ASGI adapter) if deployed as a Lambda behind
    API Gateway — no changes required to this file for that migration,
    only an additional handler wrapper at the deployment layer.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import recipe

settings = get_settings()

app = FastAPI(
    title="RecipeGenie AI API",
    description="Generates recipes from user-provided ingredients via the Gemini API.",
    version="0.1.0",
)

# Only the explicitly configured origins may call this API. In production,
# ALLOWED_ORIGINS should be set to the exact Vercel deployment URL(s) —
# never "*" once real user data or rate-limited API usage is involved.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)

app.include_router(recipe.router, prefix="/api")


@app.get("/health")
async def health_check() -> dict:
    """Used by load balancers / uptime checks. Reveals no internal state."""
    return {"status": "ok"}
