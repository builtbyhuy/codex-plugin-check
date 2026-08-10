FROM node:24.19.0-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03

ARG CODEX_VERSION
RUN node -e \
      'if (!/^\d+\.\d+\.\d+$/.test(process.argv[1] ?? "")) process.exit(1)' \
      "$CODEX_VERSION" \
    && npm install --global --ignore-scripts --no-audit --no-fund \
      "@openai/codex@${CODEX_VERSION}" \
    && npm cache clean --force

USER node
WORKDIR /workspace
