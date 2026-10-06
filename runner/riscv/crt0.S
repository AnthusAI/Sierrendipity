# Entry point for programs compiled by POST /explain: set up the stack, zero .bss, run main, exit.
        .section .text.start,"ax",@progbits
        .globl  _start
        .type   _start,@function
_start:
        la      sp, __stack_top
        la      t0, __bss_start
        la      t1, __bss_end
1:      bgeu    t0, t1, 2f
        sw      zero, 0(t0)
        addi    t0, t0, 4
        j       1b
2:      li      a0, 0                   # argc/argv are not supported
        li      a1, 0
        call    main
        li      a7, 93                  # exit(a0): main's return value
        ecall
3:      j       3b
        .size   _start, . - _start
