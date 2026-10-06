import Editor from "@monaco-editor/react";
import { Terminal } from "@xterm/xterm";
import type * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import type { AsmError } from "@sierrendipity/explorer";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Backend, type BackendLanguage, type BackendStatus, type Language, type RunEvent } from "./backend";
import { devBackend, type Config } from "./config";
import { Emulator, type OutKind } from "./emulator";
import { FileTree } from "./FileTree";
import { AssemblyTab, BitsCard, MachineTab, MemoryTab, RegistersTab, TabGroup, type Actions, type InspectorState, type MemoryView } from "./Inspector";
import { fromAssembly, fromExplain, fromMachineCode, lineKey, type Built, type Program, type Row } from "./program";
import { ASM, MACHINE, decorate, setProblemMarkers } from "./riscvMonaco";
import {
  deletePath,
  has,
  isRiscv,
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

/** What the right pane shows: a program, the emulator running it, and the source it came from. */
interface Session {
  kind: "c" | "riscv";
  /** Every file the program was built from ({"": text} for the single-file RISC-V languages). */
  files: Record<string, string>;
  program: Program;
  emu: Emulator;
}

type Focus = { path: string; line: number } | null;

const sameFiles = (a: Record<string, string>, b: Record<string, string>) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
};

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
  const [session, setSession] = useState<Session | null>(null);
  const [problems, setProblems] = useState<AsmError[]>([]);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [selected, setSelected] = useState<Row | null>(null);
  const [pinned, setPinned] = useState<Focus>(null);
  const [hover, setHover] = useState<Focus>(null);
  const [memory, setMemory] = useState<MemoryView>({ follow: "write", address: "" });
  const [resetNote, setResetNote] = useState(false);
  const [showRuntime, setShowRuntime] = useState(false);
  const [topTab, setTopTab] = useState("assembly");
  const [bottomTab, setBottomTab] = useState("registers");
  const [paneWidth, setPaneWidth] = useState(440);
  const [optLevel, setOptLevel] = useState<"O0" | "Og">("O0");
  const [exploring, setExploring] = useState(false);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  const [mountedKey, setMountedKey] = useState("");
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;
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
  const source = ws.active && has(ws.files, ws.active) ? ws.files[ws.active] : "";

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
      active: () => runIdRef.current !== null || !!sessionRef.current?.emu.active && sessionRef.current.emu.machine.state === "waiting-input",
      send: (line, eof) => {
        const emu = sessionRef.current?.emu;
        if (emu?.machine.state === "waiting-input" && emu.active) return void emu.input(line);
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

  // RISC-V: assemble, debug and run entirely in the browser

  const emulatorOutput = (text: string, kind: OutKind) =>
    term.write(kind === "error" ? styles.error(crlf(text)) : kind === "note" ? styles.note(crlf(text)) : crlf(text));

  const startSession = (kind: Session["kind"], program: Program, files: Record<string, string>) => {
    const previous = sessionRef.current;
    previous?.emu.stop();
    const emu = new Emulator(program, emulatorOutput);
    // Breakpoints survive edits of an assembly program (addresses are kept as they are).
    if (kind === "riscv" && previous?.kind === "riscv") previous.emu.breakpoints.forEach((a) => emu.breakpoints.add(a));
    emu.subscribe(redraw);
    const next = { kind, files, program, emu };
    sessionRef.current = next;
    setSession(next);
    setSelected(null);
    setPinned(null);
    return next;
  };

  const clearSession = () => {
    sessionRef.current?.emu.stop();
    sessionRef.current = null;
    setSession(null);
    setProblems([]);
    setSelected(null);
    setPinned(null);
    setHover(null);
    setResetNote(false);
  };

  // The IDE must not leave a Continue loop running after it unmounts.
  useEffect(() => () => sessionRef.current?.emu.stop(), []);

  const build = (): Built => (language === "asm" ? fromAssembly(source) : fromMachineCode(source));

  /** Assemble the current text and keep the session in step with it. Null when there are errors. */
  const syncRiscv = (): Session | null => {
    const built = build();
    setProblems(built.errors);
    const model = editorRef.current?.getModel();
    if (model) setProblemMarkers(model, built.errors);
    if (!built.program) return null;
    const current = sessionRef.current;
    if (current?.kind === "riscv" && current.files[""] === source) return current;
    try {
      if (current?.kind === "riscv" && current.emu.machine.steps > 0) setResetNote(true);
      return startSession("riscv", built.program, { "": source });
    } catch (error) {
      setProblems([{ line: 1, column: 1, message: (error as Error).message }]);
      return null;
    }
  };

  // Follow the student's typing (debounced): problems as markers, and a fresh program in the pane.
  useEffect(() => {
    if (!isRiscv(language)) return;
    const timer = setTimeout(() => void syncRiscv(), 250);
    return () => clearTimeout(timer);
  }, [language, source, editorVersion]);

  // A RISC-V session belongs to one file; a C session to the whole project, so switching files keeps it.
  const projectKey = `${store.current}|${language}`;
  const sessionKey = language === "c" ? projectKey : `${projectKey}|${ws.active}`;
  const keyRef = useRef(projectKey);
  const filesRef = useRef(ws.files);
  const activeRef = useRef(ws.active);
  keyRef.current = projectKey;
  filesRef.current = ws.files;
  activeRef.current = ws.active;
  useEffect(() => {
    clearSession();
    if (isRiscv(language)) void syncRiscv();
  }, [sessionKey]);

  /** The session to debug: for RISC-V it always matches the current text; for C it is the last Explore. */
  const activeSession = (): Session | null => (isRiscv(language) ? syncRiscv() : sessionRef.current);

  const runEmulator = async () => {
    const errors = isRiscv(language) ? build().errors : [];
    const current = activeSession();
    term.reset();
    if (!current) return errors.forEach((e) => term.write(styles.error(`Line ${e.line}: ${e.message}\r\n`)));
    setResetNote(false);
    input.current?.clear();
    term.focus();
    current.emu.reset();
    await current.emu.run();
  };

  const debug = (action: (emu: Emulator) => void) => () => {
    const current = activeSession();
    if (!current) return;
    setResetNote(false);
    action(current.emu);
  };

  const explore = async () => {
    if (exploring || running) return;
    setExploring(true);
    input.current?.clear();
    term.reset();
    clearSession();
    const startKey = keyRef.current;
    const files = { ...ws.files };
    // The result only counts if the project, language and every file are still as they were.
    const current = () => keyRef.current === startKey && sameFiles(filesRef.current, files);
    try {
      if (status !== "ready") term.writeln(styles.note("Starting your workspace, this can take up to a minute..."));
      const response = await backend.explain({
        language: "c",
        files: Object.entries(files).map(([path, content]) => ({ path, content })),
        optLevel,
      });
      if (!current()) return;
      term.reset();
      const program = fromExplain(response);
      if (!program) {
        const text = response.compileOutput || (response.status === "ok" ? "explore returned no program" : `explore failed: ${response.status}`);
        term.write(styles.error(crlf(text.endsWith("\n") ? text : text + "\n")));
        return;
      }
      if (response.compileOutput) term.write(styles.warning(crlf(response.compileOutput)));
      startSession("c", program, files);
      setTopTab("assembly");
    } catch (error) {
      if (current()) term.writeln(styles.error(`\r\n${(error as Error).message}`));
    } finally {
      setExploring(false);
    }
  };

  /** Show `path:line` in the editor: open the file if needed and scroll to the line. */
  const reveal = useRef<number | null>(null);
  const showInEditor = (path: string, line: number) => {
    if (path && path !== activeRef.current) {
      reveal.current = line;
      update((w) => ({ ...w, open: w.open.includes(path) ? w.open : [...w.open, path], active: path }));
    } else editorRef.current?.revealLineInCenterIfOutsideViewport(line);
  };

  const handlers = useRef<Actions>(null as unknown as Actions);
  handlers.current = {
    select: (row) => {
      setSelected(row);
      setPinned(row.line ? { path: row.path, line: row.line } : null);
    },
    hover: (row) => setHover(row && row.line ? { path: row.path, line: row.line } : null),
    toggleBreakpoint: (row) => sessionRef.current?.emu.toggleBreakpoint(row.addr),
    openChip: (path, line) => {
      setPinned({ path, line });
      showInEditor(path, line);
    },
  };
  const actions = useMemo<Actions>(
    () => ({
      select: (r) => handlers.current.select(r),
      hover: (r) => handlers.current.hover(r),
      toggleBreakpoint: (r) => handlers.current.toggleBreakpoint(r),
      openChip: (p, l) => handlers.current.openChip(p, l),
    }),
    [],
  );

  // Highlights only make sense while the source is the one the program was built from.
  const sourceStale = session?.kind === "c" && !sameFiles(session.files, ws.files);
  const rowPath = (path: string) => (session?.kind === "riscv" || path === ws.active ? true : false);
  const focus = hover ?? pinned;
  const pcRow = session?.program.byAddr.get(session.emu.machine.pc);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    decorations.current ??= editor.createDecorationsCollection();
    const live = session && !sourceStale;
    const breakpointLines = live
      ? [...session.emu.breakpoints].flatMap((a) => {
          const row = session.program.byAddr.get(a);
          return row?.line && rowPath(row.path) ? [row.line] : [];
        })
      : [];
    const pcLine = live && pcRow?.line && rowPath(pcRow.path) ? pcRow.line : 0;
    const focusLine = live && focus && rowPath(focus.path) ? focus.line : 0;
    decorate(decorations.current, { pcLine, breakpointLines, focusLine });
    if (pcLine && session?.emu.machine.steps) editor.revealLineInCenterIfOutsideViewport(pcLine);
  });

  const problemLines = problems.map((e) => `Line ${e.line}: ${e.message}`);
  const emuActive = !!session?.emu.active;

  const run = async () => {
    if (isRiscv(language)) return runEmulator();
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
        language: language as BackendLanguage,
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
    if (sessionRef.current?.emu.active) {
      sessionRef.current.emu.stop();
      term.write(styles.note("\r\n[stopped]\r\n"));
      return;
    }
    const id = runIdRef.current;
    if (!id) return;
    stopRequested.current = true;
    backend.stop(id).catch((e) => term.write(styles.error(`\r\n${e.message}\r\n`)));
  };
  stopRef.current = stop;

  return (
    <div className="ide" style={{ gridTemplateColumns: `240px minmax(0, 1fr)${session ? ` 6px ${paneWidth}px` : ""}` }}>
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
        <button onClick={() => void run()} disabled={running || emuActive}>
          Run
        </button>
        <button onClick={stop} disabled={!runId && !emuActive}>
          Stop
        </button>
        {language === "c" && (
          <>
            <select aria-label="Optimization" value={optLevel} onChange={(e) => setOptLevel(e.target.value as "O0" | "Og")}>
              <option value="O0">-O0 (as written)</option>
              <option value="Og">-Og (light optimization)</option>
            </select>
            <button onClick={() => void explore()} disabled={exploring || running}>
              Explore
            </button>
            <button onClick={() => void runEmulator()} disabled={!session || emuActive}>
              Run in emulator
            </button>
          </>
        )}
        {(isRiscv(language) || session) && (
          <span className="debug" role="group" aria-label="Stepping">
            <button onClick={debug((emu) => emu.step())} disabled={emuActive}>Step</button>
            <button onClick={debug((emu) => emu.back())} disabled={emuActive}>Step Back</button>
            <button onClick={debug((emu) => void emu.run())} disabled={emuActive}>Continue</button>
            <button onClick={debug((emu) => (term.reset(), emu.reset()))}>Reset</button>
          </span>
        )}
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
      <main style={{ gridColumn: 2 }}>
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
        <div className="editor" data-ready={mountedKey === `${store.current}|${language}|${ws.active}`}>
          {ws.active && has(ws.files, ws.active) ? (
            <Editor
              key={`${store.current}|${language}|${ws.active}`}
              theme="vs-dark"
              language={editorLanguage(ws.active, language)}
              value={ws.files[ws.active]}
              onChange={(value) => update((w) => ({ ...w, files: { ...w.files, [w.active!]: value ?? "" } }))}
              options={{ minimap: { enabled: false }, automaticLayout: true, glyphMargin: true }}
              onMount={(editor) => {
                editorRef.current = editor;
                decorations.current = null;
                const line = (e: monaco.editor.IEditorMouseEvent) => e.target.position?.lineNumber ?? 0;
                // Rows of the open file's line, unless the program no longer matches the source.
                const rowsOf = (n: number) => {
                  const current = sessionRef.current;
                  if (!current || (current.kind === "c" && !sameFiles(current.files, filesRef.current))) return undefined;
                  return current.program.lineRows.get(lineKey(current.kind === "riscv" ? "" : (activeRef.current ?? ""), n));
                };
                const focusOf = (n: number): Focus => ({ path: sessionRef.current?.kind === "riscv" ? "" : (activeRef.current ?? ""), line: n });
                editor.onMouseMove((e) => setHover(rowsOf(line(e)) ? focusOf(line(e)) : null));
                editor.onMouseLeave(() => setHover(null));
                editor.onMouseDown((e) => {
                  const rows = rowsOf(line(e));
                  if (!rows) return;
                  if (e.target.type === 2 || e.target.type === 3) {
                    // Gutter: toggle the first instruction of every separate run of this line's rows.
                    const starts = rows.filter((r, i) => i === 0 || r.index !== rows[i - 1].index + 1);
                    sessionRef.current?.emu.toggleBreakpoint(...starts.map((r) => r.addr));
                  } else setPinned(focusOf(line(e)));
                });
                if (reveal.current) {
                  editor.revealLineInCenter(reveal.current);
                  reveal.current = null;
                }
                setMountedKey(sessionKey);
                setEditorVersion((v) => v + 1);
              }}
            />
          ) : (
            <p className="empty">Open a file from the tree.</p>
          )}
        </div>
        <div className="statusbar">
          {(isRiscv(language) || session) && (
            <>
            {session && (
              <span role="status" aria-label="Machine status">
                {session.emu.statusText}
              </span>
            )}
            {sourceStale && (
              <span className="stale" role="note">
                The source changed since Explore, so the highlights are hidden.{" "}
                <button onClick={() => void explore()} disabled={exploring || running}>
                  Re-explore
                </button>
              </span>
            )}
            {resetNote && <span className="note">The program was reset because the source changed.</span>}
            {problems.length > 0 && (
              <section role="region" aria-label="Problems" className="problems">
                <ul>
                  {problems.map((e, i) => (
                    <li key={i}>
                      Line {e.line}: {e.message}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            </>
          )}
        </div>
        <TerminalPane term={term} />
      </main>
      {session && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the inspector"
            aria-valuenow={paneWidth}
            aria-valuemin={260}
            aria-valuemax={900}
            tabIndex={0}
            className="splitter"
            onPointerDown={(down) => {
              const startX = down.clientX;
              const startWidth = paneWidth;
              const move = (e: PointerEvent) => setPaneWidth(Math.max(260, Math.min(900, startWidth + startX - e.clientX)));
              const up = () => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setPaneWidth((w) => Math.min(900, w + 20));
              if (e.key === "ArrowRight") setPaneWidth((w) => Math.max(260, w - 20));
            }}
          />
          <aside className="inspector" role="complementary" aria-label="Inspector">
            <TabGroup
              label="Program views"
              fill={topTab !== "bits"}
              tabs={[
                { id: "assembly", label: "Assembly" },
                { id: "machine", label: "Machine" },
                { id: "bits", label: "Bits" },
              ]}
              active={topTab}
              onActive={setTopTab}
            >
              {(() => {
                const inspector: InspectorState = {
                  program: session.program,
                  emu: session.emu,
                  kind: session.kind,
                  sources: session.files,
                  selected,
                  focus: sourceStale ? null : focus,
                  showRuntime,
                  onShowRuntime: setShowRuntime,
                  actions,
                };
                if (topTab === "bits") return <BitsCard row={selected ?? pcRow} />;
                return (
                  <>
                    {topTab === "machine" ? <MachineTab s={inspector} /> : <AssemblyTab s={inspector} />}
                    {selected && (
                      <div className="dock">
                        <BitsCard row={selected} />
                      </div>
                    )}
                  </>
                );
              })()}
            </TabGroup>
            <TabGroup
              label="Machine state"
              tabs={[
                { id: "registers", label: "Registers" },
                { id: "memory", label: "Memory" },
              ]}
              active={bottomTab}
              onActive={setBottomTab}
            >
              {bottomTab === "memory" ? <MemoryTab emu={session.emu} view={memory} onView={setMemory} /> : <RegistersTab emu={session.emu} />}
            </TabGroup>
          </aside>
        </>
      )}
    </div>
  );
}

function editorLanguage(path: string, fallback: Language): string {
  if (/\.(s|S|asm)$/.test(path)) return ASM;
  if (path.endsWith(".hex")) return MACHINE;
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".c") || path.endsWith(".h")) return "c";
  if (/\.(cpp|cc|cxx|hpp)$/.test(path)) return "cpp";
  return path.includes(".") ? "plaintext" : LANGUAGES.find((l) => l.id === fallback)!.monaco;
}
