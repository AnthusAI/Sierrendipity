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

  Scenario: Student code cannot read the runner's environment
    Given a Python project
    And the file "main.py" containing:
      """
      import os
      for pid in (os.getppid(), 1):
          try:
              open(f"/proc/{pid}/environ", "rb").read()
              print("read")
          except PermissionError:
              print("denied")
      """
    When the project is run
    Then the program output is "denied\ndenied\n"

  Scenario: Student code cannot kill the runner
    Given a Python project
    And the file "main.py" containing:
      """
      import os, signal
      try:
          os.kill(os.getppid(), signal.SIGKILL)
          print("killed the runner")
      except PermissionError:
          print("PermissionError")
      """
    When the project is run
    Then the program output is "PermissionError\n"
    And the runner still answers health checks

  Scenario: Processes that escape the process group do not hang the run or leak its slot
    Given a Python project
    And the file "main.py" containing:
      """
      import os, subprocess
      if os.fork() == 0:
          os.setsid()
          subprocess.Popen(["sleep", "600"])
          os._exit(0)
      print("parent done", flush=True)
      """
    And a time limit of 3000 ms
    When the project is run 5 times in a row
    Then every run finished with status "ok" in under 10 seconds
    And no sleep process is left running

  Scenario: Files filling the disk are stopped and removed
    Given a Python project
    And the file "main.py" containing:
      """
      import time
      for i in range(40):
          with open(f"/tmp/fill{i}.dat", "wb") as f:
              f.write(b"x" * (15 * 1024 * 1024))
          time.sleep(0.2)
      print("finished")
      """
    And a time limit of 20000 ms
    When the project is run
    Then the status is "output_limit_exceeded"
    And no files owned by sandbox users remain

  Scenario: Namespaces and mounts are refused
    Given a C project
    And the file "main.c" containing:
      """
      #define _GNU_SOURCE
      #include <errno.h>
      #include <sched.h>
      #include <signal.h>
      #include <stdio.h>
      #include <string.h>
      #include <sys/mount.h>
      #include <sys/syscall.h>
      #include <unistd.h>
      int main() {
        int r = unshare(CLONE_NEWUSER);
        printf("unshare %d %s\n", r, strerror(errno));
        r = mount("none", "/mnt", "tmpfs", 0, "");
        printf("mount %d %s\n", r, strerror(errno));
        long c = syscall(SYS_clone, CLONE_NEWUSER | SIGCHLD, 0, 0, 0, 0);
        printf("clone %ld %s\n", c, strerror(errno));
        return 0;
      }
      """
    When the project is run
    Then the program output is "unshare -1 Operation not permitted\nmount -1 Operation not permitted\nclone -1 Operation not permitted\n"

  Scenario: System V shared memory is refused
    Given a Python project
    And the file "main.py" containing:
      """
      import ctypes, os
      libc = ctypes.CDLL(None, use_errno=True)
      libc.shmget.argtypes = [ctypes.c_int, ctypes.c_size_t, ctypes.c_int]
      r = libc.shmget(0, 4096, 0o1600)  # IPC_PRIVATE | IPC_CREAT
      print(r, os.strerror(ctypes.get_errno()))
      """
    When the project is run
    Then the program output is "-1 Operation not permitted\n"

  Scenario: Leftover System V IPC objects of a finished run are removed
    Given a System V shared memory segment created by sandbox user 20001 outside the filter
    When the run's cleanup runs for sandbox user 20001
    Then the segment no longer exists
