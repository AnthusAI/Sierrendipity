import Editor from "@monaco-editor/react";
import { Terminal } from "@xterm/xterm";
import { useEffect, useMemo, useRef, useState } from "react";
import { Backend, type BackendStatus, type Language, type RunEvent } from "./backend";
import type { Config } from "./config";
import { FileTree } from "./FileTree";
import {
  deletePath,
  LANGUAGES,
  loadStore,
  newProject,
  renamePath,
  saveStore,
  starter,
  withFile,
  workspaceOf,
  type Workspace,
} from "./projects";
import { crlf, lineInput, styles, TerminalPane } from "./TerminalPane";

interface Props {
  config: Config;
  user?: string;
  getIdToken: () => Promise<string | null>;
  onSignOut: () => void;
}

export function Ide({ config, user, getIdToken, onSignOut }: Props) {
  const [store, setStore] = useState(loadStore);
  const [status, setStatus] = useState<BackendStatus>("starting");
  const [runId, setRunId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const backend = useMemo(() => new Backend(config, setStatus, getIdToken), [config, getIdToken]);
  const term = useMemo(() => new Terminal({ convertEol: false, fontSize: 14, theme: { background: "#111" } }), []);
  const runIdRef = useRef<string | null>(null);
  const stopRequested = useRef(false);

  const project = store.projects[store.current];
  const ws = workspaceOf(project);
  const language = project.language;

  useEffect(() => saveStore(store), [store]);
  // Warm the workspace as soon as the IDE opens: a cold start takes 15-45 s.
  useEffect(() => void backend.warm().catch(() => {}), [backend]);
  useEffect(() => {
    const input = lineInput(term, (line) => runIdRef.current && void backend.sendStdin(runIdRef.current, line));
    return () => input.dispose();
  }, [term, backend]);

  const update = (change: (ws: Workspace) => Workspace) =>
    setStore((s) => {
      const p = s.projects[s.current];
      return { ...s, projects: { ...s.projects, [s.current]: { ...p, workspaces: { ...p.workspaces, [p.language]: change(workspaceOf(p)) } } } };
    });

  const switchLanguage = (next: Language) =>
    setStore((s) => {
      const p = s.projects[s.current];
      return { ...s, projects: { ...s.projects, [s.current]: { language: next, workspaces: { ...p.workspaces, [next]: p.workspaces[next] ?? starter(next) } } } };
    });

  const createProject = () => {
    const name = prompt("Project name")?.trim();
    if (!name || store.projects[name]) return;
    setStore((s) => ({ current: name, projects: { ...s.projects, [name]: newProject() } }));
  };

  const newFile = () => {
    const path = prompt("New file path (use / for folders)")?.trim();
    if (path && !(path in ws.files)) update((w) => withFile(w, path));
  };

  const newFolder = () => {
    const path = prompt("New folder path")?.trim();
    if (path) update((w) => ({ ...w, folders: [...w.folders, path] }));
  };

  const rename = (path: string) => {
    const to = prompt("Rename to", path)?.trim();
    if (to && to !== path) update((w) => renamePath(w, path, to));
  };

  const remove = (path: string) => {
    if (confirm(`Delete ${path}?`)) update((w) => deletePath(w, path));
  };

  const onEvent = (event: RunEvent) => {
    if (event.type === "compile") {
      if (event.output) term.write((event.ok ? styles.warning : styles.error)(crlf(event.output.endsWith("\n") ? event.output : event.output + "\n")));
    } else if (event.type === "output") {
      term.write(crlf(event.data));
    } else {
      const text = stopRequested.current ? "stopped" : `${event.status}${event.exitCode != null ? `, exit code ${event.exitCode}` : ""}`;
      term.write(styles.note(`\r\n[${text}]\r\n`));
    }
  };

  const run = async () => {
    if (running) return;
    setRunning(true);
    stopRequested.current = false;
    term.reset();
    const controller = new AbortController();
    try {
      if (status !== "ready") term.writeln(styles.note("Starting your workspace, this can take up to a minute..."));
      const python = Object.keys(ws.files).filter((p) => p.endsWith(".py"));
      const id = await backend.startRun({
        language,
        files: Object.entries(ws.files).map(([path, content]) => ({ path, content })),
        entry: language === "python" ? (python.includes("main.py") ? "main.py" : python[0]) : undefined,
      });
      runIdRef.current = id;
      setRunId(id);
      term.reset();
      term.focus();
      await backend.streamEvents(id, onEvent, controller.signal);
    } catch (error) {
      term.writeln(styles.error(`\r\n${(error as Error).message}`));
    } finally {
      runIdRef.current = null;
      setRunId(null);
      setRunning(false);
    }
  };

  const stop = () => {
    if (!runId) return;
    stopRequested.current = true;
    void backend.stop(runId);
  };

  return (
    <div className="ide">
      <header>
        <strong>Sierrendipity</strong>
        <select aria-label="Project" value={store.current} onChange={(e) => setStore({ ...store, current: e.target.value })}>
          {Object.keys(store.projects).map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <button onClick={createProject}>New project</button>
        <select aria-label="Language" value={language} onChange={(e) => switchLanguage(e.target.value as Language)}>
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        <button onClick={() => void run()} disabled={running}>
          Run
        </button>
        <button onClick={stop} disabled={!runId}>
          Stop
        </button>
        <span className="spacer" />
        <span>
          Backend: <span role="status" aria-label="Backend status">{status}</span>
        </span>
        {config.devBackend ? <span>Dev backend</span> : <span>Signed in as {user}</span>}
        {!config.devBackend && <button onClick={onSignOut}>Sign out</button>}
      </header>
      {status === "starting" && <div className="banner">Starting your workspace… this can take up to a minute.</div>}
      <FileTree
        workspace={ws}
        onOpen={(path) => update((w) => ({ ...w, open: w.open.includes(path) ? w.open : [...w.open, path], active: path }))}
        onNewFile={newFile}
        onNewFolder={newFolder}
        onRename={rename}
        onDelete={remove}
      />
      <main>
        <div role="tablist" className="tabs">
          {ws.open
            .filter((path) => path in ws.files)
            .map((path) => (
              <span key={path} className={path === ws.active ? "tab active" : "tab"}>
                <button role="tab" aria-selected={path === ws.active} onClick={() => update((w) => ({ ...w, active: path }))}>
                  {path}
                </button>
                <button className="icon" aria-label={`Close ${path}`} onClick={() => update((w) => ({ ...w, open: w.open.filter((p) => p !== path), active: w.active === path ? (w.open.filter((p) => p !== path).at(-1) ?? null) : w.active }))}>
                  ×
                </button>
              </span>
            ))}
        </div>
        <div className="editor">
          {ws.active && ws.active in ws.files ? (
            <Editor
              key={`${store.current}|${language}|${ws.active}`}
              theme="vs-dark"
              language={editorLanguage(ws.active, language)}
              value={ws.files[ws.active]}
              onChange={(value) => update((w) => ({ ...w, files: { ...w.files, [w.active!]: value ?? "" } }))}
              options={{ minimap: { enabled: false }, automaticLayout: true }}
            />
          ) : (
            <p className="empty">Open a file from the tree.</p>
          )}
        </div>
        <TerminalPane term={term} />
      </main>
    </div>
  );
}

function editorLanguage(path: string, fallback: Language): string {
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".c") || path.endsWith(".h")) return "c";
  if (/\.(cpp|cc|cxx|hpp)$/.test(path)) return "cpp";
  return path.includes(".") ? "plaintext" : LANGUAGES.find((l) => l.id === fallback)!.monaco;
}
