import Editor from "@monaco-editor/react";
import { Terminal } from "@xterm/xterm";
import { useEffect, useMemo, useRef, useState } from "react";
import { Backend, type BackendStatus, type Language, type RunEvent } from "./backend";
import { devBackend, type Config } from "./config";
import { FileTree } from "./FileTree";
import {
  deletePath,
  has,
  pathConflict,
  pathProblem,
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
  const [statusMessage, setStatusMessage] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [saveFailed, setSaveFailed] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const backend = useMemo(
    () =>
      new Backend(
        config,
        (next, message) => {
          setStatus(next);
          setStatusMessage(message);
        },
        getIdToken,
      ),
    [config, getIdToken],
  );
  const term = useMemo(() => new Terminal({ convertEol: false, fontSize: 14, theme: { background: "#111" } }), []);
  const runIdRef = useRef<string | null>(null);
  const runAbort = useRef<AbortController | null>(null);
  const stopRequested = useRef(false);
  const input = useRef<{ clear: () => void } | null>(null);
  const stopRef = useRef<() => void>(() => {});

  const project = store.projects[store.current];
  const ws = workspaceOf(project);
  const language = project.language;

  useEffect(() => {
    try {
      saveStore(store);
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    }
  }, [store]);
  // Warm the workspace as soon as the IDE opens: a cold start takes 15-45 s.
  // Also stop any run left over from before a reload.
  useEffect(() => {
    void backend.warm().then(() => backend.stopStale(), () => {});
    return () => {
      backend.dispose();
      runAbort.current?.abort();
    };
  }, [backend]);
  useEffect(() => {
    const lines = lineInput(term, {
      active: () => runIdRef.current !== null,
      send: (line, eof) => {
        const id = runIdRef.current;
        if (id) backend.sendStdin(id, line, eof).catch((e) => term.write(styles.error(`\r\n${e.message}\r\n`)));
      },
      interrupt: () => stopRef.current(),
    });
    input.current = lines;
    return () => lines.dispose();
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
    if (!name) return;
    if (has(store.projects, name)) return setNotice(`A project named "${name}" already exists`);
    setNotice(undefined);
    setStore((s) => ({ current: name, projects: { ...s.projects, [name]: newProject() } }));
  };

  const newFile = () => {
    const path = prompt("New file path (use / for folders)")?.trim();
    if (path === undefined) return;
    const problem = pathProblem(path) ?? pathConflict(ws, path);
    setNotice(problem ?? undefined);
    if (!problem) update((w) => withFile(w, path));
  };

  const newFolder = () => {
    const path = prompt("New folder path")?.trim();
    if (path === undefined) return;
    const problem = pathProblem(path) ?? pathConflict(ws, path);
    setNotice(problem ?? undefined);
    if (!problem) update((w) => ({ ...w, folders: [...w.folders, path] }));
  };

  const rename = (path: string) => {
    const to = prompt("Rename to", path)?.trim();
    if (to === undefined || to === path) return;
    const problem =
      pathProblem(to) ??
      (to.startsWith(path + "/") ? `Cannot move "${path}" into itself` : pathConflict(deletePath(ws, path), to));
    setNotice(problem ?? undefined);
    if (!problem) update((w) => renamePath(w, path, to));
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
    input.current?.clear();
    term.reset();
    runAbort.current?.abort();
    const controller = (runAbort.current = new AbortController());
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
      if (!controller.signal.aborted) term.writeln(styles.error(`\r\n${(error as Error).message}`));
    } finally {
      runIdRef.current = null;
      input.current?.clear();
      setRunId(null);
      setRunning(false);
    }
  };

  const stop = () => {
    const id = runIdRef.current;
    if (!id) return;
    stopRequested.current = true;
    backend.stop(id).catch((e) => term.write(styles.error(`\r\n${e.message}\r\n`)));
  };
  stopRef.current = stop;

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
        {devBackend(config) ? <span>Dev backend</span> : <span>Signed in as {user}</span>}
        {!devBackend(config) && <button onClick={onSignOut}>Sign out</button>}
      </header>
      <div className="banners">
      {status === "starting" && <div className="banner">Starting your workspace… this can take up to a minute.</div>}
      {status === "error" && (
        <div className="banner error" role="alert">
          {statusMessage ?? "Your workspace could not start."}{" "}
          <button onClick={() => void backend.warm().then(() => backend.stopStale(), () => {})}>Retry</button>
        </div>
      )}
      {notice && (
        <div className="banner error" role="alert">
          {notice}
        </div>
      )}
      {saveFailed && (
        <div className="banner error" role="alert">
          Your projects could not be saved in this browser; changes may be lost on reload.
        </div>
      )}
      </div>
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
            .filter((path) => has(ws.files, path))
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
          {ws.active && has(ws.files, ws.active) ? (
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
