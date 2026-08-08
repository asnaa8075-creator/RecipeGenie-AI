/**
 * history.js
 * RecipeGenie AI — client-side logic for the recipe history page.
 *
 * Reads history/favorites from localStorage via app-shared.js (no
 * backend involved). "View" on an item hands the stored recipe off to
 * recipe.html via sessionStorage, which renders it directly without a
 * new backend call.
 */

(() => {
  "use strict";

  if (window.RecipeGenieShared) {
    window.RecipeGenieShared.initTheme();
    window.RecipeGenieShared.initMobileNav();
  }
  const Shared = window.RecipeGenieShared;

  const VIEW_HISTORY_ITEM_KEY = "recipegenie:viewHistoryItem";

  const historyList = document.getElementById("history-list");
  const historyEmpty = document.getElementById("history-empty");
  const historyEmptyText = document.getElementById("history-empty-text");
  const filterAllButton = document.getElementById("filter-all");
  const filterFavoritesButton = document.getElementById("filter-favorites");

  let activeFilter = "all"; // "all" | "favorites"

  function formatDate(isoString) {
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }

  function buildTags(request) {
    const tags = [];
    if (request?.cuisine) tags.push(request.cuisine);
    if (request?.diet) tags.push(request.diet);
    if (request?.time) tags.push(`${request.time} min`);
    return tags;
  }

  function render() {
    if (!Shared) return;

    const entries = activeFilter === "favorites" ? Shared.getFavoriteHistory() : Shared.getHistory();

    if (entries.length === 0) {
      historyList.hidden = true;
      historyEmpty.hidden = false;
      historyEmptyText.textContent =
        activeFilter === "favorites"
          ? "You haven't favorited any recipes yet."
          : "You haven't generated any recipes yet.";
      return;
    }

    historyEmpty.hidden = true;
    historyList.hidden = false;
    historyList.innerHTML = "";

    const fragment = document.createDocumentFragment();

    entries.forEach((entry) => {
      const li = document.createElement("li");
      li.className = "history-item";

      const isFav = Shared.isFavorite(entry.id);
      const tags = buildTags(entry.request);

      li.innerHTML = `
        <div class="history-item-header">
          <h2 class="history-item-title"></h2>
          <button type="button" class="history-item-favorite" aria-pressed="${isFav}" aria-label="Toggle favorite">
            <span aria-hidden="true">${isFav ? "★" : "☆"}</span>
          </button>
        </div>
        <p class="history-item-date"></p>
        <div class="history-item-tags"></div>
        <div class="history-item-actions">
          <button type="button" class="btn-glass-outline history-item-view">View</button>
          <button type="button" class="history-item-remove">Remove</button>
        </div>
      `;

      // Text content set via textContent (not innerHTML above) to avoid
      // any injection risk from recipe titles/tags.
      li.querySelector(".history-item-title").textContent = entry.recipe?.title || "Untitled recipe";
      li.querySelector(".history-item-date").textContent = formatDate(entry.generatedAt);

      const tagsEl = li.querySelector(".history-item-tags");
      tags.forEach((tag) => {
        const span = document.createElement("span");
        span.className = "history-item-tag";
        span.textContent = tag;
        tagsEl.appendChild(span);
      });

      li.querySelector(".history-item-favorite").addEventListener("click", () => {
        Shared.toggleFavorite(entry.id);
        render();
      });

      li.querySelector(".history-item-view").addEventListener("click", () => {
        sessionStorage.setItem(VIEW_HISTORY_ITEM_KEY, JSON.stringify(entry));
        window.location.href = "recipe.html";
      });

      li.querySelector(".history-item-remove").addEventListener("click", () => {
        Shared.removeFromHistory(entry.id);
        render();
      });

      fragment.appendChild(li);
    });

    historyList.appendChild(fragment);
  }

  function setFilter(filter) {
    activeFilter = filter;
    filterAllButton.setAttribute("aria-pressed", String(filter === "all"));
    filterFavoritesButton.setAttribute("aria-pressed", String(filter === "favorites"));
    render();
  }

  filterAllButton.addEventListener("click", () => setFilter("all"));
  filterFavoritesButton.addEventListener("click", () => setFilter("favorites"));

  render();
})();
