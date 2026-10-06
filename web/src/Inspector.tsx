import { decode, registerName, type Field } from "@sierrendipity/explorer";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Emulator } from "./emulator";
import { groupRows, hex32, wordBytes, type Group, type Program, type Row } from "./program";

// Shared state of the right-hand pane, owned by the IDE.
export interface InspectorState {
  program: Program;
  emu: Emulator;
  /** `kind` decides how the Assembly tab lists rows: grouped by C line, or flat with the word. */
  kind: "c" | "riscv";
  sourceLines: string[];
  selected: Row | null;
  /** The source line whose rows are highlighted (hovered, else pinned by a click or selection). */
  focusLine: number;
  showRuntime: boolean;
  onShowRuntime: (show: boolean) => void;
  onSelect: (row: Row) => void;
  onHover: (line: number | null) => void;
}

export interface TabSpec {
  id: string;
  label: string;
}

/** An ARIA tab strip with roving focus: arrows, Home and End move and select. */
export function TabGroup({ label, tabs, active, onActive, children }: {
  label: string;
  tabs: TabSpec[];
  active: string;
  onActive: (id: string) => void;
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
      <div role="tabpanel" id={`${prefix}-panel`} aria-labelledby={`${prefix}-${active}`} className="panel">
        {children}
      </div>
    </section>
  );
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
type Follow = "write" | "sp" | "pc" | "address";

export function MemoryTab({ emu }: { emu: Emulator }) {
  const [follow, setFollow] = useState<Follow>("write");
  const [address, setAddress] = useState("0x0");
  const m = emu.machine;
  const size = emu.program.memorySize;
  const target =
    follow === "sp" ? m.regs[2] : follow === "pc" ? m.pc : follow === "address" ? parseInt(address, 16) || parseInt(address) || 0 : (emu.lastWrite?.addr ?? m.regs[2]);
  const start = Math.max(0, Math.min(size - ROWS * 16, (target & ~15) - 32));
  const bytes = m.readMem(start, ROWS * 16);
  const written = emu.lastWrite;
  const isWritten = (a: number) => !!written && a >= written.addr && a < written.addr + written.length;
  return (
    <>
      <div className="mem-controls">
        <label>
          Follow{" "}
          <select value={follow} onChange={(e) => setFollow(e.target.value as Follow)}>
            <option value="write">Last write</option>
            <option value="sp">Stack pointer (sp)</option>
            <option value="pc">Program counter (pc)</option>
            <option value="address">Address</option>
          </select>
        </label>
        <label>
          Address{" "}
          <input
            value={address}
            size={10}
            onChange={(e) => {
              setAddress(e.target.value);
              setFollow("address");
            }}
          />
        </label>
      </div>
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

function InstrRow({ row, s }: { row: Row; s: InspectorState }) {
  const pc = s.emu.machine.pc === row.addr;
  const breakpoint = s.emu.breakpoints.has(row.addr);
  const linked = row.line !== 0 && row.line === s.focusLine;
  return (
    <li>
      <button
        className="instr"
        data-linked={linked}
        data-selected={s.selected?.index === row.index}
        aria-pressed={s.selected?.index === row.index}
        aria-current={pc ? "step" : undefined}
        onClick={() => s.onSelect(row)}
        onMouseEnter={() => row.line && s.onHover(row.line)}
        onMouseLeave={() => s.onHover(null)}
      >
        <span className="addr">{hex32(row.addr)}</span>
        {s.kind === "riscv" && <span className="word">{hex32(row.word)}</span>}
        <span className="text">{row.text}</span>
        {s.kind === "riscv" && row.line > 0 && <small>line {row.line}</small>}
        {pc && <mark>PC</mark>}
      </button>
      <button
        className="bp"
        aria-label={`Toggle breakpoint at ${hex32(row.addr)}`}
        aria-pressed={breakpoint}
        onClick={() => s.emu.toggleBreakpoint(row.addr)}
      >
        {breakpoint ? "● breakpoint" : "○"}
      </button>
    </li>
  );
}

function GroupView({ group, s }: { group: Group; s: InspectorState }) {
  const [open, setOpen] = useState(true);
  const lineText = group.line ? (s.sourceLines[group.line - 1] ?? "").trim() : "";
  const title = group.line
    ? `Line ${group.line}${group.parts > 1 ? ` (part ${group.part} of ${group.parts})` : ""}: ${lineText}`
    : `Runtime: ${group.fn}`;
  return (
    <section className="group" data-group-line={group.line || undefined} data-group-runtime={!group.line || undefined}>
      <button className="chip" data-chip-line={group.line || undefined} aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} {title}
      </button>
      {open && (
        <ul>
          {group.rows.map((row) => (
            <InstrRow key={row.index} row={row} s={s} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RuntimeToggle({ s }: { s: InspectorState }) {
  return (
    <label className="runtime-toggle">
      <input type="checkbox" checked={s.showRuntime} onChange={(e) => s.onShowRuntime(e.target.checked)} /> Show runtime
    </label>
  );
}

export function AssemblyTab({ s }: { s: InspectorState }) {
  if (s.kind === "riscv") {
    return (
      <ul className="instrs">
        {s.program.rows.map((row) => (
          <InstrRow key={row.index} row={row} s={s} />
        ))}
      </ul>
    );
  }
  const groups = groupRows(s.program.rows).filter((g) => g.line || s.showRuntime);
  return (
    <>
      <RuntimeToggle s={s} />
      {groups.map((g, i) => (
        <GroupView key={`${g.key}:${g.part}:${i}`} group={g} s={s} />
      ))}
    </>
  );
}

// Machine

const binary = (word: number) => (word >>> 0).toString(2).padStart(32, "0").replace(/(.{4})(?=.)/g, "$1 ");

export function MachineTab({ s }: { s: InspectorState }) {
  const rows = s.program.rows.filter((r) => s.kind === "riscv" || !r.runtime || s.showRuntime);
  return (
    <>
      {s.kind === "c" && <RuntimeToggle s={s} />}
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
          {rows.map((row) => (
            <tr
              key={row.index}
              data-machine-row
              data-linked={row.line !== 0 && row.line === s.focusLine}
              data-selected={s.selected?.index === row.index}
              aria-selected={s.selected?.index === row.index}
              onClick={() => s.onSelect(row)}
              onMouseEnter={() => row.line && s.onHover(row.line)}
              onMouseLeave={() => s.onHover(null)}
            >
              <td>{hex32(row.addr)}</td>
              <td data-bytes>{wordBytes(row.word).map((b) => b.toString(16).padStart(2, "0")).join(" ")}</td>
              <td data-word>{hex32(row.word)}</td>
              <td data-binary>{binary(row.word)}</td>
              <td>{row.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
            aria-label={`${f.name}, bits ${f.hi} to ${f.lo}, value ${f.label}`}
            style={{ flexGrow: f.hi - f.lo + 1, background: colour(f.name) }}
          >
            <span className="seg-name">{f.name}</span>
            <code>{bitsOf(f)}</code>
            <small>
              {f.hi === f.lo ? f.hi : `${f.hi}:${f.lo}`}
            </small>
          </div>
        ))}
      </div>
      <ul className="seg-legend">
        {names.map((name) => {
          const parts = decoded.fields.filter((f) => f.name === name);
          return (
            <li key={name}>
              <span className="swatch" style={{ background: colour(name) }} />
              <span data-segment-label>
                {parts[0].label.replace(/\s*\(bits? [^)]*\)$/, "")}
              </span>
              <small> (bits {[...parts].sort((a, b) => b.hi - a.hi).map((f) => (f.hi === f.lo ? f.hi : `${f.hi}:${f.lo}`)).join(", ")})</small>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
