FROM node:22-bookworm

# Install system dependencies
RUN apt-get update && apt-get install -y \
  git \
  curl \
  jq \
  && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt-get update && apt-get install -y gh \
  && rm -rf /var/lib/apt/lists/*

# Enable pnpm via corepack. This repo is a pnpm monorepo (internal deps via
# workspace:*, no package-lock.json), so the sandbox's onSandboxReady
# `pnpm install` hook needs pnpm. node:22 ships corepack but disables it by
# default; `corepack enable` installs version-agnostic shims on the shared PATH.
# corepack resolves the project's `packageManager` field at runtime and fetches
# that exact pnpm version into COREPACK_HOME — which must be writable by the
# non-root agent user (set below). Running corepack as root with a root-owned
# cache makes pnpm fail at runtime: "Failed to create cache directory".
RUN corepack enable

# Build-args for UID/GID alignment: sandcastle docker build-image
# defaults these to the host user's UID/GID so image-built files
# and bind-mounted files share an owner without runtime chown.
ARG AGENT_UID=1000
ARG AGENT_GID=1000

# Rename the base image's "node" user to "agent" and align UID/GID.
RUN groupmod -o -g $AGENT_GID node && usermod -o -u $AGENT_UID -g $AGENT_GID -d /home/agent -m -l agent node
USER ${AGENT_UID}:${AGENT_GID}

# Install Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | bash

# Add Claude to PATH
ENV PATH="/home/agent/.local/bin:$PATH"

# Graphify (installed via uv): the per-issue sandbox hook builds a tree-sitter
# code graph (graphify-out/) that the architect agent queries to find reuse
# candidates without reading the whole repo. The PyPI package is "graphifyy"
# (double y) while the maintainer reclaims the "graphify" name; the binary it
# installs is `graphify`. Pinned exactly: the project is pre-1.0 and moving
# fast. uv uses the system python3 (bookworm ships 3.11, satisfying >=3.10)
# or downloads a managed one.
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
  && uv tool install graphifyy==0.9.9

# corepack's cache must be writable by the agent user (see note above). Point it
# at the agent's home and pre-create it; disable the interactive download prompt
# so the first `pnpm` invocation fetches the pinned version non-interactively.
ENV COREPACK_HOME=/home/agent/.cache/corepack
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN mkdir -p /home/agent/.cache/corepack

WORKDIR /home/agent

# In worktree sandbox mode, Sandcastle bind-mounts the git worktree at /home/agent/workspace
# and overrides the working directory to /home/agent/workspace at container start.
# Structure your Dockerfile so that /home/agent/workspace can serve as the project root.
ENTRYPOINT ["sleep", "infinity"]
