"""
parsers.py

Converts the labeled plain-text format defined in prompts.py (Title:,
Description:, Servings:, etc.) into the structured dict shape the
frontend's renderRecipe() expects:

    {
        "title": str,
        "description": str,
        "servings": str,
        "prepTimeMinutes": int | None,
        "cookTimeMinutes": int | None,
        "ingredients": list[str],
        "steps": list[str],
    }

Kept separate from gemini_service.py so parsing logic can be unit
tested against sample text without any network dependency.
"""

import re


def parse_recipe_text(raw_text: str) -> dict:
    recipe = {
        "title": "",
        "description": "",
        "servings": "",
        "prepTimeMinutes": None,
        "cookTimeMinutes": None,
        "ingredients": [],
        "steps": [],
    }

    lines = [line.rstrip() for line in raw_text.strip().splitlines()]

    section = None  # tracks whether we're inside "Ingredients:" or "Steps:"

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        if stripped.lower().startswith("title:"):
            recipe["title"] = stripped.split(":", 1)[1].strip()
            section = None
        elif stripped.lower().startswith("description:"):
            recipe["description"] = stripped.split(":", 1)[1].strip()
            section = None
        elif stripped.lower().startswith("servings:"):
            recipe["servings"] = stripped.split(":", 1)[1].strip()
            section = None
        elif stripped.lower().startswith("prep time:"):
            recipe["prepTimeMinutes"] = _extract_minutes(stripped)
            section = None
        elif stripped.lower().startswith("cook time:"):
            recipe["cookTimeMinutes"] = _extract_minutes(stripped)
            section = None
        elif stripped.lower().startswith("ingredients:"):
            section = "ingredients"
        elif stripped.lower().startswith("steps:"):
            section = "steps"
        elif section == "ingredients" and stripped.startswith("-"):
            recipe["ingredients"].append(stripped.lstrip("- ").strip())
        elif section == "steps":
            # Strip a leading "1. ", "2. " etc. if present
            cleaned = re.sub(r"^\d+\.\s*", "", stripped)
            recipe["steps"].append(cleaned)

    return recipe


def _extract_minutes(line: str) -> int | None:
    match = re.search(r"\d+", line)
    return int(match.group()) if match else None
