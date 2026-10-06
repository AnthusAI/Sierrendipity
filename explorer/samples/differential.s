    .text
start:
    addi x1, x0, 5
    addi x2, x1, -2048
    add  x3, x1, x2
    sub  x4, x3, x1
    sll  x5, x1, x2
    slt  x6, x1, x2
    sltu x7, x1, x2
    xor  x8, x1, x2
    srl  x9, x1, x2
    sra  x10, x1, x2
    or   x11, x1, x2
    and  x12, x1, x2
    slti x13, x1, 7
    sltiu x14, x1, 7
    xori x15, x1, -1
    ori  x16, x1, 255
    andi x17, x1, 15
    slli x18, x1, 31
    srli x19, x1, 3
    srai x20, x1, 3
    lui  x21, 0x12345
    auipc x22, 0xfffff
    lb   x23, -4(x2)
    lh   x24, 2(x2)
    lw   x25, 8(x2)
    lbu  x26, 1(x2)
    lhu  x27, 6(x2)
    sb   x1, -1(x2)
    sh   x1, 2(x2)
    sw   x1, 8(x2)
    beq  x1, x2, start
    bne  x1, x2, end
    blt  x1, x2, start
    bge  x1, x2, end
    bltu x1, x2, start
    bgeu x1, x2, end
    jal  x1, end
    jalr x1, 4(x2)
    ecall
    ebreak
end:
    addi x0, x0, 0
