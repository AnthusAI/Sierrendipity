# Build from the repo root: docker build -f runner/Dockerfile .
FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc g++ python3 libc6-dev tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# Manifests first so the dependency layer is cached across source changes.
COPY package.json package-lock.json ./
COPY runner/package.json ./runner/
RUN npm ci --workspace runner --include-workspace-root --ignore-scripts

COPY tsconfig.base.json cucumber.cjs commitlint.config.cjs ./
COPY runner ./runner
# Cucumber specs ride along so `npm run test:linux` can run in the image.
COPY features ./features

RUN useradd --create-home student
USER student
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--import", "tsx", "runner/src/main.ts"]
