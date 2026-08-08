"""
schemas.py

Pydantic models defining the request contract for recipe generation.
These validate incoming requests before anything reaches the LLM —
malformed or abusive input is rejected here, at zero API cost.

Field names match the four inputs specified in the requirements:
ingredients, cuisine, diet, time.
"""

from typing import Optional
from pydantic import BaseModel, Field, field_validator


class RecipeRequest(BaseModel):
    ingredients: list[str] = Field(
        ...,
        min_length=1,
        max_length=25,
        description="List of ingredients the user has available.",
    )
    cuisine: Optional[str] = Field(
        default=None,
        max_length=50,
        description="Optional cuisine style, e.g. 'italian', 'thai'.",
    )
    diet: Optional[str] = Field(
        default=None,
        max_length=50,
        description="Optional dietary preference, e.g. 'vegan', 'gluten-free'.",
    )
    time: Optional[int] = Field(
        default=None,
        gt=0,
        le=480,
        description="Optional max time available in minutes (up to 8 hours).",
    )

    @field_validator("ingredients")
    @classmethod
    def clean_ingredients(cls, value: list[str]) -> list[str]:
        """Trims whitespace and drops empty entries after trimming."""
        cleaned = [item.strip() for item in value if item.strip()]
        if not cleaned:
            raise ValueError("At least one non-empty ingredient is required.")
        for item in cleaned:
            if len(item) > 50:
                raise ValueError(f"Ingredient '{item[:20]}...' exceeds 50 characters.")
        return cleaned

    @field_validator("cuisine", "diet")
    @classmethod
    def clean_optional_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned if cleaned else None
