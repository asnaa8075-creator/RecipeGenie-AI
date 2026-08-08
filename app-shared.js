/**
 * app-shared.js
 * RecipeGenie AI — shared client-side utilities loaded on every page
 * (index.html, recipe.html, history.html).
 *
 * Responsibilities:
 *   - Theme (dark/light) persistence and toggling
 *   - Mobile nav (hamburger) toggling
 *   - Recipe history + favorites, backed by localStorage
 *
 * No backend involvement — these are purely client-side conveniences,
 * per "do not change backend". History/favorites live only in the
 * current browser and are capped in size to avoid unbounded storage growth.
 *
 * Exposed as a single global, RecipeGenieShared, to keep each page's
 * own script (script.js / recipe.js / history.js) free of duplicated
 * storage logic.
 */

window.RecipeGenieShared = (() => {
  "use strict";

  const THEME_KEY = "recipegenie:theme";
  const HISTORY_KEY = "recipegenie:history";
  const FAVORITES_KEY = "recipegenie:favorites";
  const MAX_HISTORY_ENTRIES = 20;

  /* -----------------------------------------------------------------------
   * Theme
   * ---------------------------------------------------------------------*/

  function getStoredTheme() {
    return localStorage.getItem(THEME_KEY) || "dark";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const toggleButtons = document.querySelectorAll(".theme-toggle");
    toggleButtons.forEach((btn) => {
      btn.setAttribute("aria-pressed", String(theme === "light"));
      const icon = btn.querySelector(".theme-toggle-icon");
      if (icon) icon.textContent = theme === "light" ? "☀️" : "🌙";
    });
  }

  function initTheme() {
    applyTheme(getStoredTheme());

    document.querySelectorAll(".theme-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = getStoredTheme() === "light" ? "dark" : "light";
        localStorage.setItem(THEME_KEY, next);
        applyTheme(next);
      });
    });
  }

  /* -----------------------------------------------------------------------
   * Mobile nav (hamburger)
   * ---------------------------------------------------------------------*/

  function initMobileNav() {
    const toggle = document.querySelector(".nav-toggle-button");
    const nav = document.querySelector("header nav");
    if (!toggle || !nav) return;

    toggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });

    // Close the mobile menu after a nav link is followed.
    nav.querySelectorAll(".nav-links a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("nav-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* -----------------------------------------------------------------------
   * History
   * ---------------------------------------------------------------------*/

  function getHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function generateId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `recipe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Saves a generated recipe + the request that produced it. Returns the
   * full stored entry (including its new id) so the caller can use it
   * immediately (e.g. to wire up the favorite toggle).
   */
  function addToHistory(recipe, request) {
    const entry = {
      id: generateId(),
      generatedAt: new Date().toISOString(),
      recipe,
      request,
    };

    const history = getHistory();
    history.unshift(entry);

    if (history.length > MAX_HISTORY_ENTRIES) {
      history.length = MAX_HISTORY_ENTRIES;
    }

    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    return entry;
  }

  function removeFromHistory(id) {
    const history = getHistory().filter((entry) => entry.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  /* -----------------------------------------------------------------------
   * Favorites (stores just the set of favorited history entry ids)
   * ---------------------------------------------------------------------*/

  function getFavoriteIds() {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function isFavorite(id) {
    return getFavoriteIds().includes(id);
  }

  function toggleFavorite(id) {
    const favorites = getFavoriteIds();
    const index = favorites.indexOf(id);

    if (index === -1) {
      favorites.push(id);
    } else {
      favorites.splice(index, 1);
    }

    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    return favorites.includes(id);
  }

  function getFavoriteHistory() {
    const favoriteIds = new Set(getFavoriteIds());
    return getHistory().filter((entry) => favoriteIds.has(entry.id));
  }

  return {
    initTheme,
    initMobileNav,
    getHistory,
    addToHistory,
    removeFromHistory,
    isFavorite,
    toggleFavorite,
    getFavoriteHistory,
  };
})();
