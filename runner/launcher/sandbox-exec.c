/*
 * sandbox-exec: confine one student program, then exec it.
 *
 *   sandbox-exec [--as=BYTES] [--cpu=SECONDS] [--nproc=N] [--fsize=BYTES] -- program [args...]
 *
 * Why seccomp and not a network namespace: Fargate tasks get no CAP_SYS_ADMIN, so the runner cannot
 * unshare(CLONE_NEWNET). A seccomp filter needs no privilege, only PR_SET_NO_NEW_PRIVS, and it also
 * covers the ECS credentials endpoint (169.254.170.2), which is just another network address.
 *
 * Denied syscalls (default is allow; each returns EPERM):
 *   socket, socketpair  - no network and no local sockets; nothing student code does needs them.
 *   ptrace, process_vm_readv/writev - no inspecting or tampering with other processes.
 *   io_uring_*          - io_uring can open sockets without going through socket().
 *   bpf, perf_event_open, userfaltfd - kernel attack surface with no teaching value.
 *
 * Resource limits are set before the exec, so they apply to the program and its descendants.
 * Core dumps are disabled.
 */
#define _GNU_SOURCE
#include <errno.h>
#include <seccomp.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <unistd.h>

static const char *denied[] = {
    "socket", "socketpair", "ptrace", "process_vm_readv", "process_vm_writev", "io_uring_setup",
    "io_uring_enter", "io_uring_register", "bpf", "perf_event_open", "userfaltfd",
};

static void limit(int resource, rlim_t value) {
  struct rlimit rl = {value, value};
  if (setrlimit(resource, &rl) != 0) {
    perror("sandbox-exec: setrlimit");
    exit(126);
  }
}

static void install_filter(void) {
  scmp_filter_ctx ctx = seccomp_init(SCMP_ACT_ALLOW);
  if (!ctx) exit(126);
  for (size_t i = 0; i < sizeof denied / sizeof *denied; i++) {
    int nr = seccomp_syscall_resolve_name(denied[i]);
    if (nr == __NR_SCMP_ERROR) continue; /* not present on this architecture */
    if (seccomp_rule_add(ctx, SCMP_ACT_ERRNO(EPERM), nr, 0) != 0) exit(126);
  }
  if (seccomp_load(ctx) != 0) {
    perror("sandbox-exec: seccomp_load");
    exit(126);
  }
  seccomp_release(ctx);
}

int main(int argc, char **argv) {
  long as_bytes = 0, cpu_s = 0, nproc = 128, fsize = 32L * 1024 * 1024;
  int i = 1;
  for (; i < argc && strncmp(argv[i], "--", 2) == 0; i++) {
    if (strcmp(argv[i], "--") == 0) { i++; break; }
    if (sscanf(argv[i], "--as=%ld", &as_bytes) == 1) continue;
    if (sscanf(argv[i], "--cpu=%ld", &cpu_s) == 1) continue;
    if (sscanf(argv[i], "--nproc=%ld", &nproc) == 1) continue;
    if (sscanf(argv[i], "--fsize=%ld", &fsize) == 1) continue;
    fprintf(stderr, "sandbox-exec: unknown option %s\n", argv[i]);
    return 126;
  }
  if (i >= argc) {
    fprintf(stderr, "usage: sandbox-exec [options] -- program [args...]\n");
    return 126;
  }

  if (as_bytes > 0) limit(RLIMIT_AS, as_bytes);
  if (cpu_s > 0) limit(RLIMIT_CPU, cpu_s);
  limit(RLIMIT_NPROC, nproc);
  limit(RLIMIT_FSIZE, fsize);
  limit(RLIMIT_CORE, 0);

  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) {
    perror("sandbox-exec: PR_SET_NO_NEW_PRIVS");
    return 126;
  }
  install_filter();

  execvp(argv[i], &argv[i]);
  perror(argv[i]);
  return 127;
}
