// Minimal riscv-tests environment for the explorer machine (replaces riscv-tests/env/p/riscv_test.h).
// Tests run from address 0 in machine mode with no CSRs: pass exits with 0, failure exits with (TESTNUM << 1) | 1.
#ifndef _ENV_EXPLORER_H
#define _ENV_EXPLORER_H

#define RVTEST_RV32U
#define RVTEST_RV64U
#define TESTNUM gp

#define RVTEST_CODE_BEGIN  .section .text.init; .globl _start; _start:
#define RVTEST_CODE_END    unimp
#define RVTEST_PASS        li a0, 0; li a7, 93; ecall
#define RVTEST_FAIL        sll a0, TESTNUM, 1; or a0, a0, 1; li a7, 93; ecall
#define EXTRA_DATA
#define RVTEST_DATA_BEGIN  .align 4; .global begin_signature; begin_signature:
#define RVTEST_DATA_END    .align 4; .global end_signature; end_signature:

#endif
