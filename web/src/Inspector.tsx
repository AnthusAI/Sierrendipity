import { decode, registerName, type Field } from "@sierrendipity/explorer";
import { memo, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type UIEvent } from "react";
import type { Emulator } from "./emulator";
import { groupRows, hex32, wordBytes, type Group, type Program, type Row } from "./program";

/** Stable callbacks, so memoised rows do not re-render on every Step. */
export interface Actions {
  select: (row: Row) => void;
  hover: (row: Row | null) => void;
  toggleBreakpoint: (row: Row) => void;
  openChip: (path: string, line: number) => void;
}

// Shared state of the right-hand pane, owned by the IDE.
export interface InspectorState {
  program: Program;
  emu: Emulator;
  /** `kind` decides how the Assembly tab lists rows: grouped by C line, or flat with the word. */
  kind: "c" | "riscv";
  /** Every source file the program was built from. */
  sources: Record<string, string>;
  selected: Row | null;
  /** The source line whose rows are highlighted (hovered, else pinned by a click or selection). */
  focus: { path: string; line: number } | null;
  showRuntime: boolean;
  onShowRuntime: (show: boolean) => void;
  actions: Actions;
}

export interface TabSpec {
  id: string;
  label: string;
}

/** An ARIA tab strip with roving focus: arrows, Home and End move and select. */
export function TabGroup({ label, tabs, active, onActive, fill, children }: {
  label: string;
  tabs: TabSpec[];
  active: string;
  onActive: (id: string) => void;
  /** The panel lays out its own scrolling list instead of scrolling as a whole. */
  fill?: boolean;
  children: ReactNode;
}) {
  const prefix = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const target = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    onActive(tabs[target].id);
    buttons.current[target]?.focus();
  };
  return (
    <section className="tabgroup">
      <div role="tablist" aria-label={label} className="inspector-tabs">
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            ref={(el) => (buttons.current[i] = el)}
            role="tab"
            id={`${prefix}-${tab.id}`}
            aria-selected={tab.id === active}
            aria-controls={`${prefix}-panel`}
            tabIndex={tab.id === active ? 0 : -1}
            onClick={() => onActive(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${prefix}-panel`} aria-labelledby={`${prefix}-${active}`} className={fill ? "panel fill" : "panel"}>
        {children}
      </div>
    </section>
  );
}

// Windowing: long lists render only the rows in view (plus a margin) between two spacers.

const ROW_HEIGHT = 24;
const WINDOW_THRESHOLD = 300;
const MARGIN = 12;

function useWindow(count: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 600 });
  useLayoutEffect(() => {
    if (ref.current) setView((v) => ({ ...v, height: ref.current!.clientHeight || v.height }));
  }, [count]);
  const windowed = count > WINDOW_THRESHOLD;
  const start = windowed ? Math.max(0, Math.floor(view.top / ROW_HEIGHT) - MARGIN) : 0;
  const end = windowed ? Math.min(count, Math.ceil((view.top + view.height) / ROW_HEIGHT) + MARGIN) : count;
  return {
    ref,
    start,
    end,
    padTop: start * ROW_HEIGHT,
    padBottom: (count - end) * ROW_HEIGHT,
    onScroll: windowed ? (e: UIEvent<HTMLElement>) => setView({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight }) : undefined,
  };
}

// Registers

export function RegistersTab({ emu }: { emu: Emulator }) {
  const m = emu.machine;
  return (
    <>
      <p className="regs-summary">
        PC <output aria-label="PC">{hex32(m.pc)}</output> · Steps <output aria-label="Steps">{m.steps}</output>
      </p>
      <table className="regs">
        <thead>
          <tr>
            <th>Register</th>
            <th>Hex</th>
            <th>Signed</th>
            <th>Last step</th>
          </tr>
        </thead>
        <tbody>
          {Array.from(m.regs, (value, i) => {
            const changed = emu.changed.has(i);
            return (
              <tr key={i} data-reg={registerName(i)} data-changed={changed}>
                <th scope="row">
                  {registerName(i)} <small>x{i}</small>
                </th>
                <td>{hex32(value)}</td>
                <td>{value | 0}</td>
                <td>{changed ? <mark>changed</mark> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

// Memory

const ROWS = 8;
export type Follow = "write" | "sp" | "pc" | "address";
export interface MemoryView {
  follow: Follow;
  address: string;
}

/** Parse the address box: hex digits with an optional 0x. Unsigned math throughout. */
export function parseAddress(text: string, size: number): { value: number; problem?: string } {
  const t = text.trim();
  if (t === "") return { value: 0 };
  if (!/^(0x)?[0-9a-f]+$/i.test(t)) return { value: 0, problem: `"${t}" is not a hex address (digits 0-9 and a-f, optional 0x prefix)` };
  const digits = t.replace(/^0x/i, "");
  const value = digits.length > 8 ? Infinity : parseInt(digits, 16);
  if (value >= size) return { value: size - 1, problem: `${hex32(Math.min(value, 2 ** 32 - 1))} is beyond the end of memory (last address ${hex32(size - 1)}); showing the end` };
  return { value };
}

export function MemoryTab({ emu, view, onView }: { emu: Emulator; view: MemoryView; onView: (view: MemoryView) => void }) {
  const m = emu.machine;
  const size = emu.program.memorySize;
  const parsed = parseAddress(view.address, size);
  const target =
    view.follow === "sp" ? m.regs[2] : view.follow === "pc" ? m.pc : view.follow === "address" ? parsed.value : (emu.lastWrite?.addr ?? m.regs[2]);
  const start = Math.max(0, Math.min(size - ROWS * 16, Math.floor(Math.min(target, size - 1) / 16) * 16 - 32));
  const bytes = m.readMem(start, ROWS * 16);
  const written = emu.lastWrite;
  const isWritten = (a: number) => !!written && a >= written.addr && a < written.addr + written.length;
  const problem = view.follow === "address" ? parsed.problem : undefined;
  return (
    <>
      <div className="mem-controls">
        <label>
          Follow{" "}
          <select value={view.follow} onChange={(e) => onView({ ...view, follow: e.target.value as Follow })}>
            <option value="write">Last write</option>
            <option value="sp">Stack pointer (sp)</option>
            <option value="pc">Program counter (pc)</option>
            <option value="address">Address</option>
          </select>
        </label>
        <label>
          Address{" "}
          <input
            value={view.address}
            size={12}
            placeholder="0x… (hex)"
            aria-invalid={!!problem}
            onChange={(e) => onView({ follow: "address", address: e.target.value })}
          />
        </label>
      </div>
      {problem && <p role="alert" className="field-error">{problem}</p>}
      <p className="legend">
        <span className="swatch written" /> Bytes in this colour were written by the last store.
      </p>
      <table className="memory">
        <tbody>
          {Array.from({ length: ROWS }, (_, r) => {
            const base = start + r * 16;
            const row = Array.from(bytes.slice(r * 16, r * 16 + 16));
            return (
              <tr key={base}>
                <th scope="row">{hex32(base)}</th>
                {row.map((b, i) => {
                  const a = base + i;
                  const hit = isWritten(a);
                  return (
                    <td
                      key={i}
                      data-addr={hex32(a)}
                      data-written={hit}
                      className={hit ? "written" : undefined}
                      aria-label={`${hex32(a)}: ${b.toString(16).padStart(2, "0")}${hit ? ", written" : ""}`}
                    >
                      {b.toString(16).padStart(2, "0")}
                    </td>
                  );
                })}
                <td className="ascii">{row.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

// Assembly

interface InstrRowProps {
  row: Row;
  kind: "c" | "riscv";
  pc: boolean;
  breakpoint: boolean;
  linked: boolean;
  selected: boolean;
  actions: Actions;
}

const InstrRow = memo(function InstrRow({ row, kind, pc, breakpoint, linked, selected, actions }: InstrRowProps) {
  return (
    <div className="item">
      <button
        className="instr"
        data-linked={linked}
        data-line={row.line || undefined}
        aria-pressed={selected}
        aria-current={pc ? "step" : undefined}
        onClick={() => actions.select(row)}
        onMouseEnter={() => actions.hover(row)}
        onMouseLeave={() => actions.hover(null)}
      >
        <span className="addr">{hex32(row.addr)}</span>
        {kind === "riscv" && <span className="word">{hex32(row.word)}</span>}
        <span className="text">{row.text}</span>
        {kind === "riscv" && row.line > 0 && <small>line {row.line}</small>}
        {pc && <mark>PC</mark>}
      </button>
      <button
        className="bp"
        aria-label={`Toggle breakpoint at ${hex32(row.addr)}`}
        aria-pressed={breakpoint}
        onClick={() => actions.toggleBreakpoint(row)}
      >
        {breakpoint ? "● breakpoint" : "○"}
      </button>
    </div>
  );
});

type Item = { kind: "chip"; group: Group; id: string; open: boolean } | { kind: "row"; row: Row };

function chipTitle(group: Group, sources: Record<string, string>, multi: boolean) {
  if (!group.line) return `Runtime: ${group.fn}`;
  const text = (sources[group.path]?.split("\n")[group.line - 1] ?? "").trim();
  const place = multi ? `${group.path}:${group.line}` : `Line ${group.line}`;
  return `${place}${group.parts > 1 ? ` (part ${group.part} of ${group.parts})` : ""}: ${text}`;
}

function RuntimeToggle({ s }: { s: InspectorState }) {
  return (
    <label className="runtime-toggle">
      <input type="checkbox" checked={s.showRuntime} onChange={(e) => s.onShowRuntime(e.target.checked)} /> Show runtime
    </label>
  );
}

const isLinked = (s: InspectorState, row: Row) => !!s.focus && row.line !== 0 && row.line === s.focus.line && row.path === s.focus.path;

export function AssemblyTab({ s }: { s: InspectorState }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const multi = s.program.paths.length > 1;
  const items = useMemo<Item[]>(() => {
    if (s.kind === "riscv") return s.program.rows.map((row) => ({ kind: "row", row }));
    const list: Item[] = [];
    groupRows(s.program.rows).forEach((group, i) => {
      if (!group.line && !s.showRuntime) return;
      const id = `${group.key}:${group.part}:${i}`;
      const open = !collapsed.has(id);
      list.push({ kind: "chip", group, id, open });
      if (open) for (const row of group.rows) list.push({ kind: "row", row });
    });
    return list;
  }, [s.program, s.kind, s.showRuntime, collapsed]);
  const w = useWindow(items.length);
  const pc = s.emu.machine.pc;
  return (
    <>
      {s.kind === "c" && <RuntimeToggle s={s} />}
      {s.kind === "c" && !s.program.rows.some((r) => r.line) && !s.showRuntime && (
        <p className="hint">This program has no user code to show. Turn on "Show runtime" to see the runtime instructions.</p>
      )}
      {s.kind === "riscv" && s.program.rows.length === 0 && <p className="hint">The program is empty. Write some code to see it here.</p>}
      <div className="vlist" ref={w.ref} onScroll={w.onScroll}>
        <div style={{ height: w.padTop }} />
        {items.slice(w.start, w.end).map((item) =>
          item.kind === "chip" ? (
            <div className="item" key={item.id}>
              <button
                className="chip"
                data-chip-line={item.group.line || undefined}
                aria-expanded={item.open}
                onClick={() => {
                  setCollapsed((c) => (c.delete(item.id) ? new Set(c) : new Set(c).add(item.id)));
                  if (item.group.line) s.actions.openChip(item.group.path, item.group.line);
                }}
              >
                {item.open ? "▾" : "▸"} {chipTitle(item.group, s.sources, multi)}
              </button>
            </div>
          ) : (
            <InstrRow
              key={item.row.index}
              row={item.row}
              kind={s.kind}
              pc={item.row.addr === pc}
              breakpoint={s.emu.breakpoints.has(item.row.addr)}
              linked={isLinked(s, item.row)}
              selected={s.selected?.index === item.row.index}
              actions={s.actions}
            />
          ),
        )}
        <div style={{ height: w.padBottom }} />
      </div>
    </>
  );
}

// Machine

const binary = (word: number) => (word >>> 0).toString(2).padStart(32, "0").replace(/(.{4})(?=.)/g, "$1 ");

const MachineRow = memo(function MachineRow({ row, linked, selected, actions }: { row: Row; linked: boolean; selected: boolean; actions: Actions }) {
  return (
    <tr
      data-machine-row
      data-linked={linked}
      data-selected={selected}
      onClick={() => actions.select(row)}
      onMouseEnter={() => actions.hover(row)}
      onMouseLeave={() => actions.hover(null)}
    >
      <td>
        <button className="machine-select" aria-pressed={selected} onClick={(e) => (e.stopPropagation(), actions.select(row))}>
          {hex32(row.addr)}
        </button>
      </td>
      <td data-bytes>{wordBytes(row.word).map((b) => b.toString(16).padStart(2, "0")).join(" ")}</td>
      <td data-word>{hex32(row.word)}</td>
      <td data-binary>{binary(row.word)}</td>
      <td>{row.text}</td>
    </tr>
  );
});

export function MachineTab({ s }: { s: InspectorState }) {
  const rows = useMemo(() => s.program.rows.filter((r) => s.kind === "riscv" || !r.runtime || s.showRuntime), [s.program, s.kind, s.showRuntime]);
  const w = useWindow(rows.length);
  return (
    <>
      {s.kind === "c" && <RuntimeToggle s={s} />}
      <div className="vlist" ref={w.ref} onScroll={w.onScroll}>
        <table className="machine">
          <thead>
            <tr>
              <th>Address</th>
              <th>Bytes in memory</th>
              <th>Word (hex)</th>
              <th>Word (binary)</th>
              <th>Instruction</th>
            </tr>
          </thead>
          <tbody>
            {w.padTop > 0 && <tr style={{ height: w.padTop }} />}
            {rows.slice(w.start, w.end).map((row) => (
              <MachineRow key={row.index} row={row} linked={isLinked(s, row)} selected={s.selected?.index === row.index} actions={s.actions} />
            ))}
            {w.padBottom > 0 && <tr style={{ height: w.padBottom }} />}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Bits

const COLOURS = ["#4e79a7", "#f28e2b", "#59a14f", "#b07aa1", "#e15759", "#76b7b2", "#edc948"];

/** The 32 bits drawn as one coloured, text-labelled segment per field; scattered fields share a colour. */
export function BitsCard({ row }: { row: Row | undefined }) {
  const decoded = row && decode(row.word);
  if (!row) return <p className="hint">Select an instruction to see its bits.</p>;
  if (!decoded) return <p className="hint">{row.text}: this word is not an RV32IM instruction.</p>;
  const names = [...new Set(decoded.fields.map((f) => f.name))];
  const colour = (name: string) => COLOURS[names.indexOf(name) % COLOURS.length];
  const fields = [...decoded.fields].sort((a, b) => b.hi - a.hi);
  const bitsOf = (f: Field) => (row.word >>> 0).toString(2).padStart(32, "0").slice(31 - f.hi, 32 - f.lo);
  return (
    <div role="group" aria-label="Bits" className="bits-card">
      <p className="bits-text">
        {decoded.text} <small>({decoded.format}-type, {hex32(row.word)})</small>
      </p>
      <div className="segments">
        {fields.map((f, i) => (
          <div
            key={i}
            data-segment
            role="img"
            aria-label={`${f.name}, bits ${f.hi} to ${f.lo}, ${f.label}`}
            style={{ flexGrow: f.hi - f.lo + 1, background: colour(f.name) }}
          >
            <span className="seg-name">{f.name}</span>
            <code>{bitsOf(f)}</code>
            <small>{f.hi === f.lo ? f.hi : `${f.hi}:${f.lo}`}</small>
          </div>
        ))}
      </div>
      <ul className="seg-legend">
        {names.map((name) => {
          const parts = decoded.fields.filter((f) => f.name === name);
          return (
            <li key={name}>
              <span className="swatch" style={{ background: colour(name) }} />
              <span data-segment-label>{parts[0].label.replace(/\s*\(bits? [^)]*\)$/, "")}</span>
              <small> (bits {[...parts].sort((a, b) => b.hi - a.hi).map((f) => (f.hi === f.lo ? f.hi : `${f.hi}:${f.lo}`)).join(", ")})</small>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
