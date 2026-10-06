@docker
Feature: Differential tests against the GNU RISC-V toolchain
  The assembler and decoder are compared with GNU binutils in a debian:bookworm-slim container
  (packages binutils-riscv64-unknown-elf and gcc-riscv64-unknown-elf, 2.40 / 12.2). These specs need
  Docker and are excluded from `npm test`; run them with `npm run test:docker`.

  Background:
    Given the GNU RISC-V toolchain container image

  Scenario: Every mnemonic assembles to the same words with GNU as and with the explorer
    When I assemble the generated corpus with GNU as -march=rv32im -mabi=ilp32 and with the explorer
    Then the corpus exercises every RV32IM mnemonic
    And both assemblers produce identical words

  Scenario: The decoder prints the same instructions as objdump without aliases
    When I disassemble the corpus words with objdump -M no-aliases and with the explorer
    Then both disassemblies agree after normalisation
