// Minimal riscv-tests environment for the explorer's Machine (user mode only, no CSRs or traps).
// A test passes by calling exit(0) (a7 = 93), the same convention as the proxy kernel env: TESTNUM
// (gp) is 1 on success, and a failure exits with (failing test number << 1) | 1.
#ifndef _ENV_SIERRENDIPITY_H
#define _ENV_SIERRENDIPITY_H

#define RVTEST_RV32U
#define TESTNUM gp

#define RVTEST_CODE_BEGIN .section .text.init; .align 2; .globl _start; _start:
#define RVTEST_CODE_END ebreak

#define RVTEST_PASS li TESTNUM, 1; li a7, 93; li a0, 0; ecall
#define RVTEST_FAIL \
  1: beqz TESTNUM, 1b; sll TESTNUM, TESTNUM, 1; or TESTNUM, TESTNUM, 1; \
  li a7, 93; addi a0, TESTNUM, 0; ecall

#define EXTRA_DATA
#define RVTEST_DATA_BEGIN EXTRA_DATA .align 4; .global begin_signature; begin_signature:
#define RVTEST_DATA_END .align 4; .global end_signature; end_signature:

#endif
