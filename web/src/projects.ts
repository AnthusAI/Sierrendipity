import type { Language } from "./backend";

export const LANGUAGES: { id: Language; label: string; monaco: string }[] = [
  { id: "python", label: "Python", monaco: "python" },
  { id: "c", label: "C", monaco: "c" },
  { id: "cpp", label: "C++", monaco: "cpp" },
];

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

const STARTERS: Record<Language, Record<string, string>> = {
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
};

export const starter = (language: Language): Workspace => {
  const files = { ...STARTERS[language] };
  const first = Object.keys(files)[0];
  return { files, folders: [], open: [first], active: first };
};

export const newProject = (): Project => ({ language: "python", workspaces: { python: starter("python") } });

export const workspaceOf = (project: Project): Workspace => project.workspaces[project.language] ?? starter(project.language);

const KEY = "sierrendipity.projects";

export function loadStore(): Store {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Store | null;
    if (saved && saved.projects[saved.current]) return saved;
  } catch {
    /* fall through to a fresh store */
  }
  return { current: "My project", projects: { "My project": newProject() } };
}

export const saveStore = (store: Store) => localStorage.setItem(KEY, JSON.stringify(store));

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
