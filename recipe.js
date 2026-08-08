/**
 * recipe.js
 * RecipeGenie AI — client-side logic for the RECIPE OUTPUT page.
 *
 * This file owns everything that used to live in index.html's script.js
 * around generation: sending the request, streaming the response,
 * showing loading/typing/error/success states, and rendering the result.
 *
 * Flow:
 *   1. On load, read the validated request payload that index.html
 *      stored in sessionStorage before navigating here.
 *   2. If no payload is found (e.g. this page was opened directly),
 *      show the empty state and stop.
 *   3. Otherwise, immediately generate a recipe from that payload.
 *   4. "Try another recipe" / "Try again" re-run generation using the
 *      same payload, kept in memory for the rest of this page's life.
 *
 * Backend contract (unchanged — see backend/app/schemas.py and
 * backend/app/routers/recipe.py):
 *   Request:  { ingredients: string[], cuisine, diet, time }
 *   Response: SSE with events "token" | "complete" | "error"
 */

(() => {
  "use strict";

  // Shared across every page — dark/light theme + mobile hamburger nav.
  if (window.RecipeGenieShared) {
    window.RecipeGenieShared.initTheme();
    window.RecipeGenieShared.initMobileNav();
  }
  const Shared = window.RecipeGenieShared;

  /* -----------------------------------------------------------------------
   * Configuration
   * ---------------------------------------------------------------------*/

  // Base URL of the FastAPI backend — update this one constant when
  // deploying (e.g. to the AWS-hosted backend URL). Same contract as
  // was used from index.html previously; only where it's called from
  // has changed.
  const BACKEND_BASE_URL = "http://localhost:8000";
  const API_ENDPOINT = `${BACKEND_BASE_URL}/api/generate-recipe`;

  // Matches the key index.html's script.js writes to before navigating.
  const PENDING_REQUEST_KEY = "recipegenie:pendingRequest";

  // Written by history.html when the user clicks "View" on a past recipe.
  const VIEW_HISTORY_ITEM_KEY = "recipegenie:viewHistoryItem";

  /* -----------------------------------------------------------------------
   * DOM references
   * ---------------------------------------------------------------------*/

  const emptyState = document.getElementById("empty-state");

  const loadingState = document.getElementById("loading-state");
  const typingTextEl = document.getElementById("typing-text");

  const errorState = document.getElementById("error-state");
  const errorMessageEl = document.getElementById("error-message-text");
  const retryButton = document.getElementById("retry-button");

  const recipeResult = document.getElementById("recipe-result");
  const recipeTitleEl = recipeResult.querySelector(".recipe-title");
  const recipeDescriptionEl = recipeResult.querySelector(".recipe-description");
  const recipeServingsEl = recipeResult.querySelector(".recipe-servings");
  const recipePrepTimeEl = recipeResult.querySelector(".recipe-prep-time");
  const recipeCookTimeEl = recipeResult.querySelector(".recipe-cook-time");
  const recipeIngredientsListEl = recipeResult.querySelector(".recipe-ingredients-list");
  const recipeStepsListEl = recipeResult.querySelector(".recipe-steps-list");

  const regenerateButton = document.getElementById("regenerate-button");
  const favoriteButton = document.getElementById("save-button");
  const copyButton = document.getElementById("copy-button");
  const printButton = document.getElementById("print-button");
  const downloadPdfButton = document.getElementById("download-pdf-button");
  const shareButton = document.getElementById("share-button");

  const successToast = document.getElementById("success-toast");
  const successMessageEl = document.getElementById("success-message-text");

  // Kept in memory for "Try another recipe" / "Try again" — not written
  // back to sessionStorage, so a page refresh intentionally falls back
  // to the empty state rather than silently re-generating.
  let lastRequestPayload = null;

  // The full history entry ({ id, recipe, request, generatedAt }) for
  // whatever is currently displayed — needed by favorite/copy/print/
  // PDF/share, all of which act on "the recipe on screen right now".
  let currentEntry = null;

  let activeAbortController = null;
  let successToastTimeoutId = null;

  /* -----------------------------------------------------------------------
   * UI state helpers
   * ---------------------------------------------------------------------*/

  function setLoading(isLoading) {
    loadingState.hidden = !isLoading;
    if (isLoading) {
      typingTextEl.textContent = "";
      emptyState.hidden = true;
      errorState.hidden = true;
      recipeResult.hidden = true;
    }
  }

  function classifyError(err) {
    if (err instanceof TypeError) {
      return "Can't reach the recipe service right now. Check your connection and try again.";
    }
    if (typeof err.message === "string" && err.message.startsWith("Request failed with status")) {
      return "The recipe service returned an unexpected error. Please try again in a moment.";
    }
    return err.message || "Something went wrong generating your recipe. Please try again.";
  }

  function showError(message) {
    recipeResult.hidden = true;
    errorState.hidden = false;
    errorMessageEl.textContent = message;
  }

  function clearError() {
    errorState.hidden = true;
  }

  function showSuccess(message) {
    successMessageEl.textContent = message || "Recipe generated successfully!";
    successToast.hidden = false;

    void successToast.offsetWidth; // force reflow so the transition replays
    successToast.classList.add("is-visible");

    if (successToastTimeoutId) {
      clearTimeout(successToastTimeoutId);
    }

    successToastTimeoutId = setTimeout(() => {
      successToast.classList.remove("is-visible");
      setTimeout(() => {
        successToast.hidden = true;
      }, 400);
    }, 3200);
  }

  /* -----------------------------------------------------------------------
   * Rendering
   * ---------------------------------------------------------------------*/

  function renderRecipe(recipe, requestPayload) {
    if (!recipe) return;

    recipeTitleEl.textContent = recipe.title || "Untitled recipe";
    recipeDescriptionEl.textContent = recipe.description || "";
    recipeServingsEl.textContent = recipe.servings ?? "—";
    recipePrepTimeEl.textContent = formatMinutes(recipe.prepTimeMinutes);
    recipeCookTimeEl.textContent = formatMinutes(recipe.cookTimeMinutes);

    renderList(recipeIngredientsListEl, recipe.ingredients);
    renderList(recipeStepsListEl, recipe.steps);

    emptyState.hidden = true;
    errorState.hidden = true;
    recipeResult.hidden = false;

    updateFavoriteButton();

    recipeResult.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /**
   * Reflects currentEntry's favorite status on the toggle button. Safe
   * to call even if currentEntry isn't saved to history yet (e.g. a
   * network hiccup meant addToHistory never ran) — falls back to an
   * unfavorited, disabled-looking state.
   */
  function updateFavoriteButton() {
    if (!Shared || !currentEntry) {
      favoriteButton.setAttribute("aria-pressed", "false");
      return;
    }

    const favorited = Shared.isFavorite(currentEntry.id);
    favoriteButton.setAttribute("aria-pressed", String(favorited));
    favoriteButton.querySelector("span[aria-hidden]").textContent = favorited ? "★" : "☆";
  }

  function renderList(listEl, items) {
    listEl.innerHTML = "";

    if (!Array.isArray(items) || items.length === 0) {
      const li = document.createElement("li");
      li.textContent = "Not available.";
      listEl.appendChild(li);
      return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      fragment.appendChild(li);
    });
    listEl.appendChild(fragment);
  }

  function formatMinutes(minutes) {
    if (typeof minutes !== "number" || !Number.isFinite(minutes)) {
      return "—";
    }
    return `${minutes} min`;
  }

  /**
   * Drives the "typing effect" preview shown in the loading state, fed
   * by real streamed tokens from the backend (not a simulated animation).
   */
  function handleStreamingPartialUpdate(accumulatedText) {
    const PREVIEW_MAX_CHARS = 200;
    const preview =
      accumulatedText.length > PREVIEW_MAX_CHARS
        ? accumulatedText.slice(-PREVIEW_MAX_CHARS)
        : accumulatedText;

    typingTextEl.textContent = preview;
  }

  /* -----------------------------------------------------------------------
   * Networking — SSE streaming from the FastAPI backend
   * ---------------------------------------------------------------------*/

  /**
   * Reads the backend's Server-Sent Events stream and resolves with the
   * final recipe object.
   *
   * Backend contract (see backend/app/routers/recipe.py):
   *   event: token     data: {"text": "..."}      — partial generated text
   *   event: complete  data: {...recipe fields}   — final structured recipe
   *   event: error     data: {"message": "..."}   — generation failed
   */
  async function requestRecipeStream(payload, signal, onPartial) {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";
    let tokenText = "";
    let finalRecipe = null;
    let streamError = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const rawFrame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        const frame = parseSSEFrame(rawFrame);
        if (frame) {
          if (frame.event === "token" && frame.data?.text) {
            tokenText += frame.data.text;
            if (typeof onPartial === "function") {
              onPartial(tokenText);
            }
          } else if (frame.event === "complete") {
            finalRecipe = frame.data;
          } else if (frame.event === "error") {
            streamError = frame.data?.message || "Recipe generation failed.";
          }
        }

        boundary = buffer.indexOf("\n\n");
      }
    }

    if (streamError) {
      throw new Error(streamError);
    }
    if (!finalRecipe) {
      throw new Error("The stream ended before a recipe was received.");
    }

    return finalRecipe;
  }

  function parseSSEFrame(rawFrame) {
    let eventName = "message";
    let dataLine = null;

    for (const line of rawFrame.split("\n")) {
      if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLine = line.slice("data:".length).trim();
      }
    }

    if (dataLine === null) return null;

    try {
      return { event: eventName, data: JSON.parse(dataLine) };
    } catch {
      return null;
    }
  }

  /* -----------------------------------------------------------------------
   * Premium actions: Copy / Print / Download PDF / Share / Favorite
   * All operate on `currentEntry` (the recipe currently on screen).
   * ---------------------------------------------------------------------*/

  /**
   * Builds a clean plain-text representation of the current recipe, used
   * by both Copy and Share (as the shared text body).
   */
  function buildRecipeText(entry) {
    const r = entry.recipe;
    const lines = [
      r.title || "Untitled recipe",
      r.description || "",
      "",
      `Servings: ${r.servings ?? "—"}`,
      `Prep time: ${formatMinutes(r.prepTimeMinutes)}`,
      `Cook time: ${formatMinutes(r.cookTimeMinutes)}`,
      "",
      "Ingredients:",
      ...(Array.isArray(r.ingredients) ? r.ingredients.map((i) => `- ${i}`) : []),
      "",
      "Instructions:",
      ...(Array.isArray(r.steps) ? r.steps.map((s, i) => `${i + 1}. ${s}`) : []),
    ];
    return lines.join("\n");
  }

  /** Briefly flashes a button to confirm an action succeeded (copy/share). */
  function flashConfirmation(button, label) {
    const labelEl = button.querySelector("span:last-child");
    const originalLabel = labelEl.textContent;
    button.classList.add("is-confirmed");
    labelEl.textContent = label;

    setTimeout(() => {
      button.classList.remove("is-confirmed");
      labelEl.textContent = originalLabel;
    }, 1800);
  }

  async function handleCopy() {
    if (!currentEntry) return;
    try {
      await navigator.clipboard.writeText(buildRecipeText(currentEntry));
      flashConfirmation(copyButton, "Copied!");
    } catch {
      showSuccess("Couldn't copy automatically — please select and copy the text manually.");
    }
  }

  function handlePrint() {
    // The @media print rules in style.css hide everything except the
    // recipe card, so this just needs to trigger the browser dialog.
    window.print();
  }

  function handleDownloadPdf() {
    if (!currentEntry) return;

    if (!window.jspdf) {
      showError("PDF export is still loading — please try again in a moment.");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const marginX = 48;
    const pageWidth = doc.internal.pageSize.getWidth() - marginX * 2;
    let y = 60;

    const r = currentEntry.recipe;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    y = writeWrapped(doc, r.title || "Untitled recipe", marginX, y, pageWidth, 22);

    if (r.description) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      y = writeWrapped(doc, r.description, marginX, y + 8, pageWidth, 15);
    }

    doc.setFontSize(11);
    y = writeWrapped(
      doc,
      `Servings: ${r.servings ?? "—"}   Prep: ${formatMinutes(r.prepTimeMinutes)}   Cook: ${formatMinutes(r.cookTimeMinutes)}`,
      marginX,
      y + 14,
      pageWidth,
      15
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    y = writeWrapped(doc, "Ingredients", marginX, y + 20, pageWidth, 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    (r.ingredients || []).forEach((ingredient) => {
      y = writeWrapped(doc, `•  ${ingredient}`, marginX, y + 4, pageWidth, 14);
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    y = writeWrapped(doc, "Instructions", marginX, y + 20, pageWidth, 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    (r.steps || []).forEach((step, index) => {
      y = writeWrapped(doc, `${index + 1}.  ${step}`, marginX, y + 4, pageWidth, 14);
    });

    const safeName = (r.title || "recipe").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
    doc.save(`${safeName || "recipe"}.pdf`);
  }

  /**
   * Writes text wrapped to pageWidth starting at (x, y), adding new
   * pages as needed. Returns the y position after the written block.
   */
  function writeWrapped(doc, text, x, y, pageWidth, lineHeight) {
    const pageHeight = doc.internal.pageSize.getHeight();
    const lines = doc.splitTextToSize(text, pageWidth);

    lines.forEach((line) => {
      if (y > pageHeight - 60) {
        doc.addPage();
        y = 60;
      }
      doc.text(line, x, y);
      y += lineHeight;
    });

    return y - lineHeight;
  }

  async function handleShare() {
    if (!currentEntry) return;
    const text = buildRecipeText(currentEntry);
    const title = currentEntry.recipe.title || "RecipeGenie AI recipe";

    if (navigator.share) {
      try {
        await navigator.share({ title, text });
        return;
      } catch {
        // User cancelled the share sheet or it failed silently — fall
        // through to the clipboard fallback below.
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      flashConfirmation(shareButton, "Copied!");
    } catch {
      showSuccess("Sharing isn't available on this browser — copy the recipe manually instead.");
    }
  }

  function handleToggleFavorite() {
    if (!Shared || !currentEntry || !currentEntry.id) return;
    Shared.toggleFavorite(currentEntry.id);
    updateFavoriteButton();
  }

  /* -----------------------------------------------------------------------
   * Orchestration
   * ---------------------------------------------------------------------*/

  async function generateRecipe(payload) {
    clearError();
    setLoading(true);

    if (activeAbortController) {
      activeAbortController.abort();
    }
    activeAbortController = new AbortController();

    try {
      const recipe = await requestRecipeStream(
        payload,
        activeAbortController.signal,
        handleStreamingPartialUpdate
      );

      currentEntry = Shared ? Shared.addToHistory(recipe, payload) : { id: null, recipe, request: payload };

      renderRecipe(recipe, payload);
      showSuccess("Your recipe is ready!");
    } catch (err) {
      if (err.name === "AbortError") return;
      showError(classifyError(err));
    } finally {
      setLoading(false);
      activeAbortController = null;
    }
  }

  /* -----------------------------------------------------------------------
   * Event wiring
   * ---------------------------------------------------------------------*/

  regenerateButton.addEventListener("click", () => {
    if (!lastRequestPayload) return;
    generateRecipe(lastRequestPayload);
  });

  retryButton.addEventListener("click", () => {
    if (!lastRequestPayload) return;
    generateRecipe(lastRequestPayload);
  });

  copyButton.addEventListener("click", handleCopy);
  printButton.addEventListener("click", handlePrint);
  downloadPdfButton.addEventListener("click", handleDownloadPdf);
  shareButton.addEventListener("click", handleShare);
  favoriteButton.addEventListener("click", handleToggleFavorite);

  /* -----------------------------------------------------------------------
   * Page load: pick up the handoff from index.html, or a history item
   * ---------------------------------------------------------------------*/

  function init() {
    // Priority 1: the user clicked "View" on a past recipe in
    // history.html — render it directly, no backend call needed.
    const rawHistoryItem = sessionStorage.getItem(VIEW_HISTORY_ITEM_KEY);
    if (rawHistoryItem) {
      sessionStorage.removeItem(VIEW_HISTORY_ITEM_KEY);
      try {
        const entry = JSON.parse(rawHistoryItem);
        currentEntry = entry;
        lastRequestPayload = entry.request || null;
        renderRecipe(entry.recipe, entry.request);
        return;
      } catch {
        showError("We couldn't load that recipe from your history. Please try again.");
        return;
      }
    }

    // Priority 2: a fresh request handed off from index.html's form.
    const rawPayload = sessionStorage.getItem(PENDING_REQUEST_KEY);

    if (!rawPayload) {
      // Direct navigation / refresh with nothing pending — empty state
      // is already visible by default in the HTML, nothing else to do.
      return;
    }

    // Consume it immediately so a later refresh on this page shows the
    // empty state instead of silently re-triggering generation.
    sessionStorage.removeItem(PENDING_REQUEST_KEY);

    try {
      const payload = JSON.parse(rawPayload);
      if (!Array.isArray(payload.ingredients) || payload.ingredients.length === 0) {
        throw new Error("Invalid request payload.");
      }
      lastRequestPayload = payload;
      generateRecipe(payload);
    } catch {
      showError("We couldn't read your request. Please head back and try again.");
    }
  }

  init();
})();
