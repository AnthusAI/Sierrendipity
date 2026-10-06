# Build from the repo root: docker build -f runner/Dockerfile .
FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc g++ python3 libc6-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY runner ./runner
# Cucumber specs need the workspace sources too, so test:linux can run in the image.
COPY features ./features
COPY cucumber.cjs commitlint.config.cjs ./
RUN npm ci --workspace runner --include-workspace-root --ignore-scripts

RUN useradd --create-home student
USER student
ENV PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "runner/src/main.ts"]
