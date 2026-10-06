# Toolchain image for the @docker explorer specs: GNU RISC-V binutils/gcc plus riscv-tests sources.
# Build context is this directory. Run the specs with `npm run test:docker`.
FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       binutils-riscv64-unknown-elf gcc-riscv64-unknown-elf git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# riscv-tests (BSD-3-Clause). The commit used is recorded in /riscv-tests.commit.
ARG RISCV_TESTS_REF=master
RUN git clone https://github.com/riscv-software-src/riscv-tests /riscv-tests \
  && git -C /riscv-tests checkout "$RISCV_TESTS_REF" \
  && git -C /riscv-tests rev-parse HEAD > /riscv-tests.commit

# Our minimal test environment: no privileged setup, pass or fail through the exit ecall.
COPY riscv_test.h link.ld build-riscv-tests.sh /sierrendipity/
