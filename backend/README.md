# RecipeGenie AI — Backend

FastAPI service that generates recipes from user-provided ingredients
using the Google Gemini API (via Google AI Studio's free tier), streamed back over Server-Sent Events (SSE).

## Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # then fill in GOOGLE_API_KEY
uvicorn app.main:app --reload
```

Server runs at `http://localhost:8000`. Interactive docs at
`http://localhost:8000/docs`.

## Endpoint

### `POST /api/generate-recipe`

**Request body:**
```json
{
  "ingredients": ["chicken", "spinach", "garlic", "rice"],
  "cuisine": "italian",
  "diet": "gluten-free",
  "time": 30
}
```
Only `ingredients` is required; `cuisine`, `diet`, and `time` are optional.

**Response:** `text/event-stream`. Frames sent, in order:

```
event: token
data: {"text": "Title: "}

event: token
data: {"text": "Garlic "}

... (many more token events as the model generates) ...

event: complete
data: {"title": "Garlic Butter Chicken", "description": "...", "servings": "4",
       "prepTimeMinutes": 10, "cookTimeMinutes": 20,
       "ingredients": ["..."], "steps": ["..."]}
```

If generation fails partway through, an `error` event is sent instead
of `complete`:
```
event: error
data: {"message": "The recipe service is temporarily unavailable. Please try again."}
```

## Integration note for the frontend

The existing `script.js` streaming scaffold (`requestRecipeStream`,
`decodeChunk`, `parseFinalPayload`) was written before this SSE contract
existed and currently assumes the accumulated stream is one JSON blob.
To connect it to this backend, `decodeChunk`/the reading loop need to
parse SSE frames (split on blank lines, read the `event:`/`data:`
pairs) rather than treat the raw text as JSON — the `complete` event's
`data` payload is the JSON your `renderRecipe()` already expects.

Also note the field name difference: the frontend currently sends
`dietaryFilter` and `timeAvailable`; this backend expects `diet` and
`time` per your stated requirements. One side will need to align
before they're wired together — happy to update either.

## Security notes

- `GOOGLE_API_KEY` is read once in `app/config.py` from environment
  variables and never logged, returned, or passed to the client.
- `.env` is gitignored; only `.env.example` (no real values) is committed.
- CORS is restricted to explicitly allowed origins (`ALLOWED_ORIGINS`) —
  do not set this to `*` in production.
- Input is validated and length-capped in `app/schemas.py` before any
  LLM call is made, limiting cost exposure from abusive requests.

## Deployment path (AWS)

This app is a standard ASGI app (`app.main:app`), so it can run:
- **Containerized** on ECS/Fargate behind an Application Load Balancer
  (recommended for SSE, since streaming responses work naturally)
- **On Lambda** via the `Mangum` adapter behind API Gateway — note API
  Gateway has response streaming limitations depending on integration
  type, so verify SSE behavior end-to-end if choosing this route
