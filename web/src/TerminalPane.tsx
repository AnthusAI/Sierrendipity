import { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";
import { SquareTerminal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAppearance } from "./theme/appearance";
import { terminalTheme } from "./theme/editorThemes";

/** The terminal pane: a small title bar and the xterm surface, themed with the active color theme and mode. */
export function TerminalPane({ term }: { term: Terminal }) {
  const container = useRef<HTMLDivElement>(null);
  const { theme, mode } = useAppearance();
  const [untouched, setUntouched] = useState(true);
  useEffect(() => {
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container.current!);
    const refit = () => fit.fit();
    refit();
    const observer = new ResizeObserver(refit);
    observer.observe(container.current!);
    window.addEventListener("resize", refit);
    const written = term.onWriteParsed(() => setUntouched(false));
    return () => {
      observer.disconnect();
      written.dispose();
      window.removeEventListener("resize", refit);
    };
  }, [term]);
  // The terminal follows the theme in place: its contents and scrollback stay.
  useEffect(() => {
    term.options.theme = terminalTheme(theme, mode);
  }, [term, theme, mode]);
  return (
    <section className="flex h-[232px] shrink-0 flex-col border-t">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b bg-muted px-4 text-xs font-medium text-muted-foreground">
        <SquareTerminal aria-hidden className="size-3.5" /> Terminal
      </div>
      <div className="relative min-h-0 flex-1 bg-terminal">
        <div className="terminal h-full overflow-hidden bg-terminal px-4 py-1" role="region" aria-label="Terminal" ref={container} />
        {untouched && (
          <p className="pointer-events-none absolute left-4 top-1 font-mono text-[13px] text-muted-foreground">
            Press Run to see your program's output here.
          </p>
        )}
      </div>
    </section>
  );
}

const ESC = "\x1b[";
export const styles = {
  error: (text: string) => `${ESC}31m${text}${ESC}0m`,
  warning: (text: string) => `${ESC}33m${text}${ESC}0m`,
  note: (text: string) => `${ESC}90m${text}${ESC}0m`,
};

export const crlf = (text: string) => text.replace(/\r?\n/g, "\r\n");

/**
 * Terminal input design: the program's stdin is a pipe/pty on the server, so we treat the pane as a
 * line-buffered console. Typed characters are echoed locally (the server stream carries program
 * output only), Backspace edits the pending line, and Enter sends the whole line, newline included,
 * with POST /runs/{id}/stdin. Ctrl-D sends any pending text and then end-of-input
 * (`{data: "", eof: true}`); Ctrl-C asks to stop the run. Input is ignored while no run is active.
 * If the runner ever echoes input itself, set LOCAL_ECHO to false.
 */
export const LOCAL_ECHO = true;

interface LineInput {
  active: () => boolean;
  send: (line: string, eof?: boolean) => void;
  interrupt: () => void;
}

export function lineInput(term: Terminal, { active, send, interrupt }: LineInput) {
  let line = "";
  const subscription = term.onData((data) => {
    if (!active()) return;
    if (data.startsWith("\x1b")) return; // arrows and other escape sequences
    for (const char of data) {
      if (char === "\r") {
        if (LOCAL_ECHO) term.write("\r\n");
        send(line + "\n");
        line = "";
      } else if (char === "\x03") {
        line = "";
        interrupt();
      } else if (char === "\x04") {
        if (LOCAL_ECHO && line) term.write("\r\n");
        send(line, true);
        line = "";
      } else if (char === "\x7f") {
        if (line) {
          line = line.slice(0, -1);
          if (LOCAL_ECHO) term.write("\b \b");
        }
      } else if (char >= " ") {
        line += char;
        if (LOCAL_ECHO) term.write(char);
      }
    }
  });
  return {
    /** Drop the pending line (a run started or ended). */
    clear: () => {
      line = "";
    },
    dispose: () => subscription.dispose(),
  };
}
