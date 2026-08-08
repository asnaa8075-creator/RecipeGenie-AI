"""
routers/recipe.py

The HTTP-facing endpoint for recipe generation. Deliberately thin:
its only jobs are to accept and validate the request (via the
RecipeRequest schema) and hand off to gemini_service.stream_recipe(),
returning its output as a streaming HTTP response.

No prompt construction, no LLM client code, no parsing logic lives
here — see prompts.py, services/gemini_service.py, and parsers.py.
"""

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.schemas import RecipeRequest
from app.services.gemini_service import stream_recipe

router = APIRouter()


@router.post("/generate-recipe")
async def generate_recipe(request: RecipeRequest) -> StreamingResponse:
    """
    Accepts { ingredients, cuisine, diet, time } (validated by
    RecipeRequest) and streams the generated recipe back as
    Server-Sent Events.

    Event types sent to the client:
      - "token"    { text: str }   — a chunk of generated text, in order
      - "complete" { ...recipe }   — the fully parsed recipe object
      - "error"    { message: str } — sent instead of "complete" on failure
    """
    return StreamingResponse(
        stream_recipe(request),
        media_type="text/event-stream",
        headers={
            # Prevents intermediary proxies from buffering the stream,
            # which would defeat the purpose of streaming.
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
