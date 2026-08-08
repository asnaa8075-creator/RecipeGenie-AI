/**
 * script.js
 * RecipeGenie AI — client-side logic for the INDEX page only.
 *
 * As of this version, recipe generation and its display moved to a
 * dedicated recipe.html page (see recipe.js). This file's job is now
 * narrow and specific:
 *   1. Collect user inputs from the form
 *   2. Validate inputs before leaving this page
 *   3. Hand the validated payload to recipe.html and navigate there
 *
 * No network requests are made from this file — generation happens
 * entirely on recipe.html once it loads.
 */

(() => {
  "use strict";

  // Shared across every page — dark/light theme + mobile hamburger nav.
  // See app-shared.js.
  if (window.RecipeGenieShared) {
    window.RecipeGenieShared.initTheme();
    window.RecipeGenieShared.initMobileNav();
  }

  /* -----------------------------------------------------------------------
   * Configuration
   * ---------------------------------------------------------------------*/

  // Key used to pass the validated request from this page to recipe.html.
  // sessionStorage (not query params) is used so ingredient lists of any
  // reasonable length work without hitting URL length limits, and so the
  // payload doesn't linger in browser history.
  const PENDING_REQUEST_KEY = "recipegenie:pendingRequest";

  /* -----------------------------------------------------------------------
   * DOM references
   * ---------------------------------------------------------------------*/

  const form = document.getElementById("recipe-form");
  const ingredientsInput = document.getElementById("ingredients-input");
  const dietaryFilter = document.getElementById("dietary-filter");
  const cuisineSelect = document.getElementById("cuisine-select");
  const timeAvailable = document.getElementById("time-available");
  const generateButton = document.getElementById("generate-button");

  const formError = document.getElementById("form-error");
  const formErrorText = document.getElementById("form-error-text");

  /* -----------------------------------------------------------------------
   * Input collection
   * ---------------------------------------------------------------------*/

  /**
   * Reads the current form values and normalizes them into a plain object
   * matching the backend's RecipeRequest schema exactly (ingredients,
   * cuisine, diet, time) — see backend/app/schemas.py.
   */
  function collectFormInputs() {
    const rawIngredients = ingredientsInput.value || "";

    const ingredients = rawIngredients
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    return {
      ingredients,
      diet: dietaryFilter.value || null,
      cuisine: cuisineSelect.value || null,
      time: timeAvailable.value ? Number(timeAvailable.value) : null,
    };
  }

  /* -----------------------------------------------------------------------
   * Validation
   * ---------------------------------------------------------------------*/

  /**
   * Validates collected inputs before navigating away.
   * Returns { valid: boolean, errors: string[] }.
   */
  function validateInputs(inputs) {
    const errors = [];

    if (!inputs.ingredients || inputs.ingredients.length === 0) {
      errors.push("Please enter at least one ingredient.");
    }

    if (inputs.ingredients.length > 25) {
      errors.push("Please limit your list to 25 ingredients or fewer.");
    }

    const hasInvalidIngredient = inputs.ingredients.some(
      (item) => item.length > 50
    );
    if (hasInvalidIngredient) {
      errors.push("Each ingredient should be under 50 characters.");
    }

    if (
      inputs.time !== null &&
      (!Number.isFinite(inputs.time) || inputs.time <= 0)
    ) {
      errors.push("Time available must be a positive number.");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /* -----------------------------------------------------------------------
   * UI state helpers (validation feedback only — no loading/result states
   * live on this page anymore)
   * ---------------------------------------------------------------------*/

  function showFormError(message) {
    formErrorText.textContent = message;
    formError.hidden = false;
  }

  function clearFormError() {
    formError.hidden = true;
  }

  /* -----------------------------------------------------------------------
   * Navigation handoff
   * ---------------------------------------------------------------------*/

  /**
   * Stores the validated payload for recipe.html to pick up, then
   * navigates there. recipe.js reads and immediately clears this key
   * on load, so a page refresh on recipe.html won't accidentally
   * regenerate — it falls back to its own empty state instead.
   */
  function goToRecipePage(payload) {
    sessionStorage.setItem(PENDING_REQUEST_KEY, JSON.stringify(payload));
    window.location.href = "recipe.html";
  }

  /* -----------------------------------------------------------------------
   * Event wiring
   * ---------------------------------------------------------------------*/

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFormError();

    const inputs = collectFormInputs();
    const { valid, errors } = validateInputs(inputs);

    if (!valid) {
      showFormError(errors.join(" "));
      return;
    }

    generateButton.disabled = true;
    goToRecipePage(inputs);
  });
})();
