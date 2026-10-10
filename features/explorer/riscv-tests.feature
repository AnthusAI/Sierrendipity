@docker
Feature: The official riscv-tests pass in the emulator
  rv32ui and rv32um from riscv-software-src/riscv-tests (BSD-3-Clause) are built with a minimal
  custom environment (features/explorer/docker/riscv_test.h) and run in the Machine. A test passes
  when it calls exit(0) with a7 = 93. Skipped: fence_i (Zifencei, self-modifying code) and ma_data
  (needs a trap handler for misaligned accesses). These specs need Docker; run them with
  `npm run test:docker`.

  Background:
    Given the riscv-tests rv32ui and rv32um binaries built in the toolchain container

  Scenario Outline: A riscv-tests program exits with code 0
    Then the riscv-tests program <test> exits with code 0

    Examples: rv32ui
      | test          |
      | rv32ui/add    |
      | rv32ui/addi   |
      | rv32ui/and    |
      | rv32ui/andi   |
      | rv32ui/auipc  |
      | rv32ui/beq    |
      | rv32ui/bge    |
      | rv32ui/bgeu   |
      | rv32ui/blt    |
      | rv32ui/bltu   |
      | rv32ui/bne    |
      | rv32ui/jal    |
      | rv32ui/jalr   |
      | rv32ui/lb     |
      | rv32ui/lbu    |
      | rv32ui/ld_st  |
      | rv32ui/lh     |
      | rv32ui/lhu    |
      | rv32ui/lui    |
      | rv32ui/lw     |
      | rv32ui/or     |
      | rv32ui/ori    |
      | rv32ui/sb     |
      | rv32ui/sh     |
      | rv32ui/simple |
      | rv32ui/sll    |
      | rv32ui/slli   |
      | rv32ui/slt    |
      | rv32ui/slti   |
      | rv32ui/sltiu  |
      | rv32ui/sltu   |
      | rv32ui/sra    |
      | rv32ui/srai   |
      | rv32ui/srl    |
      | rv32ui/srli   |
      | rv32ui/st_ld  |
      | rv32ui/sub    |
      | rv32ui/sw     |
      | rv32ui/xor    |
      | rv32ui/xori   |

    Examples: rv32um
      | test           |
      | rv32um/div     |
      | rv32um/divu    |
      | rv32um/mul     |
      | rv32um/mulh    |
      | rv32um/mulhsu  |
      | rv32um/mulhu   |
      | rv32um/rem     |
      | rv32um/remu    |
