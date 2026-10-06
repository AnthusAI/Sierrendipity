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
# The riscv64-unknown-elf packages are the bare-metal cross toolchain for POST /explain (rv32 libgcc
# included); binutils provides objdump/readelf/ld.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc g++ python3 libc6-dev libseccomp2 tini \
       gcc-riscv64-unknown-elf binutils-riscv64-unknown-elf \
    && rm -rf /var/lib/apt/lists/*
COPY --from=launcher /sandbox-exec /usr/local/bin/sandbox-exec

WORKDIR /app
# Manifests first so the dependency layer is cached across source changes.
COPY package.json package-lock.json ./
COPY runner/package.json ./runner/
RUN npm ci --workspace runner --include-workspace-root --ignore-scripts

COPY tsconfig.base.json ./
COPY runner ./runner

# The RISC-V runtime for POST /explain: crt0 and the tiny libc, built once with the toolchain (the
# linker script and headers are read from runner/riscv at request time). Readable by the sandbox uids.
RUN mkdir -p /opt/riscv-runtime \
    && riscv64-unknown-elf-gcc -march=rv32im -mabi=ilp32 -c runner/riscv/crt0.S -o /opt/riscv-runtime/crt0.o \
    && riscv64-unknown-elf-gcc -march=rv32im -mabi=ilp32 -O1 -ffreestanding -fno-pic \
       -ffunction-sections -fdata-sections -fno-tree-loop-distribute-patterns -isystem runner/riscv/include \
       -c runner/riscv/libruntime.c -o /opt/riscv-runtime/libruntime.o

# The server stays root: it needs CAP_SETUID/CAP_SETGID/CAP_KILL to give each run its own uid, and
# CAP_CHOWN/CAP_DAC_OVERRIDE/CAP_FOWNER to prepare and delete the run's files. Student code never runs
# as root (see sandbox-exec.c).
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--import", "tsx", "runner/src/main.ts"]

FROM runtime AS test
# Cucumber specs ride along so `npm run test:linux` can run in the image.
COPY cucumber.cjs commitlint.config.cjs ./
COPY features ./features
# qemu-user runs the linked RISC-V ELF so the specs can prove a returned program really executes;
# it is test-only and absent from the runtime image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends qemu-user \
    && rm -rf /var/lib/apt/lists/*
