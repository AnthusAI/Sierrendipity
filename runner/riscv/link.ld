/* One flat RAM region at address 0, as the browser emulator sees memory. The runtime (crt0.o,
   libruntime.o, libgcc) and the student's code are told apart by address: the student's .text sits
   between __user_text_start and __user_text_end. */
OUTPUT_ARCH(riscv)
ENTRY(_start)

__memory_size = 0x100000;
__stack_size = 0x10000;

MEMORY
{
  RAM (rwx) : ORIGIN = 0, LENGTH = 0x100000
}

SECTIONS
{
  .text : {
    KEEP(*crt0.o(.text .text.*))
    . = ALIGN(4);
    __user_text_start = .;
    *(EXCLUDE_FILE(*crt0.o *libruntime.o *libgcc.a:*) .text EXCLUDE_FILE(*crt0.o *libruntime.o *libgcc.a:*) .text.*)
    . = ALIGN(4);
    __user_text_end = .;
    *(.text .text.*)
    . = ALIGN(4);
  } > RAM

  .rodata : { *(.rodata .rodata.* .srodata .srodata.*) . = ALIGN(4); } > RAM
  .data : { *(.data .data.* .sdata .sdata.*) . = ALIGN(4); } > RAM

  .bss (NOLOAD) : {
    __bss_start = .;
    *(.sbss .sbss.* .bss .bss.* COMMON)
    . = ALIGN(16);
    __bss_end = .;
  } > RAM

  /* The heap grows from the end of .bss up to the stack; the stack grows down from the top of RAM.
     Declaring them as a section makes the program header cover all of RAM. */
  .heap_and_stack (NOLOAD) : {
    __heap_start = .;
    . = MAX(., ORIGIN(RAM) + LENGTH(RAM) - __stack_size);
    __heap_end = .;
    . = ORIGIN(RAM) + LENGTH(RAM);
    __stack_top = .;
  } > RAM
  ASSERT(__heap_start <= ORIGIN(RAM) + LENGTH(RAM) - __stack_size, "program too large: no room left for the stack")

  /* Only the line table (and the sections it refers to) is kept from the debug information. */
  .debug_line 0 : { *(.debug_line) }
  .debug_line_str 0 : { *(.debug_line_str) }
  /DISCARD/ : { *(.comment) *(.riscv.attributes) *(.eh_frame*) *(.note*) *(.debug_*) }
}
