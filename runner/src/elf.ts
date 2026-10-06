// A small, bounds-checked reader for the two things POST /explain needs from a linked RV32 ELF:
// its loadable segments and symbols, and the DWARF (version 2-5) line table. The ELF comes from a
// toolchain that ran student input (inline asm can write arbitrary debug sections), so every read is
// checked and a malformed file raises ElfError instead of looping or reading out of bounds.

export class ElfError extends Error {}

class Reader {
  pos: number;
  constructor(
    readonly buf: Buffer,
    pos = 0,
  ) {
    this.pos = pos;
  }
  private need(n: number): void {
    if (this.pos < 0 || this.pos + n > this.buf.length) throw new ElfError("read out of bounds");
  }
  u8(): number {
    this.need(1);
    return this.buf[this.pos++];
  }
  s8(): number {
    const v = this.u8();
    return v > 127 ? v - 256 : v;
  }
  u16(): number {
    this.need(2);
    const v = this.buf.readUInt16LE(this.pos);
    this.pos += 2;
    return v;
  }
  u32(): number {
    this.need(4);
    const v = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    return v;
  }
  uleb(): number {
    let result = 0;
    let shift = 0;
    for (;;) {
      const byte = this.u8();
      result += (byte & 0x7f) * 2 ** shift;
      if (!(byte & 0x80)) return result;
      shift += 7;
      if (shift > 49) throw new ElfError("LEB128 too long");
    }
  }
  sleb(): number {
    let result = 0;
    let shift = 0;
    for (;;) {
      const byte = this.u8();
      result += (byte & 0x7f) * 2 ** shift;
      shift += 7;
      if (!(byte & 0x80)) return byte & 0x40 ? result - 2 ** shift : result;
      if (shift > 49) throw new ElfError("LEB128 too long");
    }
  }
  cstr(): string {
    const end = this.buf.indexOf(0, this.pos);
    if (end < 0) throw new ElfError("unterminated string");
    const s = this.buf.toString("utf8", this.pos, end);
    this.pos = end + 1;
    return s;
  }
  skip(n: number): void {
    this.need(n);
    this.pos += n;
  }
}

export interface Segment {
  paddr: number;
  offset: number;
  filesz: number;
}
export interface FuncSymbol {
  name: string;
  addr: number;
  size: number;
}
export interface Elf {
  buf: Buffer;
  entry: number;
  /** PT_LOAD segments that occupy file bytes. */
  segments: Segment[];
  functions: FuncSymbol[];
  symbols: Map<string, number>;
  section(name: string): Buffer | undefined;
}

const EM_RISCV = 243;
const PT_LOAD = 1;
const STT_FUNC = 2;

export function parseElf(buf: Buffer): Elf {
  const h = new Reader(buf);
  if (buf.length < 52 || buf.readUInt32BE(0) !== 0x7f454c46 || buf[4] !== 1 || buf[5] !== 1) throw new ElfError("not a 32-bit little-endian ELF");
  h.pos = 18;
  if (h.u16() !== EM_RISCV) throw new ElfError("not a RISC-V ELF");
  h.pos = 24;
  const entry = h.u32();
  const phoff = h.u32();
  const shoff = h.u32();
  h.pos = 42;
  const phentsize = h.u16();
  const phnum = h.u16();
  const shentsize = h.u16();
  const shnum = h.u16();
  const shstrndx = h.u16();
  if (phentsize < 32 || shentsize < 40 || phnum > 64 || shnum > 256) throw new ElfError("unexpected ELF layout");

  const segments: Segment[] = [];
  for (let i = 0; i < phnum; i++) {
    const r = new Reader(buf, phoff + i * phentsize);
    const type = r.u32();
    const offset = r.u32();
    r.u32(); // vaddr
    const paddr = r.u32();
    const filesz = r.u32();
    if (type === PT_LOAD && filesz > 0) {
      if (offset + filesz > buf.length) throw new ElfError("segment out of bounds");
      segments.push({ paddr, offset, filesz });
    }
  }

  type Section = { name: number; type: number; offset: number; size: number; link: number };
  const sections: Section[] = [];
  for (let i = 0; i < shnum; i++) {
    const r = new Reader(buf, shoff + i * shentsize);
    const name = r.u32();
    const type = r.u32();
    r.skip(8); // flags, addr
    const offset = r.u32();
    const size = r.u32();
    const link = r.u32();
    sections.push({ name, type, offset, size, link });
  }
  const bytesOf = (s: Section | undefined): Buffer | undefined => {
    if (!s || s.type === 8 /* NOBITS */) return undefined;
    if (s.offset + s.size > buf.length) throw new ElfError("section out of bounds");
    return buf.subarray(s.offset, s.offset + s.size);
  };
  const names = bytesOf(sections[shstrndx]);
  const nameOf = (strtab: Buffer | undefined, offset: number): string => {
    if (!strtab || offset >= strtab.length) return "";
    const end = strtab.indexOf(0, offset);
    return strtab.toString("utf8", offset, end < 0 ? strtab.length : end);
  };
  const byName = new Map<string, Section>();
  for (const s of sections) byName.set(nameOf(names, s.name), s);

  const functions: FuncSymbol[] = [];
  const symbols = new Map<string, number>();
  const symtab = byName.get(".symtab");
  const symbolBytes = bytesOf(symtab);
  if (symtab && symbolBytes) {
    const strtab = bytesOf(sections[symtab.link]);
    for (let off = 0; off + 16 <= symbolBytes.length; off += 16) {
      const name = nameOf(strtab, symbolBytes.readUInt32LE(off));
      const addr = symbolBytes.readUInt32LE(off + 4);
      const size = symbolBytes.readUInt32LE(off + 8);
      const type = symbolBytes[off + 12] & 0xf;
      if (name) symbols.set(name, addr);
      if (type === STT_FUNC && size > 0 && name) functions.push({ name, addr, size });
    }
  }
  functions.sort((a, b) => a.addr - b.addr);
  return { buf, entry, segments, functions, symbols, section: (n) => bytesOf(byName.get(n)) };
}

// ---- DWARF line table ----

export interface LineRow {
  addr: number;
  /** The file's path as the line table spells it (directory joined with name). */
  file: string;
  line: number;
  column: number;
  isStmt: boolean;
}

/** Rows of one contiguous run of code, ascending by address; `end` is the first address after it. */
export interface Sequence {
  rows: LineRow[];
  end: number;
}

const MAX_ROWS = 1_000_000;

export function parseLineTable(lineSection: Buffer, lineStrSection: Buffer | undefined): Sequence[] {
  const out: Sequence[] = [];
  const total = { rows: 0 };
  for (let pos = 0; pos < lineSection.length; ) {
    const r = new Reader(lineSection, pos);
    const length = r.u32();
    if (length === 0xffffffff) throw new ElfError("64-bit DWARF is not supported");
    const end = r.pos + length;
    if (end > lineSection.length) throw new ElfError("line table unit out of bounds");
    parseUnit(new Reader(lineSection.subarray(0, end), r.pos), lineStrSection, out, total);
    pos = end;
  }
  return out;
}

const DW_FORM = { block: 0x09, data1: 0x0b, data2: 0x05, data4: 0x06, data8: 0x07, data16: 0x1e, string: 0x08, udata: 0x0f, lineStrp: 0x1f };
const DW_LNCT = { path: 1, directoryIndex: 2 };

function readForm(r: Reader, form: number, lineStr: Buffer | undefined): string | number {
  switch (form) {
    case DW_FORM.string:
      return r.cstr();
    case DW_FORM.lineStrp: {
      const offset = r.u32();
      if (!lineStr || offset >= lineStr.length) throw new ElfError("bad string offset");
      return new Reader(lineStr, offset).cstr();
    }
    case DW_FORM.udata:
      return r.uleb();
    case DW_FORM.data1:
      return r.u8();
    case DW_FORM.data2:
      return r.u16();
    case DW_FORM.data4:
      return r.u32();
    case DW_FORM.data8:
      r.skip(8);
      return 0;
    case DW_FORM.data16:
      r.skip(16);
      return 0;
    case DW_FORM.block:
      r.skip(r.uleb());
      return 0;
    default:
      throw new ElfError(`unsupported DWARF form 0x${form.toString(16)}`);
  }
}

function entryTable(r: Reader, lineStr: Buffer | undefined): { path: string; dir: number }[] {
  const formats: [number, number][] = [];
  for (let n = r.u8(); n > 0; n--) formats.push([r.uleb(), r.uleb()]);
  const count = r.uleb();
  if (count > 100_000) throw new ElfError("implausible file table");
  const entries: { path: string; dir: number }[] = [];
  for (let i = 0; i < count; i++) {
    const entry = { path: "", dir: 0 };
    for (const [type, form] of formats) {
      const value = readForm(r, form, lineStr);
      if (type === DW_LNCT.path) entry.path = String(value);
      else if (type === DW_LNCT.directoryIndex) entry.dir = Number(value);
    }
    entries.push(entry);
  }
  return entries;
}

function parseUnit(r: Reader, lineStr: Buffer | undefined, out: Sequence[], total: { rows: number }): void {
  const version = r.u16();
  if (version < 2 || version > 5) throw new ElfError(`unsupported line table version ${version}`);
  if (version >= 5) r.skip(2); // address size, segment selector size
  const headerLength = r.u32();
  const programStart = r.pos + headerLength;
  const minInst = r.u8();
  if (version >= 4) r.u8(); // maximum operations per instruction
  const defaultIsStmt = r.u8() !== 0;
  const lineBase = r.s8();
  const lineRange = r.u8();
  const opcodeBase = r.u8();
  if (lineRange === 0 || opcodeBase === 0) throw new ElfError("bad line table header");
  const stdLengths = [0];
  for (let i = 1; i < opcodeBase; i++) stdLengths.push(r.u8());

  let dirs: string[];
  let files: { path: string; dir: number }[];
  if (version >= 5) {
    dirs = entryTable(r, lineStr).map((e) => e.path);
    files = entryTable(r, lineStr);
  } else {
    dirs = ["."]; // directory 0 is the compilation directory
    for (let d = r.cstr(); d !== ""; d = r.cstr()) dirs.push(d);
    files = [{ path: "", dir: 0 }]; // file numbers start at 1
    for (let f = r.cstr(); f !== ""; f = r.cstr()) {
      const dir = r.uleb();
      r.uleb();
      r.uleb();
      files.push({ path: f, dir });
    }
  }
  const pathOf = (index: number): string => {
    const f = files[index];
    if (!f) return "";
    return f.path.startsWith("/") ? f.path : `${dirs[f.dir] ?? "."}/${f.path}`;
  };

  r.pos = programStart;
  let addr = 0;
  let file = 1;
  let line = 1;
  let column = 0;
  let isStmt = defaultIsStmt;
  let rows: LineRow[] = [];
  const reset = () => {
    addr = 0;
    file = 1;
    line = 1;
    column = 0;
    isStmt = defaultIsStmt;
    rows = [];
  };
  const emit = () => {
    if (++total.rows > MAX_ROWS) throw new ElfError("line table too large");
    rows.push({ addr, file: pathOf(file), line, column, isStmt });
  };
  reset();
  while (r.pos < r.buf.length) {
    const op = r.u8();
    if (op >= opcodeBase) {
      const adjusted = op - opcodeBase;
      addr += Math.floor(adjusted / lineRange) * minInst;
      line += lineBase + (adjusted % lineRange);
      emit();
    } else if (op === 0) {
      const len = r.uleb();
      if (len === 0) continue;
      const next = r.pos + len;
      const sub = r.u8();
      if (sub === 1) {
        if (rows.length > 0) out.push({ rows, end: addr });
        reset();
      } else if (sub === 2) {
        addr = len - 1 === 4 ? r.u32() : 0;
      }
      r.pos = next;
    } else {
      switch (op) {
        case 1: // copy
          emit();
          break;
        case 2:
          addr += r.uleb() * minInst;
          break;
        case 3:
          line += r.sleb();
          break;
        case 4:
          file = r.uleb();
          break;
        case 5:
          column = r.uleb();
          break;
        case 6:
          isStmt = !isStmt;
          break;
        case 8:
          addr += Math.floor((255 - opcodeBase) / lineRange) * minInst;
          break;
        case 9:
          addr += r.u16();
          break;
        default: // basic_block, prologue_end, epilogue_begin, set_isa and unknown ones: skip operands
          for (let i = 0; i < stdLengths[op]; i++) r.uleb();
      }
    }
  }
}

/**
 * The row covering `addr`: the last row at the greatest row address not above it, preferring a
 * statement row among rows at that same address. Undefined if no sequence covers the address.
 */
export function rowAt(sequences: Sequence[], addr: number): LineRow | undefined {
  for (const seq of sequences) {
    if (addr < seq.rows[0].addr || addr >= seq.end) continue;
    let lo = 0;
    let hi = seq.rows.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (seq.rows[mid].addr <= addr) lo = mid;
      else hi = mid - 1;
    }
    const at = seq.rows[lo].addr;
    const best = seq.rows[lo];
    for (let i = lo; i >= 0 && seq.rows[i].addr === at; i--) {
      if (seq.rows[i].isStmt) return seq.rows[i];
    }
    return best;
  }
  return undefined;
}
