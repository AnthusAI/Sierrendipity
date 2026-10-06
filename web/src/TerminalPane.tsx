import { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";

export function TerminalPane({ term }: { term: Terminal }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container.current!);
    const refit = () => fit.fit();
    refit();
    window.addEventListener("resize", refit);
    return () => window.removeEventListener("resize", refit);
  }, [term]);
  return <div className="terminal" role="region" aria-label="Terminal" ref={container} />;
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
