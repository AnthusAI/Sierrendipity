import Editor from "@monaco-editor/react";
import { Terminal } from "@xterm/xterm";
import type * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import type { AsmError } from "@sierrendipity/explorer";
import { CircleAlert, Compass, Cpu, FastForward, FileCode2, Lightbulb, Loader2, LogOut, Play, Plus, RotateCcw, Settings as SettingsIcon, Square, StepBack, StepForward, X } from "lucide-react";
import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ConfirmDialog, PromptDialog } from "./dialogs";
import { SettingsDialog } from "./SettingsDialog";
import { useAppearance } from "./theme/appearance";
import { monacoThemeName, terminalTheme } from "./theme/editorThemes";
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
  /** The area switcher (Learn / Workspace), shown in the header. */
  nav?: ReactNode;
}

export function Ide({ config, user, getIdToken, onSignOut, nav }: Props) {
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
  const { theme: colorTheme, mode: colorMode } = useAppearance();
  const term = useMemo(
    () =>
      new Terminal({
        convertEol: false,
        fontSize: 13,
        fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, "Liberation Mono", monospace',
        theme: terminalTheme(colorTheme, colorMode),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  type Prompt = { kind: "project" | "file" | "folder" } | { kind: "rename" | "delete"; path: string };
  const [prompt, setPrompt] = useState<Prompt | null>(null);
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

  // Names come from dialogs (see `prompt` state); each handler receives the submitted text.
  const createProject = (typed: string) => {
    const name = typed.trim();
    if (!name) return;
    if (has(store.projects, name)) return setNotice(`A project named "${name}" already exists`);
    setNotice(undefined);
    setStore((s) => ({ current: name, projects: { ...s.projects, [name]: newProject() } }));
  };

  const newFile = (typed: string) => {
    const path = typed.trim();
    const problem = pathProblem(path) ?? pathConflict(ws, path);
    setNotice(problem ?? undefined);
    if (!problem) update((w) => withFile(w, path));
  };

  const newFolder = (typed: string) => {
    const path = typed.trim();
    const problem = pathProblem(path) ?? pathConflict(ws, path);
    setNotice(problem ?? undefined);
    if (!problem) update((w) => ({ ...w, folders: [...w.folders, path] }));
  };

  const rename = (path: string, typed: string) => {
    const to = typed.trim();
    if (to === path) return;
    const problem =
      pathProblem(to) ??
      (to.startsWith(path + "/") ? `Cannot move "${path}" into itself` : pathConflict(deletePath(ws, path), to));
    setNotice(problem ?? undefined);
    if (!problem) update((w) => renamePath(w, path, to));
  };

  const remove = (path: string) => update((w) => deletePath(w, path));

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

  const filesOpen = ws.open.filter((path) => has(ws.files, path));
  const editorKey = `${store.current}|${language}|${ws.active}`;
  const stepping = isRiscv(language) || !!session;
  const statusBadge = status === "ready" ? "success" : status === "error" ? "danger" : "warning";

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-chrome px-4 py-2 text-chrome-foreground">
        <strong className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Lightbulb aria-hidden className="size-5 text-link" /> Sierrendipity
        </strong>
        {nav}
        <Separator orientation="vertical" className="mx-1 h-5" />
        <NativeSelect aria-label="Project" className="max-w-64 truncate" value={store.current} onChange={(e) => setStore({ ...store, current: e.target.value })}>
          {Object.keys(store.projects).map((name) => (
            <option key={name}>{name}</option>
          ))}
        </NativeSelect>
        <Button variant="outline" size="sm" onClick={() => setPrompt({ kind: "project" })}>
          <Plus />New project
        </Button>
        <NativeSelect aria-label="Language" value={language} onChange={(e) => switchLanguage(e.target.value as Language)}>
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </NativeSelect>
        <span className="flex-1" />
        <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <span className="hidden xl:inline">Backend</span>
          <Badge variant={statusBadge}>
            <span aria-hidden className="size-1.5 rounded-full bg-current" />
            <span role="status" aria-label="Backend status">{status}</span>
          </Badge>
        </span>
        {devBackend(config) ? (
          <Badge>Dev backend</Badge>
        ) : (
          <span className="max-w-64 truncate text-[13px] text-muted-foreground">Signed in as {user}</span>
        )}
        {!devBackend(config) && (
          <Button variant="ghost" size="sm" onClick={onSignOut}>
            <LogOut />Sign out
          </Button>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
              <SettingsIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>
      </header>
      <div role="group" aria-label="Run controls" className="flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2">
        <Button onClick={() => void run()} disabled={running || emuActive}>
          <Play />Run
        </Button>
        <Button variant="outline" onClick={stop} disabled={!runId && !emuActive}>
          <Square />Stop
        </Button>
        {language === "c" && (
          <>
            <Separator orientation="vertical" className="mx-1 h-5" />
            <NativeSelect aria-label="Optimization" value={optLevel} onChange={(e) => setOptLevel(e.target.value as "O0" | "Og")}>
              <option value="O0">-O0 (as written)</option>
              <option value="Og">-Og (light optimization)</option>
            </NativeSelect>
            <Button variant="secondary" onClick={() => void explore()} disabled={exploring || running}>
              {exploring ? <Loader2 className="animate-spin" /> : <Compass />}Explore
            </Button>
            <Button variant="secondary" onClick={() => void runEmulator()} disabled={!session || emuActive}>
              <Cpu />Run in emulator
            </Button>
          </>
        )}
        {stepping && (
          <>
            <Separator orientation="vertical" className="mx-1 h-5" />
            <span className="flex items-center gap-1" role="group" aria-label="Stepping">
              <Button variant="outline" onClick={debug((emu) => emu.step())} disabled={emuActive}>
                <StepForward />Step
              </Button>
              <Button variant="outline" onClick={debug((emu) => emu.back())} disabled={emuActive}>
                <StepBack />Step Back
              </Button>
              <Button variant="outline" onClick={debug((emu) => void emu.run())} disabled={emuActive}>
                <FastForward />Continue
              </Button>
              <Button variant="ghost" onClick={debug((emu) => (term.reset(), emu.reset()))}>
                <RotateCcw />Reset
              </Button>
            </span>
          </>
        )}
      </div>
      <div className="empty:hidden">
        {status === "starting" && (
          <Alert variant="info">
            <Loader2 aria-hidden className="size-4 animate-spin" /> Starting your workspace… this can take up to a minute.
          </Alert>
        )}
        {status === "error" && (
          <Alert variant="danger" role="alert">
            <CircleAlert aria-hidden className="size-4 shrink-0" />
            <span>{statusMessage ?? "Your workspace could not start."}</span>
            <Button variant="outline" size="sm" className="ml-2" onClick={() => void backend.warm().then(() => backend.stopStale(), () => {})}>
              Retry
            </Button>
          </Alert>
        )}
        {notice && (
          <Alert variant="danger" role="alert">
            <CircleAlert aria-hidden className="size-4 shrink-0" /> {notice}
          </Alert>
        )}
        {saveFailed && (
          <Alert variant="danger" role="alert">
            <CircleAlert aria-hidden className="size-4 shrink-0" /> Your projects could not be saved in this browser; changes may be lost on reload.
          </Alert>
        )}
      </div>
      <div
        className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)]"
        style={{ gridTemplateColumns: `208px minmax(0, 1fr)${session ? ` 8px ${paneWidth}px` : ""}` }}
      >
        <FileTree
          workspace={ws}
          onOpen={(path) => update((w) => ({ ...w, open: w.open.includes(path) ? w.open : [...w.open, path], active: path }))}
          onNewFile={() => setPrompt({ kind: "file" })}
          onNewFolder={() => setPrompt({ kind: "folder" })}
          onRename={(path) => setPrompt({ kind: "rename", path })}
          onDelete={(path) => setPrompt({ kind: "delete", path })}
        />
        <main className="flex min-h-0 min-w-0 flex-col">
          <div role="tablist" aria-label="Open files" className="flex min-h-10 shrink-0 items-end gap-1 overflow-x-auto border-b bg-muted px-2 pt-1">
            {filesOpen.map((path) => {
              const active = path === ws.active;
              return (
                <span
                  key={path}
                  className={cn(
                    "-mb-px flex h-8 max-w-72 shrink-0 items-center rounded-t-md border border-b-0 pl-3 pr-1 text-sm transition-colors",
                    active ? "border-border bg-editor text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <button
                    role="tab"
                    aria-selected={active}
                    title={path}
                    className="min-w-0 truncate whitespace-nowrap rounded-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    onClick={() => update((w) => ({ ...w, active: path }))}
                  >
                    {path}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ml-1 size-6 text-muted-foreground hover:text-foreground"
                    aria-label={`Close ${path}`}
                    onClick={() => update((w) => ({ ...w, open: w.open.filter((p) => p !== path), active: w.active === path ? (w.open.filter((p) => p !== path).at(-1) ?? null) : w.active }))}
                  >
                    <X className="!size-3.5" />
                  </Button>
                </span>
              );
            })}
          </div>
          <div className="editor min-h-0 min-w-0 flex-1 overflow-hidden bg-editor" data-ready={mountedKey === editorKey}>
            {ws.active && has(ws.files, ws.active) ? (
              <Editor
                key={editorKey}
                theme={monacoThemeName(colorTheme, colorMode)}
                language={editorLanguage(ws.active, language)}
                value={ws.files[ws.active]}
                onChange={(value) => update((w) => ({ ...w, files: { ...w.files, [w.active!]: value ?? "" } }))}
                options={{
                  minimap: { enabled: false },
                  automaticLayout: true,
                  glyphMargin: true,
                  fontSize: 13,
                  fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, "Liberation Mono", monospace',
                  padding: { top: 8 },
                  scrollBeyondLastLine: false,
                  renderLineHighlight: "line",
                }}
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
                setMountedKey(`${store.current}|${language}|${ws.active}`);
                setEditorVersion((v) => v + 1);
              }}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <FileCode2 aria-hidden className="size-8" />
                <p className="font-medium text-foreground">Open a file from the tree.</p>
                <p className="text-[13px]">Or create one with New file.</p>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 shrink-0 border-t bg-chrome px-4 py-1.5 text-[13px] empty:hidden">
            {stepping && (
              <>
                {session && (
                  <span role="status" aria-label="Machine status" className="font-medium">
                    {session.emu.statusText}
                  </span>
                )}
                {sourceStale && (
                  <span className="flex items-center gap-2 rounded-md bg-warning-bg px-2 py-0.5 text-warning-fg" role="note">
                    The source changed since Explore, so the highlights are hidden.{" "}
                    <Button variant="outline" size="sm" className="h-6" onClick={() => void explore()} disabled={exploring || running}>
                      Re-explore
                    </Button>
                  </span>
                )}
                {resetNote && <span className="text-muted-foreground">The program was reset because the source changed.</span>}
                {problems.length > 0 && (
                  <section role="region" aria-label="Problems" className="w-full rounded-md bg-danger-bg px-3 py-1.5 text-danger-fg">
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
              className="group flex cursor-col-resize justify-center focus-visible:bg-accent"
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
            >
              <span className="h-full w-px bg-border transition-colors group-hover:w-0.5 group-hover:bg-ring group-focus-visible:w-0.5 group-focus-visible:bg-ring" />
            </div>
            <aside className="flex min-h-0 min-w-0 flex-col border-l bg-background" role="complementary" aria-label="Inspector">
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
                      <div className="max-h-[45%] flex-none overflow-auto border-t pt-2">
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
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      {prompt?.kind === "project" && (
        <PromptDialog title="New project" label="Project name" confirm="Create" onCancel={() => setPrompt(null)} onSubmit={(name) => (setPrompt(null), createProject(name))} />
      )}
      {prompt?.kind === "file" && (
        <PromptDialog
          title="New file"
          description="Use / in the name to put the file in a folder."
          label="File path"
          confirm="Create"
          onCancel={() => setPrompt(null)}
          onSubmit={(path) => (setPrompt(null), newFile(path))}
        />
      )}
      {prompt?.kind === "folder" && (
        <PromptDialog title="New folder" label="Folder path" confirm="Create" onCancel={() => setPrompt(null)} onSubmit={(path) => (setPrompt(null), newFolder(path))} />
      )}
      {prompt?.kind === "rename" && (
        <PromptDialog
          title="Rename"
          label="New path"
          initial={prompt.path}
          confirm="Rename"
          onCancel={() => setPrompt(null)}
          onSubmit={(to) => (setPrompt(null), rename(prompt.path, to))}
        />
      )}
      {prompt?.kind === "delete" && (
        <ConfirmDialog
          title="Delete file"
          description={`Delete ${prompt.path}?`}
          confirm="Delete"
          onCancel={() => setPrompt(null)}
          onConfirm={() => (setPrompt(null), remove(prompt.path))}
        />
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
