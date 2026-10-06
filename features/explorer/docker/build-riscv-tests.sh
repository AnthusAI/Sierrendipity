#!/bin/sh
# Build rv32ui and rv32um from riscv-tests into flat binaries loaded at address 0, and print one
# line per test: "<suite>/<name> <base64 of the binary>", or "<suite>/<name> !" if it did not build.
# Skipped on purpose: fence_i (needs Zifencei and self-modifying code) and ma_data (needs a trap
# handler to emulate misaligned accesses; our Machine faults on them instead).
out=$(mktemp -d)
for suite in rv32ui rv32um; do
  for src in /riscv-tests/isa/$suite/*.S; do
    name=$(basename "$src" .S)
    case "$name" in fence_i|ma_data) continue ;; esac
    if riscv64-unknown-elf-gcc -march=rv32im -mabi=ilp32 -static -mcmodel=medany -fvisibility=hidden \
         -nostdlib -nostartfiles -I/sierrendipity -I/riscv-tests/isa/macros/scalar \
         -T/sierrendipity/link.ld "$src" -o "$out/$name.elf" 2>"$out/$name.err" \
       && riscv64-unknown-elf-objcopy -O binary "$out/$name.elf" "$out/$name.bin"; then
      echo "$suite/$name $(base64 -w0 "$out/$name.bin")"
    else
      echo "$suite/$name !"
      cat "$out/$name.err" >&2
    fi
  done
done
rm -rf "$out"
