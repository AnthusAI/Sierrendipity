Feature: Explain a C program as RISC-V machine code
  POST /explain compiles a student's C project for bare-metal RV32IM and returns a flat program image
  for the browser emulator plus the instruction list, with the mapping from source lines to instructions.

  @linux-only
  Scenario: A hello world compiles to a program, instructions and a line map
    Given a C project
    And the file "main.c" containing:
      """
      #include <stdio.h>

      int main(void) {
        puts("hello");
        return 0;
      }
      """
    When the project is explained
    Then the status is "ok"
    And the program has load address 0, entry 0, stack top 1048576 and memory size 1048576
    And the program image starts with the word 0x00100117
    And the line map has entries for "main.c" lines "3,4,5,6"
    And the line map has no entries for "main.c" line 2
    And the instructions of function "main" have origin "user"
    And the instructions of function "puts" have origin "runtime"
    And the instruction words at the first and the last instruction of "main" match objdump
    And the compile output has no temporary paths

  @linux-only
  Scenario: A multi-file project maps lines to the right files
    Given a C project
    And the file "util.h" containing:
      """
      int twice(int x);
      """
    And the file "util.c" containing:
      """
      #include "util.h"

      int twice(int x) {
        return x * 2;
      }
      """
    And the file "main.c" containing:
      """
      #include "util.h"

      int main(void) {
        return twice(21);
      }
      """
    When the project is explained
    Then the status is "ok"
    And the line map has entries for "util.c" lines "3,4,5"
    And the line map has entries for "main.c" lines "3,4,5"
    And the instructions of function "twice" come from the file "util.c"
    And the instructions of function "main" come from the file "main.c"
    And no instruction names a temporary path

  @linux-only
  Scenario: A for loop maps to several separate instruction groups with different columns
    Given a C project
    And the file "main.c" containing:
      """
      int main(void) {
        int total = 0;
        for (int i = 0; i < 10; i++) {
          total += i;
        }
        return total;
      }
      """
    When the project is explained
    Then the status is "ok"
    And the line "main.c:3" maps to more than one group of consecutive instructions
    And the instructions of the line "main.c:3" do not all have the same column

  @linux-only
  Scenario: The optimization level changes the generated code
    Given a C project
    And the file "main.c" containing:
      """
      int main(void) {
        int total = 0;
        for (int i = 0; i < 10; i++) {
          total += i;
        }
        return total;
      }
      """
    And the optimization level "Og"
    When the project is explained
    Then the status is "ok"
    And the instruction count differs from an "O0" build of the same project

  @linux-only
  Scenario: A syntax error is reported with its file and line and no program
    Given a C project
    And the file "main.c" containing:
      """
      int main(void) {
        return 0
      }
      """
    When the project is explained
    Then the status is "compile_error"
    And the compile output mentions "main.c:3"
    And the compile output has no temporary paths
    And there is no program and no instruction list

  @linux-only
  Scenario: An undefined function is a link error
    Given a C project
    And the file "main.c" containing:
      """
      int missing(void);
      int main(void) { return missing(); }
      """
    When the project is explained
    Then the status is "link_error"
    And the compile output mentions "undefined reference to `missing'"
    And the compile output has no temporary paths
    And there is no program and no instruction list

  @linux-only
  Scenario: Too many instructions is an output limit
    Given a C project
    And a main.c with 8000 statements
    When the project is explained
    Then the status is "output_limit_exceeded"
    And there is no program and no instruction list

  Scenario Outline: Files other than C sources and headers are refused
    Given a C project
    And the file "main.c" containing:
      """
      int main(void) { return 0; }
      """
    And the file "<path>" containing:
      """
      nop
      """
    When the project is explained
    Then the request is rejected

    Examples:
      | path        |
      | boot.S      |
      | boot.s      |
      | link.ld     |
      | notes.txt   |
      | util.cpp    |
      | UTIL.C      |
      | Makefile    |
      | sub/boot.S  |
      | ../evil.c   |

  Scenario Outline: A bad optimization level is refused
    Given a C project
    And the file "main.c" containing:
      """
      int main(void) { return 0; }
      """
    And the optimization level "<level>"
    When the project is explained
    Then the request is rejected

    Examples:
      | level |
      | O1    |
      | O2    |
      | -O0   |
      | o0    |
      | fast  |
      |       |

  Scenario: A numeric optimization level is refused
    Given a C project
    And the file "main.c" containing:
      """
      int main(void) { return 0; }
      """
    And the request field "optLevel" set to the number 0
    When the project is explained
    Then the request is rejected

  Scenario Outline: Only C is explained
    Given a <language> project
    And the file "main.c" containing:
      """
      int main(void) { return 0; }
      """
    When the project is explained
    Then the request is rejected

    Examples:
      | language |
      | C++      |
      | Python   |

  Scenario: A project without any C source is refused
    Given a C project
    And the file "util.h" containing:
      """
      int x;
      """
    When the project is explained
    Then the request is rejected

  Scenario: An oversized request is refused
    Given a C project
    And a file "main.c" of 6000000 bytes
    When the project is explained
    Then the request is rejected with status 413

  @linux-only
  Scenario: An endless #include is stopped
    Given a C project
    And the file "main.c" containing:
      """
      int x[] = {
      #include "/dev/zero"
      };
      int main(void) { return 0; }
      """
    When the project is explained
    Then the status is one of "time_limit_exceeded, output_limit_exceeded"
    And there is no program and no instruction list
    And the runner still answers health checks

  @linux-only
  Scenario: Reading standard input at compile time is stopped
    Given a C project
    And the file "main.c" containing:
      """
      const char x[] =
      #include "/dev/stdin"
      ;
      int main(void) { return 0; }
      """
    When the project is explained
    Then the status is one of "time_limit_exceeded, output_limit_exceeded, compile_error"
    And the runner still answers health checks

  @linux-only
  Scenario Outline: An endless .incbin is stopped
    Given a C project
    And the file "main.c" containing:
      """
      __asm__(".incbin \"<device>\"");
      int main(void) { return 0; }
      """
    When the project is explained
    Then the status is one of "time_limit_exceeded, output_limit_exceeded"
    And there is no program and no instruction list
    And the runner still answers health checks

    Examples:
      | device       |
      | /dev/zero    |
      | /dev/urandom |

  @linux-only
  Scenario: The compiler runs as an unprivileged user and cannot read the runner's files
    Given the runner has secrets in its environment
    And a C project
    And the file "main.c" containing:
      """
      const char env[] =
      #include "/proc/1/environ"
      ;
      int main(void) { return 0; }
      """
    When the project is explained
    Then the status is "compile_error"
    And the compile output mentions "Permission denied"

  @linux-only
  Scenario: A hello world program runs
    Given a C project
    And the file "main.c" containing:
      """
      #include <stdio.h>
      int main(void) {
        puts("hello");
        printf("%d %5d|%-4d|%04x %s %c %u %%\n", -42, 7, 7, 255, "str", 'z', 4000000000u);
        return 0;
      }
      """
    When the project is built and run in an emulator
    Then the emulated exit code is 0
    And the emulated output is "hello\n-42     7|7   |00ff str z 4000000000 %\n"

  @linux-only
  Scenario: A program reads an integer with scanf and prints with printf
    Given a C project
    And the file "main.c" containing:
      """
      #include <stdio.h>
      int main(void) {
        int n;
        char word[16];
        char c;
        scanf("%d %s %c", &n, word, &c);
        printf("%d %s %c\n", n * 2, word, c);
        return 0;
      }
      """
    And the stdin "21 abc x\n"
    When the project is built and run in an emulator
    Then the emulated output is "42 abc x\n"

  @linux-only
  Scenario: The exit code of main is propagated
    Given a C project
    And the file "main.c" containing:
      """
      int main(void) { return 7; }
      """
    When the project is built and run in an emulator
    Then the emulated exit code is 7

  @linux-only
  Scenario: The runtime library works across string, memory and 64-bit arithmetic
    Given a C project
    And the file "main.c" containing:
      """
      #include <stdio.h>
      #include <stdlib.h>
      #include <string.h>
      int main(void) {
        char *buf = malloc(16);
        strcpy(buf, "abc");
        char *more = malloc(16);
        memset(more, 'x', 3);
        more[3] = 0;
        long long big = 5000000000LL;
        printf("%d %d %d %d %d %s %s %d\n", (int)strlen(buf), strcmp(buf, "abd") < 0,
               memcmp(buf, buf, 3), abs(-9), atoi(" -12"), more, buf, (int)(big / 1000000LL));
        exit(3);
      }
      """
    When the project is built and run in an emulator
    Then the emulated output is "3 1 0 9 -12 xxx abc 5000\n"
    And the emulated exit code is 3
