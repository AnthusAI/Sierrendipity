/*
 * sandbox-exec: confine one student program, then exec it. Also kills everything a run left behind.
 *
 *   sandbox-exec [--uid=N] [--no-seccomp] [--as=BYTES] [--cpu=SECONDS] [--nproc=N] [--fsize=BYTES]
 *                -- program [args...]
 *   sandbox-exec --kill-uid=N
 *   sandbox-exec --clean-ipc=N
 *
 * The runner server is root; every run gets its own unprivileged uid (--uid), so student code cannot
 * read the server's /proc entries, signal it, or touch another run's files. --kill-uid kills every
 * process of that uid, wherever it ran or whatever session it escaped to. Both need root (CAP_SETUID,
 * CAP_SETGID); nothing else does.
 *
 * Why seccomp and not a network namespace: Fargate tasks get no CAP_SYS_ADMIN, so the runner cannot
 * unshare(CLONE_NEWNET). A seccomp filter needs no privilege, only PR_SET_NO_NEW_PRIVS, and it also
 * covers the ECS credentials endpoint (169.254.170.2), which is just another network address.
 *
 * Denied syscalls (default is allow; each returns EPERM unless noted):
 *   socket, socketpair  - no network and no local sockets; nothing student code does needs them.
 *   ptrace, process_vm_*, kcmp, pidfd_* - no inspecting or signalling other processes.
 *   io_uring_*          - io_uring can open sockets without going through socket().
 *   unshare, setns, mount and the new mount API, pivot_root, chroot - no namespaces or mounts.
 *   clone with any CLONE_NEW* flag - the same namespaces by another door.
 *   clone3 returns ENOSYS - its flags live behind a pointer a filter cannot read; glibc then falls
 *                     back to clone, which is filtered above.
 *   System V shm/sem/msg and POSIX message queues - they outlive the process (and a recycled uid
 *                     could attach them) and are a finite system-wide resource.
 *   keyctl, add_key, request_key, kexec_*, *_module, bpf, perf_event_open, userfaltfd,
 *   open_by_handle_at, name_to_handle_at, personality, swapon, swapoff, reboot, acct
 *                     - kernel attack surface or privileged operations with no teaching value.
 * Syscalls of other ABIs (32-bit compat) hit libseccomp's default bad-architecture action, which
 * kills the process, so they need no rules of their own.
 *
 * Resource limits are set after the uid change and before the exec, so they apply to the program
 * and its descendants (RLIMIT_NPROC is per uid, hence per run). Core dumps are disabled.
 */
#define _GNU_SOURCE
#include <dirent.h>
#include <errno.h>
#include <grp.h>
#include <sched.h>
#include <seccomp.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ipc.h>
#include <sys/msg.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/sem.h>
#include <sys/shm.h>
#include <sys/stat.h>
#include <unistd.h>

static const char *denied[] = {
    "socket", "socketpair", "ptrace", "process_vm_readv", "process_vm_writev", "kcmp",
    "pidfd_open", "pidfd_getfd", "pidfd_send_signal", "io_uring_setup", "io_uring_enter",
    "io_uring_register", "unshare", "setns", "mount", "umount2", "pivot_root", "chroot",
    "move_mount", "open_tree", "fsopen", "fsconfig", "fsmount", "fspick", "mount_setattr",
    "keyctl", "add_key", "request_key", "kexec_load", "kexec_file_load", "init_module",
    "finit_module", "delete_module", "bpf", "perf_event_open", "userfaltfd", "open_by_handle_at",
    "name_to_handle_at", "personality", "swapon", "swapoff", "reboot", "acct",
    "shmget", "shmat", "shmdt", "shmctl", "semget", "semop", "semtimedop", "semctl", "msgget",
    "msgsnd", "msgrcv", "msgctl", "mq_open", "mq_unlink",
};

static const unsigned long namespace_flags[] = {
    CLONE_NEWNS, CLONE_NEWCGROUP, CLONE_NEWUTS, CLONE_NEWIPC, CLONE_NEWUSER, CLONE_NEWPID, CLONE_NEWNET,
};

static void die(const char *what) {
  perror(what);
  exit(126);
}

static void limit(int resource, rlim_t value) {
  struct rlimit rl = {value, value};
  if (setrlimit(resource, &rl) != 0) die("sandbox-exec: setrlimit");
}

/* Become uid:uid with no supplementary groups, and prove root cannot be regained. */
static void drop_to(uid_t uid) {
  if (uid < 1000) {
    fprintf(stderr, "sandbox-exec: refusing uid %u\n", (unsigned)uid);
    exit(126);
  }
  if (setgroups(0, NULL) != 0) die("sandbox-exec: setgroups");
  if (setresgid(uid, uid, uid) != 0) die("sandbox-exec: setresgid");
  if (setresuid(uid, uid, uid) != 0) die("sandbox-exec: setresuid");
  if (getuid() != uid || geteuid() != uid || getgid() != uid || getegid() != uid) die("sandbox-exec: uid check");
  if (setresuid(0, 0, 0) == 0) {
    fprintf(stderr, "sandbox-exec: still able to become root\n");
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
  for (size_t i = 0; i < sizeof namespace_flags / sizeof *namespace_flags; i++) {
    unsigned long flag = namespace_flags[i];
    if (seccomp_rule_add(ctx, SCMP_ACT_ERRNO(EPERM), SCMP_SYS(clone), 1,
                         SCMP_CMP(0, SCMP_CMP_MASKED_EQ, flag, flag)) != 0)
      exit(126);
  }
  if (seccomp_rule_add(ctx, SCMP_ACT_ERRNO(ENOSYS), SCMP_SYS(clone3), 0) != 0) exit(126);
  if (seccomp_load(ctx) != 0) die("sandbox-exec: seccomp_load");
  seccomp_release(ctx);
}

/* Processes of `uid` other than this one that are not zombies (a zombie only awaits its parent). */
static int live_processes(uid_t uid) {
  DIR *proc = opendir("/proc");
  if (!proc) return 0;
  int count = 0;
  struct dirent *entry;
  while ((entry = readdir(proc))) {
    if (entry->d_name[0] < '1' || entry->d_name[0] > '9') continue;
    char path[300], line[512];
    struct stat st;
    snprintf(path, sizeof path, "/proc/%s", entry->d_name);
    if (stat(path, &st) != 0 || st.st_uid != uid || atoi(entry->d_name) == getpid()) continue;
    snprintf(path, sizeof path, "/proc/%s/stat", entry->d_name);
    FILE *f = fopen(path, "r");
    if (!f) continue; /* exited meanwhile */
    char *rparen = fgets(line, sizeof line, f) ? strrchr(line, ')') : NULL;
    fclose(f);
    if (rparen && rparen[2] != 'Z' && rparen[2] != 'X') count++;
  }
  closedir(proc);
  return count;
}

/* Kill every process of `uid` until none are left (bounded). */
static int kill_uid(uid_t uid) {
  drop_to(uid);
  for (int i = 0; i < 400; i++) {
    /* kill(-1) signals every process we may signal, which now means this uid's; not ourselves.
       Its return value cannot tell us when none are left (it succeeds when it only met EPERM). */
    kill(-1, SIGKILL);
    if (live_processes(uid) == 0) return 0;
    usleep(5000);
  }
  fprintf(stderr, "sandbox-exec: processes of uid %u survived\n", (unsigned)uid);
  return 1;
}

/* Remove the System V objects owned by `uid`: the safety net for programs that ran unfiltered. */
static void clean_ipc(uid_t uid) {
  /* IPC_RMID needs to be the owner (or CAP_SYS_ADMIN, which the task lacks), so become the uid. */
  drop_to(uid);
  static const struct { const char *file; int uid_column; } kinds[] = {
      {"/proc/sysvipc/shm", 7}, {"/proc/sysvipc/sem", 4}, {"/proc/sysvipc/msg", 7}};
  for (int k = 0; k < 3; k++) {
    FILE *f = fopen(kinds[k].file, "r");
    if (!f) continue;
    char line[1024];
    int first = 1;
    while (fgets(line, sizeof line, f)) {
      if (first) { first = 0; continue; } /* header */
      long fields[16] = {0};
      char *save, *tok = strtok_r(line, " \t\n", &save);
      for (int n = 0; tok && n < 16; n++, tok = strtok_r(NULL, " \t\n", &save)) fields[n] = atol(tok);
      if ((uid_t)fields[kinds[k].uid_column] != uid) continue;
      int id = (int)fields[1];
      if (k == 0) shmctl(id, IPC_RMID, NULL);
      else if (k == 1) semctl(id, 0, IPC_RMID);
      else msgctl(id, IPC_RMID, NULL);
    }
    fclose(f);
  }
}

int main(int argc, char **argv) {
  long clean_target = -1, as_bytes = 0, cpu_s = 0, nproc = 128, fsize = 16L * 1024 * 1024, uid = -1, kill_target = -1;
  int seccomp = 1;
  int i = 1;
  for (; i < argc && strncmp(argv[i], "--", 2) == 0; i++) {
    if (strcmp(argv[i], "--") == 0) { i++; break; }
    if (strcmp(argv[i], "--no-seccomp") == 0) { seccomp = 0; continue; }
    if (sscanf(argv[i], "--uid=%ld", &uid) == 1) continue;
    if (sscanf(argv[i], "--kill-uid=%ld", &kill_target) == 1) continue;
    if (sscanf(argv[i], "--clean-ipc=%ld", &clean_target) == 1) continue;
    if (sscanf(argv[i], "--as=%ld", &as_bytes) == 1) continue;
    if (sscanf(argv[i], "--cpu=%ld", &cpu_s) == 1) continue;
    if (sscanf(argv[i], "--nproc=%ld", &nproc) == 1) continue;
    if (sscanf(argv[i], "--fsize=%ld", &fsize) == 1) continue;
    fprintf(stderr, "sandbox-exec: unknown option %s\n", argv[i]);
    return 126;
  }
  if (clean_target >= 0) {
    clean_ipc((uid_t)clean_target);
    return 0;
  }
  if (kill_target >= 0) return kill_uid((uid_t)kill_target);
  if (i >= argc) {
    fprintf(stderr, "usage: sandbox-exec [options] -- program [args...]\n");
    return 126;
  }

  if (uid >= 0) drop_to((uid_t)uid);
  if (as_bytes > 0) limit(RLIMIT_AS, as_bytes);
  if (cpu_s > 0) limit(RLIMIT_CPU, cpu_s);
  limit(RLIMIT_NPROC, nproc);
  limit(RLIMIT_FSIZE, fsize);
  limit(RLIMIT_CORE, 0);

  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) die("sandbox-exec: PR_SET_NO_NEW_PRIVS");
  if (seccomp) install_filter();

  execvp(argv[i], &argv[i]);
  perror(argv[i]);
  return 127;
}
