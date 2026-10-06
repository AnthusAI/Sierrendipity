import type { Language } from "./backend";

export const LANGUAGES: { id: Language; label: string; monaco: string }[] = [
  { id: "python", label: "Python", monaco: "python" },
  { id: "c", label: "C", monaco: "c" },
  { id: "cpp", label: "C++", monaco: "cpp" },
  { id: "rust", label: "Rust", monaco: "rust" },
  { id: "asm", label: "RISC-V assembly", monaco: "riscv-asm" },
  { id: "machine", label: "Machine code", monaco: "riscv-machine" },
];

/** True for the languages that run in the in-browser emulator instead of on the backend. */
export const isRiscv = (language: Language) => language === "asm" || language === "machine";

export interface Workspace {
  files: Record<string, string>;
  folders: string[];
  open: string[];
  active: string | null;
}

/** One project keeps a separate workspace per language, so switching language never loses work. */
export interface Project {
  language: Language;
  workspaces: Partial<Record<Language, Workspace>>;
}

export interface Store {
  current: string;
  projects: Record<string, Project>;
}

const ASM_STARTER = `# Prints "Hello" with the write system call, then exits with code 0.
# System calls: put the number in a7, arguments in a0..a2, then ecall.
#   write: a7 = 64, a0 = file descriptor (1 = terminal), a1 = address, a2 = length
#   read:  a7 = 63, a0 = 0 (keyboard),                    a1 = address, a2 = size
#   exit:  a7 = 93, a0 = exit code
        li   t0, 0x6c6c6548 # the bytes "Hell" (stored little-endian)
        sw   t0, -8(sp)     # put them in memory just below the stack pointer
        li   t0, 0x0a6f     # the bytes "o" and a newline
        sw   t0, -4(sp)
        li   a0, 1          # file descriptor 1: the terminal
        addi a1, sp, -8     # address of the text
        li   a2, 6          # number of bytes
        li   a7, 64         # write
        ecall
        li   a0, 0          # exit code 0
        li   a7, 93         # exit
        ecall
`;

const MACHINE_STARTER = `# Machine code: one 32-bit word per entry, written in hex (0x...) or binary (0b...).
# Everything after a # is a comment; words may be separated by spaces or new lines.
0x00000513   # addi a0, zero, 0     a0 = 0 (the exit code)
0x05d00893   # addi a7, zero, 93    a7 = 93 (the exit system call)
0x00000073   # ecall                exit(a0)
`;

const STARTERS: Record<Language, Record<string, string>> = {
  asm: { "main.s": ASM_STARTER },
  machine: { "main.hex": MACHINE_STARTER },
  python: {
    "main.py": 'name = input("Name: ")\nprint(f"Hello, {name}!")\n',
  },
  c: {
    "main.c":
      '#include <stdio.h>\n\nint main(void) {\n  char name[64];\n  printf("Name: ");\n  scanf("%63s", name);\n  printf("Hello, %s!\\n", name);\n  return 0;\n}\n',
  },
  cpp: {
    "main.cpp":
      '#include <iostream>\n#include <string>\n\nint main() {\n  std::string name;\n  std::cout << "Name: ";\n  std::cin >> name;\n  std::cout << "Hello, " << name << "!\\n";\n  return 0;\n}\n',
  },
  // Rust's stdout is not flushed when the program reads stdin, so the prompt needs an explicit flush.
  rust: {
    "main.rs":
      'use std::io::{self, Write};\n\nfn main() {\n    print!("Name: ");\n    io::stdout().flush().unwrap();\n    let mut name = String::new();\n    io::stdin().read_line(&mut name).unwrap();\n    println!("Hello, {}!", name.trim());\n}\n',
  },
};

export const starter = (language: Language): Workspace => {
  const files = { ...STARTERS[language] };
  const first = Object.keys(files)[0];
  return { files, folders: [], open: [first], active: first };
};

export const newProject = (): Project => ({ language: "python", workspaces: { python: starter("python") } });

export const workspaceOf = (project: Project): Workspace => project.workspaces[project.language] ?? starter(project.language);

const KEY = "sierrendipity.projects";

/** Own-property check: project and file names such as "toString" must not hit Object.prototype. */
export const has = (object: object, key: string) => Object.hasOwn(object, key);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function normalizeWorkspace(raw: unknown): Workspace | undefined {
  if (!isObject(raw) || !isObject(raw.files)) return undefined;
  const files = Object.fromEntries(Object.entries(raw.files).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const open = strings(raw.open).filter((path) => has(files, path));
  const active = typeof raw.active === "string" && has(files, raw.active) ? raw.active : (open[0] ?? null);
  return { files, folders: strings(raw.folders), open, active };
}

/** Rebuild a store from untrusted saved data; null when nothing usable is left. */
export function normalizeStore(raw: unknown): Store | null {
  if (!isObject(raw) || !isObject(raw.projects)) return null;
  const projects: Record<string, Project> = {};
  for (const [name, p] of Object.entries(raw.projects)) {
    if (!isObject(p) || !LANGUAGES.some((l) => l.id === p.language)) continue;
    const workspaces: Project["workspaces"] = {};
    for (const { id } of LANGUAGES) {
      const ws = isObject(p.workspaces) ? normalizeWorkspace(p.workspaces[id]) : undefined;
      if (ws) workspaces[id] = ws;
    }
    projects[name] = { language: p.language as Language, workspaces };
  }
  const names = Object.keys(projects);
  if (names.length === 0) return null;
  const current = typeof raw.current === "string" && has(projects, raw.current) ? raw.current : names[0];
  return { current, projects };
}

export function loadStore(): Store {
  try {
    const store = normalizeStore(JSON.parse(localStorage.getItem(KEY) ?? "null"));
    if (store) return store;
  } catch {
    /* fall through to a fresh store */
  }
  return { current: "My project", projects: { "My project": newProject() } };
}

/** Throws when the browser refuses (quota, privacy mode); callers show a non-fatal warning. */
export const saveStore = (store: Store) => localStorage.setItem(KEY, JSON.stringify(store));

/** Why a new file/folder path is unacceptable, or null when it is fine. */
export function pathProblem(path: string): string | null {
  const bad = path === "" || path.startsWith("/") || path.endsWith("/") || path.includes("//") || path.includes("\\");
  if (bad || path.split("/").some((part) => part === ".." || part === ".")) return `"${path}" is not a valid path`;
  return null;
}

/** Why `path` collides with something in `ws`, or null. */
export function pathConflict(ws: Workspace, path: string): string | null {
  const parts = path.split("/");
  const parents = parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
  if (has(ws.files, path) || allFolders(ws).includes(path)) return `"${path}" already exists`;
  const blocker = parents.find((p) => has(ws.files, p));
  return blocker ? `"${blocker}" is a file, so it cannot contain "${path}"` : null;
}

// Workspace edits (pure).

export function withFile(ws: Workspace, path: string, content = ""): Workspace {
  return { ...ws, files: { ...ws.files, [path]: content }, open: ws.open.includes(path) ? ws.open : [...ws.open, path], active: path };
}

const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");

export function renamePath(ws: Workspace, from: string, to: string): Workspace {
  const move = (path: string) => (under(path, from) ? to + path.slice(from.length) : path);
  return {
    files: Object.fromEntries(Object.entries(ws.files).map(([path, content]) => [move(path), content])),
    folders: ws.folders.map(move),
    open: ws.open.map(move),
    active: ws.active && move(ws.active),
  };
}

export function deletePath(ws: Workspace, target: string): Workspace {
  const open = ws.open.filter((path) => !under(path, target));
  return {
    files: Object.fromEntries(Object.entries(ws.files).filter(([path]) => !under(path, target))),
    folders: ws.folders.filter((path) => !under(path, target)),
    open,
    active: ws.active && under(ws.active, target) ? (open.at(-1) ?? null) : ws.active,
  };
}

/** Every folder, including implicit parents of files, sorted. */
export function allFolders(ws: Workspace): string[] {
  const folders = new Set<string>();
  for (const path of [...Object.keys(ws.files), ...ws.folders.map((f) => f + "/x")]) {
    const parts = path.split("/").slice(0, -1);
    parts.forEach((_, i) => folders.add(parts.slice(0, i + 1).join("/")));
  }
  return [...folders].sort();
}
