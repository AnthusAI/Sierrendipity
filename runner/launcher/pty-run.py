"""Run a command on a pseudo-terminal so it behaves as it would in a terminal.

    pty-run.py command [args...]

stdin is forwarded to the terminal, the terminal's output goes to stdout, and the exit status of the
command is reproduced (as a signal death if it died of a signal). Closing stdin sends end-of-file.
The command stays in this process's group, so killing the group stops everything.
"""
import os
import select
import signal
import sys
import termios

master, slave = os.openpty()
# The client does its own echo; the output stream must carry program output only.
attrs = termios.tcgetattr(slave)
attrs[3] &= ~termios.ECHO
termios.tcsetattr(slave, termios.TCSANOW, attrs)
pid = os.fork()
if pid == 0:
    os.close(master)
    for fd in (0, 1, 2):
        os.dup2(slave, fd)
    os.close(slave)
    os.execvp(sys.argv[1], sys.argv[1:])
os.close(slave)

stdin_open = True
done = None
while done is None:
    watch = [master] + ([0] if stdin_open else [])
    ready, _, _ = select.select(watch, [], [], 0.1)
    if 0 in ready:
        data = os.read(0, 4096)
        if data:
            os.write(master, data)
        else:
            stdin_open = False
            os.write(master, b"\x04\x04")  # twice: the first flushes a partial line
    if master in ready:
        try:
            data = os.read(master, 65536)
        except OSError:  # EIO: every other end of the terminal is closed
            data = b""
        if data:
            os.write(1, data)
    finished, status = os.waitpid(pid, os.WNOHANG)
    if finished:
        done = status

# Drain whatever the program printed before it exited.
try:
    while select.select([master], [], [], 0)[0]:
        data = os.read(master, 65536)
        if not data:
            break
        os.write(1, data)
except OSError:
    pass

if os.WIFSIGNALED(done):
    signal.signal(os.WTERMSIG(done), signal.SIG_DFL)
    os.kill(os.getpid(), os.WTERMSIG(done))
sys.exit(os.WEXITSTATUS(done))
