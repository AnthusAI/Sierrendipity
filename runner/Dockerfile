# Build from the repo root: docker build -f runner/Dockerfile .
#   (default target)        `test`: the runtime plus the Cucumber specs, so `npm run test:linux` works
#   --target runtime        the lean production image without the specs
# The base image is multi-arch; production runs it on Linux ARM64 (Fargate Graviton).

FROM node:22-bookworm-slim AS launcher
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libc6-dev libseccomp-dev \
    && rm -rf /var/lib/apt/lists/*
COPY runner/launcher/sandbox-exec.c /src/sandbox-exec.c
RUN gcc -O2 -Wall -Werror -o /sandbox-exec /src/sandbox-exec.c -lseccomp

FROM node:22-bookworm-slim AS runtime
# gcc/g++/python3 are the student toolchain; libseccomp2 and the launcher confine student programs.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc g++ python3 libc6-dev libseccomp2 tini \
    && rm -rf /var/lib/apt/lists/*
COPY --from=launcher /sandbox-exec /usr/local/bin/sandbox-exec

WORKDIR /app
# Manifests first so the dependency layer is cached across source changes.
COPY package.json package-lock.json ./
COPY runner/package.json ./runner/
RUN npm ci --workspace runner --include-workspace-root --ignore-scripts

COPY tsconfig.base.json ./
COPY runner ./runner

RUN useradd --create-home student
USER student
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--import", "tsx", "runner/src/main.ts"]

FROM runtime AS test
# Cucumber specs ride along so `npm run test:linux` can run in the image.
COPY --chown=student cucumber.cjs commitlint.config.cjs ./
COPY --chown=student features ./features
