// A small demangler for Rust's v0 symbol scheme (`_RNvCs...`), which rustc 1.99 emits by default (the
// legacy `_ZN...17h<hash>E` scheme needs `-Z unstable-options`). The names come from a program the student
// controls (`#[export_name]`, `global_asm!`), so every read is bounds-checked, work is capped, and anything
// unreadable is shown as the plain symbol rather than raising.
//
// The output is for beginners, not for tools: generic arguments are left out (`alloc::vec::Vec::push`, not
// `<alloc::vec::Vec<u8>>::push`), disambiguators and the instantiating crate are hidden, and an inherent
// impl on a named type reads as a path. A trait impl reads `<main::Point as core::fmt::Display>::fmt`.

export interface RustSymbol {
  /** The readable name. */
  name: string;
  /** The crate the item is defined in (the first crate root of its path), e.g. "main", "core", "std". */
  crate: string;
}

const MAX_STEPS = 20_000;
const MAX_TEXT = 2_000;
const MAX_DEPTH = 80;
const MAX_NAME = 300;

class Bad extends Error {}

const BASIC: Record<string, string> = {
  a: "i8", b: "bool", c: "char", d: "f64", e: "str", f: "f32", h: "u8", i: "isize", j: "usize", l: "i32",
  m: "u32", n: "i128", o: "u128", s: "i16", t: "u16", u: "()", v: "...", x: "i64", y: "u64", z: "!", p: "_",
};

interface Ty {
  text: string;
  isPath: boolean;
}

class Parser {
  i = 0;
  steps = 0;
  depth = 0;
  crate: string | undefined;
  constructor(readonly s: string) {}

  private peek(): string {
    return this.s[this.i] ?? "";
  }
  private next(): string {
    if (this.i >= this.s.length) throw new Bad("end");
    return this.s[this.i++];
  }
  private expect(c: string): void {
    if (this.next() !== c) throw new Bad(`expected ${c}`);
  }
  private tick(): void {
    if (++this.steps > MAX_STEPS) throw new Bad("too much work");
  }
  private text(t: string): string {
    if (t.length > MAX_TEXT) throw new Bad("too long");
    return t;
  }

  /** <base-62-number>: "_" is 0, otherwise the digits' value plus one. */
  private number62(): number {
    if (this.peek() === "_") {
      this.i++;
      return 0;
    }
    let value = 0;
    let digits = 0;
    for (;;) {
      const c = this.next();
      if (c === "_") return value + 1;
      const d = c >= "0" && c <= "9" ? c.charCodeAt(0) - 48 : c >= "a" && c <= "z" ? c.charCodeAt(0) - 87 : c >= "A" && c <= "Z" ? c.charCodeAt(0) - 29 : -1;
      if (d < 0) throw new Bad("bad base 62");
      value = value * 62 + d; // crate disambiguators are 64-bit hashes: the value only matters when small
      if (++digits > 24) throw new Bad("number too long");
    }
  }

  private decimal(): number {
    let any = false;
    let n = 0;
    while (this.peek() >= "0" && this.peek() <= "9") {
      n = n * 10 + (this.next().charCodeAt(0) - 48);
      any = true;
      if (n > 1e6) throw new Bad("number too large");
    }
    if (!any) throw new Bad("expected a number");
    return n;
  }

  /** [<disambiguator>] <undisambiguated-identifier>; returns the name and the disambiguator index (0 if absent). */
  private identifier(): { name: string; index: number } {
    let index = 0;
    if (this.peek() === "s") {
      this.i++;
      index = this.number62() + 1;
    }
    return { name: this.undisambiguated(), index };
  }

  private undisambiguated(): string {
    if (this.peek() === "u") this.i++; // punycode: shown as its encoded bytes
    const length = this.decimal();
    if (this.peek() === "_") this.i++;
    if (this.i + length > this.s.length) throw new Bad("identifier out of bounds");
    const name = this.s.slice(this.i, this.i + length);
    this.i += length;
    return name;
  }

  /** Run `f` with the parser moved to a back-reference's target, then return to where it was. */
  private backref<T>(f: () => T): T {
    const at = this.i - 1; // the position of the 'B'
    const target = this.number62();
    const after = this.i;
    if (target >= at) throw new Bad("backref must point backwards");
    this.i = target;
    if (++this.depth > MAX_DEPTH) throw new Bad("too deep");
    try {
      return f();
    } finally {
      this.depth--;
      this.i = after;
    }
  }

  path(): string {
    this.tick();
    if (++this.depth > MAX_DEPTH) throw new Bad("too deep");
    try {
      const c = this.next();
      switch (c) {
        case "C": {
          const { name } = this.identifier();
          this.crate ??= name;
          return name;
        }
        case "M": {
          this.implPath();
          const t = this.ty();
          return this.text(t.isPath ? t.text : `<${t.text}>`);
        }
        case "X": {
          this.implPath();
          const t = this.ty();
          const trait = this.path();
          return this.text(`<${t.text} as ${trait}>`);
        }
        case "Y": {
          const t = this.ty();
          const trait = this.path();
          return this.text(`<${t.text} as ${trait}>`);
        }
        case "N": {
          const ns = this.next();
          const parent = this.path();
          const { name, index } = this.identifier();
          if (ns === "C") return this.text(`${parent}::{closure#${index}}`);
          if (ns === "S") return this.text(`${parent}::{shim:${name}#${index}}`);
          if (ns >= "A" && ns <= "Z") return this.text(`${parent}::{${ns}:${name}#${index}}`);
          return this.text(name === "" ? `${parent}::{#${index}}` : `${parent}::${name}`);
        }
        case "I": {
          const generic = this.path();
          while (this.peek() !== "E") this.genericArg();
          this.expect("E");
          return generic; // the arguments are parsed (to stay in step) but not shown
        }
        case "B":
          return this.backref(() => this.path());
        default:
          throw new Bad(`unexpected ${c} in a path`);
      }
    } finally {
      this.depth--;
    }
  }

  private implPath(): void {
    if (this.peek() === "s") {
      this.i++;
      this.number62();
    }
    this.path();
  }

  private genericArg(): void {
    this.tick();
    if (this.peek() === "L") {
      this.i++;
      this.number62();
    } else if (this.peek() === "K") {
      this.i++;
      this.constant();
    } else this.ty();
  }

  private constant(): string {
    this.tick();
    const c = this.peek();
    if (c === "p") {
      this.i++;
      return "_";
    }
    if (c === "B") {
      this.i++;
      return this.backref(() => this.constant());
    }
    const t = this.ty();
    let negative = false;
    if (this.peek() === "n") {
      this.i++;
      negative = true;
    }
    let hex = "";
    while (this.peek() !== "_") {
      const d = this.next();
      if (!/[0-9a-f]/.test(d)) throw new Bad("bad constant");
      hex += d;
      if (hex.length > 64) throw new Bad("constant too long");
    }
    this.i++;
    const value = hex === "" ? 0n : BigInt("0x" + hex);
    if (t.text === "bool") return value === 0n ? "false" : "true";
    return (negative ? "-" : "") + value.toString();
  }

  private lifetimeOpt(): void {
    if (this.peek() === "L") {
      this.i++;
      this.number62();
    }
  }

  private binderOpt(): void {
    if (this.peek() === "G") {
      this.i++;
      this.number62();
    }
  }

  ty(): Ty {
    this.tick();
    if (++this.depth > MAX_DEPTH) throw new Bad("too deep");
    try {
      const c = this.peek();
      if (c in BASIC) {
        this.i++;
        return { text: BASIC[c], isPath: false };
      }
      this.i++;
      switch (c) {
        case "A": {
          const element = this.ty();
          const length = this.constant();
          return { text: this.text(`[${element.text}; ${length}]`), isPath: false };
        }
        case "S":
          return { text: this.text(`[${this.ty().text}]`), isPath: false };
        case "T": {
          const parts: string[] = [];
          while (this.peek() !== "E") parts.push(this.ty().text);
          this.expect("E");
          return { text: this.text(parts.length === 1 ? `(${parts[0]},)` : `(${parts.join(", ")})`), isPath: false };
        }
        case "R":
        case "Q": {
          this.lifetimeOpt();
          return { text: this.text(`${c === "R" ? "&" : "&mut "}${this.ty().text}`), isPath: false };
        }
        case "P":
          return { text: this.text(`*const ${this.ty().text}`), isPath: false };
        case "O":
          return { text: this.text(`*mut ${this.ty().text}`), isPath: false };
        case "F": {
          this.binderOpt();
          let prefix = "";
          if (this.peek() === "U") {
            this.i++;
            prefix += "unsafe ";
          }
          if (this.peek() === "K") {
            this.i++;
            const abi = this.peek() === "C" ? (this.i++, "C") : this.undisambiguated();
            prefix += `extern "${abi}" `;
          }
          const args: string[] = [];
          while (this.peek() !== "E") args.push(this.ty().text);
          this.expect("E");
          const ret = this.ty().text;
          return { text: this.text(`${prefix}fn(${args.join(", ")})${ret === "()" ? "" : ` -> ${ret}`}`), isPath: false };
        }
        case "D": {
          this.binderOpt();
          const traits: string[] = [];
          while (this.peek() !== "E") {
            traits.push(this.path());
            while (this.peek() === "p") {
              this.i++;
              this.undisambiguated();
              this.ty();
            }
          }
          this.expect("E");
          this.lifetimeOpt();
          return { text: this.text(`dyn ${traits.join(" + ")}`), isPath: false };
        }
        case "B":
          return this.backref(() => this.ty());
        case "C":
        case "M":
        case "X":
        case "Y":
        case "N":
        case "I":
          this.i--;
          return { text: this.path(), isPath: true };
        default:
          throw new Bad(`unexpected ${c} in a type`);
      }
    } finally {
      this.depth--;
    }
  }
}

/** The readable name and defining crate of a v0 symbol; undefined if it is not one or cannot be read. */
export function parseRustSymbol(symbol: string): RustSymbol | undefined {
  if (!symbol.startsWith("_R") || symbol.length > 4000) return undefined;
  let body = symbol.slice(2);
  body = body.replace(/^[0-9]+/, ""); // an encoding version number, should there ever be one
  const parser = new Parser(body);
  try {
    const name = parser.path();
    if (parser.crate === undefined) return undefined;
    return { name: name.length > MAX_NAME ? name.slice(0, MAX_NAME) + "..." : name, crate: parser.crate };
  } catch (error) {
    if (error instanceof Bad) {
      if (process.env.DEMANGLE_DEBUG) console.error(error.message, body, parser.i);
      return undefined;
    }
    throw error;
  }
}

/** The readable name of a symbol; a symbol that is not v0 (or is unreadable) is returned as it is, shortened. */
export function demangleRust(symbol: string): string {
  return parseRustSymbol(symbol)?.name ?? (symbol.length > MAX_NAME ? symbol.slice(0, MAX_NAME) + "..." : symbol);
}
