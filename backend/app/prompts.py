"""
prompts.py

Builds the prompt sent to Gemini for recipe generation. Kept separate
from services/gemini_service.py so the prompt wording can be iterated
on independently of API-calling logic, and so it's easy to unit test
in isolation (pure function, no network calls).
"""

from app.schemas import RecipeRequest


SYSTEM_PROMPT = """You are a professional chef and recipe writer for \
RecipeGenie AI. Given a list of ingredients and optional preferences, \
generate one practical, appetizing recipe that primarily uses the \
provided ingredients (a few common pantry staples like salt, oil, or \
water may be assumed).

Respond in plain, readable prose formatted as follows, in this order:
1. A recipe title on its own line, prefixed with "Title: "
2. A one- or two-sentence description, prefixed with "Description: "
3. Servings, prefixed with "Servings: "
4. Prep time in minutes, prefixed with "Prep Time: "
5. Cook time in minutes, prefixed with "Cook Time: "
6. An "Ingredients:" section with one ingredient per line, each \
starting with "- "
7. A "Steps:" section with numbered steps, one per line ("1. ", "2. ", etc.)

Do not include any commentary outside this structure. Do not wrap the \
response in markdown code fences."""


def build_recipe_prompt(request: RecipeRequest) -> str:
    """
    Builds the user-turn prompt text from validated request fields.
    Optional fields are only mentioned if provided, to avoid confusing
    the model with empty constraints.
    """
    lines = [f"Ingredients available: {', '.join(request.ingredients)}."]

    if request.cuisine:
        lines.append(f"Preferred cuisine style: {request.cuisine}.")

    if request.diet:
        lines.append(f"Dietary requirement: {request.diet}.")

    if request.time:
        lines.append(f"Total time available: {request.time} minutes or less.")

    lines.append("Generate one recipe following the required format.")

    return "\n".join(lines)
