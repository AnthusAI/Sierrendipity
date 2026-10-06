@docker
Feature: Explorer agrees with the GNU RISC-V toolchain
  As a maintainer
  I want the explorer's assembler, disassembler and machine checked against GNU binutils and riscv-tests
  so that the teaching instruction set is real RV32I

  # Needs Docker. Not part of `npm test` (excluded by the "not @docker" tag); run with
  #   npm run test:docker
  # which first builds the toolchain image:
  #   docker build -t sierrendipity-explorer-toolchain -f explorer/docker/Dockerfile explorer
  # Each step then runs, with the scenario's temp directory mounted at /work:
  #   riscv64-unknown-elf-as -march=rv32i -mabi=ilp32 -o p.o p.s
  #   riscv64-unknown-elf-objcopy -O binary -j .text p.o p.bin
  #   riscv64-unknown-elf-objdump -d -M no-aliases,numeric p.o

  Scenario: GNU as and the explorer assembler produce identical machine code
    Given the sample program from "explorer/samples/differential.s"
    When GNU as assembles it for rv32i
    And the explorer assembles it
    Then both produce the same machine code

  Scenario: GNU objdump and the explorer disassembler agree on every instruction
    Given the sample program from "explorer/samples/differential.s"
    When GNU as assembles it for rv32i
    Then objdump and the explorer disassembler show the same mnemonics and operands

  Scenario: The explorer machine passes the official riscv-tests rv32ui suite
    Given the riscv-tests rv32ui suite at the tag "v1.0"
    When each test is built for the explorer and run to completion
    Then every test exits with code 0
