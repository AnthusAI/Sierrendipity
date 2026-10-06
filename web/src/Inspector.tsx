import { decode, registerName, type Field } from "@sierrendipity/explorer";
import { ChevronDown, ChevronRight } from "lucide-react";
import { memo, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type UIEvent } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
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

// Shared look of the dense tables: monospace, 24px rows on the 8px grid.
const TABLE = "w-full border-collapse font-mono text-[13px]";
const HEAD = "sticky top-0 z-10 bg-background px-2 py-1 text-left font-sans text-xs font-semibold text-muted-foreground";
const CELL = "px-2 py-0.5 text-left font-normal";
const HINT = "text-muted-foreground";

/** An ARIA tab strip (Radix Tabs: roving focus, arrows, Home and End move and select). */
export function TabGroup({ label, tabs, active, onActive, fill, children }: {
  label: string;
  tabs: TabSpec[];
  active: string;
  onActive: (id: string) => void;
  /** The panel lays out its own scrolling list instead of scrolling as a whole. */
  fill?: boolean;
  children: ReactNode;
}) {
  return (
    <Tabs value={active} onValueChange={onActive} className="flex min-h-0 flex-1 basis-0 flex-col overflow-hidden border-b last:border-b-0">
      <TabsList aria-label={label}>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={active} className={cn("min-h-0 flex-1 overflow-auto p-3 text-[13px]", fill && "flex flex-col overflow-hidden")}>
        {children}
      </TabsContent>
    </Tabs>
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
      <p className={cn(HINT, "mb-2 flex items-center gap-4")}>
        <span>
          PC <output aria-label="PC" className="font-mono text-foreground">{hex32(m.pc)}</output>
        </span>
        <span>
          Steps <output aria-label="Steps" className="font-mono text-foreground">{m.steps}</output>
        </span>
      </p>
      <table className={TABLE}>
        <thead>
          <tr>
            <th className={HEAD}>Register</th>
            <th className={HEAD}>Hex</th>
            <th className={HEAD}>Signed</th>
            <th className={HEAD}>Last step</th>
          </tr>
        </thead>
        <tbody>
          {Array.from(m.regs, (value, i) => {
            const changed = emu.changed.has(i);
            return (
              <tr key={i} data-reg={registerName(i)} data-changed={changed} className="data-[changed=true]:bg-changed">
                <th scope="row" className={cn(CELL, "font-medium")}>
                  {registerName(i)} <small className={HINT}>x{i}</small>
                </th>
                <td className={CELL}>{hex32(value)}</td>
                <td className={CELL}>{value | 0}</td>
                <td className={CELL}>{changed ? <mark className="bg-transparent font-sans font-semibold text-changed-foreground">changed</mark> : null}</td>
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
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2">
          Follow{" "}
          <NativeSelect className="h-7 text-[13px]" value={view.follow} onChange={(e) => onView({ ...view, follow: e.target.value as Follow })}>
            <option value="write">Last write</option>
            <option value="sp">Stack pointer (sp)</option>
            <option value="pc">Program counter (pc)</option>
            <option value="address">Address</option>
          </NativeSelect>
        </label>
        <label className="flex items-center gap-2">
          Address{" "}
          <Input
            className="h-7 w-32 font-mono text-[13px]"
            value={view.address}
            size={12}
            placeholder="0x… (hex)"
            aria-invalid={!!problem}
            onChange={(e) => onView({ follow: "address", address: e.target.value })}
          />
        </label>
      </div>
      {problem && <p role="alert" className="mb-2 rounded-md bg-danger-bg px-2 py-1 text-danger-fg">{problem}</p>}
      <p className={cn(HINT, "mb-2")}>
        <span className="mr-2 inline-block size-3 rounded-sm bg-primary align-middle" /> Bytes in this colour were written by the last store.
      </p>
      <table className={cn(TABLE, "text-center")}>
        <tbody>
          {Array.from({ length: ROWS }, (_, r) => {
            const base = start + r * 16;
            const row = Array.from(bytes.slice(r * 16, r * 16 + 16));
            return (
              <tr key={base}>
                <th scope="row" className={cn(CELL, "font-medium text-muted-foreground")}>{hex32(base)}</th>
                {row.map((b, i) => {
                  const a = base + i;
                  const hit = isWritten(a);
                  return (
                    <td
                      key={i}
                      data-addr={hex32(a)}
                      data-written={hit}
                      className="px-1 py-0.5 text-center data-[written=true]:rounded-sm data-[written=true]:bg-primary data-[written=true]:text-primary-foreground"
                      aria-label={`${hex32(a)}: ${b.toString(16).padStart(2, "0")}${hit ? ", written" : ""}`}
                    >
                      {b.toString(16).padStart(2, "0")}
                    </td>
                  );
                })}
                <td className={cn(CELL, "tracking-wider text-muted-foreground")}>{row.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("")}</td>
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
    <div className="item flex h-6 items-center gap-1">
      <button
        className="instr flex h-6 min-w-0 flex-1 items-center gap-3 rounded-md border border-transparent px-2 text-left font-mono text-[13px] outline-none transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring data-[linked=true]:bg-linked aria-[current=step]:bg-pc aria-pressed:border-ring"
        data-linked={linked}
        data-line={row.line || undefined}
        aria-pressed={selected}
        aria-current={pc ? "step" : undefined}
        onClick={() => actions.select(row)}
        onMouseEnter={() => actions.hover(row)}
        onMouseLeave={() => actions.hover(null)}
      >
        <span className="text-muted-foreground">{hex32(row.addr)}</span>
        {kind === "riscv" && <span className="text-muted-foreground">{hex32(row.word)}</span>}
        <span className="truncate">{row.text}</span>
        {kind === "riscv" && row.line > 0 && <small className="text-muted-foreground">line {row.line}</small>}
        {pc && <mark className="rounded bg-pc-mark px-1.5 font-sans text-xs font-semibold text-pc-mark-foreground">PC</mark>}
      </button>
      <button
        className={cn(
          "bp h-6 shrink-0 rounded-md px-1.5 text-xs outline-none transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
          breakpoint ? "font-medium text-bp-text" : "text-muted-foreground",
        )}
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
  const id = useId();
  return (
    <div className="mb-2 flex items-center gap-2">
      <Checkbox id={id} checked={s.showRuntime} onCheckedChange={(checked) => s.onShowRuntime(checked === true)} />
      <Label htmlFor={id} className="font-normal">Show runtime</Label>
    </div>
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
        <p className={HINT}>This program has no user code to show. Turn on "Show runtime" to see the runtime instructions.</p>
      )}
      {s.kind === "riscv" && s.program.rows.length === 0 && <p className={HINT}>The program is empty. Write some code to see it here.</p>}
      <div className="vlist min-h-20 flex-1 basis-0 overflow-auto" ref={w.ref} onScroll={w.onScroll}>
        <div style={{ height: w.padTop }} />
        {items.slice(w.start, w.end).map((item) =>
          item.kind === "chip" ? (
            <div className="item flex h-6 items-center" key={item.id}>
              <button
                className="chip flex h-6 min-w-0 flex-1 items-center gap-1 rounded-md bg-secondary px-2 text-left text-[13px] font-medium text-secondary-foreground outline-none transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                data-chip-line={item.group.line || undefined}
                aria-expanded={item.open}
                onClick={() => {
                  setCollapsed((c) => (c.delete(item.id) ? new Set(c) : new Set(c).add(item.id)));
                  if (item.group.line) s.actions.openChip(item.group.path, item.group.line);
                }}
              >
                {item.open ? <ChevronDown aria-hidden className="size-3.5 shrink-0" /> : <ChevronRight aria-hidden className="size-3.5 shrink-0" />}
                <span className="truncate">{chipTitle(item.group, s.sources, multi)}</span>
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
      className="h-6 cursor-pointer transition-colors hover:bg-accent data-[linked=true]:bg-linked data-[selected=true]:outline data-[selected=true]:-outline-offset-1 data-[selected=true]:outline-ring"
      onClick={() => actions.select(row)}
      onMouseEnter={() => actions.hover(row)}
      onMouseLeave={() => actions.hover(null)}
    >
      <td className={CELL}>
        <button
          className="rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:font-semibold aria-pressed:text-link"
          aria-pressed={selected}
          onClick={(e) => (e.stopPropagation(), actions.select(row))}
        >
          {hex32(row.addr)}
        </button>
      </td>
      <td className={CELL} data-bytes>{wordBytes(row.word).map((b) => b.toString(16).padStart(2, "0")).join(" ")}</td>
      <td className={CELL} data-word>{hex32(row.word)}</td>
      <td className={cn(CELL, "text-muted-foreground")} data-binary>{binary(row.word)}</td>
      <td className={CELL}>{row.text}</td>
    </tr>
  );
});

export function MachineTab({ s }: { s: InspectorState }) {
  const rows = useMemo(() => s.program.rows.filter((r) => s.kind === "riscv" || !r.runtime || s.showRuntime), [s.program, s.kind, s.showRuntime]);
  const w = useWindow(rows.length);
  return (
    <>
      {s.kind === "c" && <RuntimeToggle s={s} />}
      <div className="vlist min-h-20 flex-1 basis-0 overflow-auto" ref={w.ref} onScroll={w.onScroll}>
        <table className={cn(TABLE, "whitespace-nowrap")}>
          <thead>
            <tr>
              <th className={HEAD}>Address</th>
              <th className={HEAD}>Bytes in memory</th>
              <th className={HEAD}>Word (hex)</th>
              <th className={HEAD}>Word (binary)</th>
              <th className={HEAD}>Instruction</th>
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

const FIELD_COUNT = 7;

/** The 32 bits drawn as one coloured, text-labelled segment per field; scattered fields share a colour. */
export function BitsCard({ row }: { row: Row | undefined }) {
  const decoded = row && decode(row.word);
  if (!row) return <p className={HINT}>Select an instruction to see its bits.</p>;
  if (!decoded) return <p className={HINT}>{row.text}: this word is not an RV32IM instruction.</p>;
  const names = [...new Set(decoded.fields.map((f) => f.name))];
  // The palette tokens --field-1..7 come from the active theme (see theme/palette.ts).
  const colour = (name: string) => `var(--field-${(names.indexOf(name) % FIELD_COUNT) + 1})`;
  const fields = [...decoded.fields].sort((a, b) => b.hi - a.hi);
  const bitsOf = (f: Field) => (row.word >>> 0).toString(2).padStart(32, "0").slice(31 - f.hi, 32 - f.lo);
  return (
    <div role="group" aria-label="Bits" className="bits-card">
      <p className="bits-text my-1 font-mono text-base">
        {decoded.text} <small className={cn(HINT, "text-xs")}>({decoded.format}-type, {hex32(row.word)})</small>
      </p>
      <div className="flex gap-0.5">
        {fields.map((f, i) => (
          <div
            key={i}
            data-segment
            role="img"
            aria-label={`${f.name}, bits ${f.hi} to ${f.lo}, ${f.label}`}
            className="flex min-w-0 flex-col items-center overflow-hidden rounded-md px-0.5 py-1 text-field-foreground"
            style={{ flexGrow: f.hi - f.lo + 1, background: colour(f.name) }}
          >
            <span className="text-xs font-semibold">{f.name}</span>
            <code className="break-all text-center text-xs">{bitsOf(f)}</code>
            <small className="text-xs">{f.hi === f.lo ? f.hi : `${f.hi}:${f.lo}`}</small>
          </div>
        ))}
      </div>
      <ul className="my-2 grid gap-0.5">
        {names.map((name) => {
          const parts = decoded.fields.filter((f) => f.name === name);
          return (
            <li key={name} className="flex items-center">
              <span className="mr-2 inline-block size-3 shrink-0 rounded-sm border border-border" style={{ background: colour(name) }} />
              <span data-segment-label>{parts[0].label.replace(/\s*\(bits? [^)]*\)$/, "")}</span>
              <small className={cn(HINT, "ml-1")}> (bits {[...parts].sort((a, b) => b.hi - a.hi).map((f) => (f.hi === f.lo ? f.hi : `${f.hi}:${f.lo}`)).join(", ")})</small>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
