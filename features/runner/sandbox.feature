@linux-only
Feature: Contain student code
  Student programs cannot reach the network or cloud credentials and cannot take the runner down.

  Scenario: Python cannot open a network connection
    Given a Python project
    And the file "main.py" containing:
      """
      import socket
      try:
          socket.create_connection(("93.184.216.34", 80), timeout=3)
          print("connected")
      except PermissionError:
          print("PermissionError")
      """
    When the project is run
    Then the status is "ok"
    And the program output is "PermissionError\n"

  Scenario: C cannot open a network connection
    Given a C project
    And the file "main.c" containing:
      """
      #include <arpa/inet.h>
      #include <errno.h>
      #include <stdio.h>
      #include <string.h>
      #include <sys/socket.h>
      int main() {
        int fd = socket(AF_INET, SOCK_STREAM, 0);
        struct sockaddr_in addr = { .sin_family = AF_INET, .sin_port = htons(80) };
        inet_pton(AF_INET, "93.184.216.34", &addr.sin_addr);
        int r = fd < 0 ? -1 : connect(fd, (struct sockaddr *)&addr, sizeof addr);
        printf("%d %s\n", r, strerror(errno));
      }
      """
    When the project is run
    Then the status is "ok"
    And the program output is "-1 Operation not permitted\n"

  Scenario: Local sockets are denied too
    Given a Python project
    And the file "main.py" containing:
      """
      import socket
      try:
          socket.socketpair()
          print("allowed")
      except PermissionError:
          print("PermissionError")
      """
    When the project is run
    Then the program output is "PermissionError\n"

  Scenario: Cloud credentials and the runner secret are not passed to student code
    Given the runner has secrets in its environment
    And a Python project
    And the file "main.py" containing:
      """
      import os
      print(",".join(sorted(os.environ)))
      """
    When the project is run
    Then the status is "ok"
    And the program output is "HOME,LANG,PATH,PYTHONUNBUFFERED\n"

  Scenario: A fork bomb is stopped and the runner survives
    Given a C project
    And the file "main.c" containing:
      """
      #include <unistd.h>
      int main() { for (;;) fork(); }
      """
    And a time limit of 3000 ms
    When the project is run
    Then the status is one of "runtime_error, time_limit_exceeded"
    And the runner still answers health checks

  Scenario: A huge file write is stopped by the file size limit
    Given a C project
    And the file "main.c" containing:
      """
      #include <stdio.h>
      int main() {
        static char block[1 << 20];
        FILE *f = fopen("big.dat", "w");
        for (int i = 0; i < 512; i++) fwrite(block, 1, sizeof block, f);
        fclose(f);
        puts("finished");
      }
      """
    When the project is run
    Then the status is "runtime_error"
    And the program was killed by signal "SIGXFSZ"

  Scenario: A compiler that needs too much memory is stopped
    Given a C project
    And the file "main.c" containing:
      """
      #define A(x) x x x x x x x x x x
      #define B(x) A(A(x))
      #define C(x) B(B(x))
      #define D(x) C(C(x))
      int main() { D(0;) }
      """
    When the project is run
    Then the status is "compile_error"
    And the compiler did not time out
