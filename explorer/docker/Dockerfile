# Bare-metal RISC-V toolchain for the explorer's differential and riscv-tests specs.
FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends binutils-riscv64-unknown-elf gcc-riscv64-unknown-elf git ca-certificates make \
 && rm -rf /var/lib/apt/lists/*
