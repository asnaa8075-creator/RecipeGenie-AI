"""
gemini_service.py

The single point of contact with the Google Gemini API (via Google AI
Studio's free tier). No other module imports the `google.genai` package
or touches GOOGLE_API_KEY directly — this isolation means:
  - the API key only ever exists inside this file's client instance
  - swapping LLM providers again later means changing this file only
  - this logic can be lifted into an AWS Lambda handler with minimal
    changes, since it has no FastAPI-specific types in its signature

This file previously called the Anthropic Claude API (see git history /
prior versions as claude_service.py) — swapped to Gemini so the project
can run entirely on Google AI Studio's free tier instead of a paid API.
The SSE contract this exposes to routers/recipe.py is unchanged, so no
frontend or router code needed to change for this swap.

Streaming design:
  Gemini's SDK streams text chunks as they're generated. This function
  re-yields each chunk as a Server-Sent Events (SSE) frame immediately,
  so the frontend can display tokens as they arrive. Once the stream
  completes, the full accumulated text is parsed into structured JSON
  and sent as a final "complete" event — this is what populates the
  recipe card fields (title, ingredients list, etc.).

  If the Gemini API errors mid-stream, an "error" SSE event is sent
  instead of raising, because by that point the HTTP response has
  already started and can no longer change its status code.
"""

import json
from collections.abc import AsyncGenerator

from google import genai
from google.genai import types

from app.config import get_settings
from app.parsers import parse_recipe_text
from app.prompts import SYSTEM_PROMPT, build_recipe_prompt
from app.schemas import RecipeRequest


def _sse_event(event: str, data: dict) -> str:
    """Formats a single Server-Sent Events frame."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def stream_recipe(request: RecipeRequest) -> AsyncGenerator[str, None]:
    settings = get_settings()

    # The key is passed explicitly from our own settings object, which
    # is the only place it was loaded from the environment — never read
    # implicitly from a GOOGLE_API_KEY environment variable here.
    client = genai.Client(api_key=settings.google_api_key)

    user_prompt = build_recipe_prompt(request)
    accumulated_text = ""

    try:
        stream = await client.aio.models.generate_content_stream(
            model=settings.gemini_model,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                max_output_tokens=1500,
            ),
        )

        async for chunk in stream:
            # Not every chunk necessarily carries text (e.g. a chunk
            # that only carries safety-rating metadata) — guard against
            # None before appending.
            if chunk.text:
                accumulated_text += chunk.text
                yield _sse_event("token", {"text": chunk.text})

        recipe = parse_recipe_text(accumulated_text)
        yield _sse_event("complete", recipe)
    except Exception as exc:
        print("REAL ERROR:", repr(exc))
        is_quota_error = "RESOURCE_EXHAUSTED" in str(exc) or "429" in str(exc)
        message = (
            "The recipe service has hit its free-tier request limit for now. "
            "Please try again in a minute."
            if is_quota_error
            else "The recipe service is temporarily unavailable. Please try again."
        )
        yield _sse_event("error", {"message": message})