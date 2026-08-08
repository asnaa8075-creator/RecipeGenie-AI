# syntax=docker/dockerfile:1
# ── Stage 1: builder ─────────────────────────────────────────────────────
# Installs Python dependencies into an isolated user directory. Kept
# separate from the runtime stage so build-only tools (gcc, headers)
# never end up in the final image.
FROM python:3.12-slim AS builder

# Prevents Python from writing .pyc files and buffering stdout/stderr —
# both irrelevant in a build stage, but set early for consistency with
# the runtime stage below.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# gcc is needed to compile a few Python packages with native extensions
# (transitive dependencies of some libraries). Removed in this same
# layer's package cache to keep the builder stage itself lean, though
# none of this survives into the final image regardless.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

# Copied before the rest of the source so Docker's layer cache can skip
# reinstalling dependencies when only application code changes.
COPY requirements.txt .

# --user installs packages into /root/.local instead of system site-
# packages, so the whole directory can be copied wholesale into the
# runtime stage below. --no-cache-dir keeps pip's download cache out of
# this layer entirely.
RUN pip install --no-cache-dir --user -r requirements.txt


# ── Stage 2: runtime ─────────────────────────────────────────────────────
# The image that actually ships and runs. Starts fresh from the same
# slim base — none of the builder stage's apt packages or pip cache
# carry over unless explicitly copied.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Creates a dedicated, unprivileged system user/group. Running the
# container as root is a common and avoidable security risk — if the
# app is ever compromised, a non-root process limits what an attacker
# can do to the host or container filesystem.
RUN addgroup --system app && adduser --system --ingroup app app

# Explicitly set HOME for the app user. Without this, Python's user-site
# package resolution (which is what makes packages installed via
# `pip install --user` in the builder stage findable) can fail to locate
# /home/app/.local, even though the PATH env var below still finds the
# executable scripts — resulting in a "No module named X" error at
# runtime despite the package clearly being present on disk.
ENV HOME=/home/app

# Copies the installed packages from the builder stage, owned by the
# new non-root user so it can actually read/execute them.
COPY --from=builder --chown=app:app /root/.local /home/app/.local

# Application code only — .dockerignore keeps out .env, __pycache__,
# venv/, tests, and anything else that shouldn't ship in the image.
COPY --chown=app:app ./app ./app

# Makes the user-installed packages' executables (uvicorn, etc.)
# resolvable on PATH, since they live outside the system Python's
# normal install location.
ENV PATH=/home/app/.local/bin:$PATH

# Switches the active user for all subsequent instructions and for the
# container's runtime process — must come after the COPY instructions
# above, which still need root to set ownership during the build.
USER app

# Documents which port the app listens on. Purely informational — it
# does not actually publish the port; that still requires -p/--publish
# (or a load balancer target group) at `docker run` / deployment time.
EXPOSE 8000

# Lets the container orchestrator (Docker, ECS, Kubernetes) detect a
# hung or crashed app process even if it hasn't exited, by polling the
# existing /health endpoint from inside the container itself.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Starts the ASGI server directly (no shell), binding to all interfaces
# so the container's published port actually reaches it. GOOGLE_API_KEY
# and other secrets are supplied at run time via `docker run -e` /
# `--env-file` / the orchestrator's secret manager — never baked in here.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
