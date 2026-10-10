// rustc's messages about parts of `std` that the emulator's `std` (the `sier` crate) lacks are rewritten into
// a friendlier one: "This is not available in the emulator yet: std::collections::HashMap".

const SUPPORTED = {
  modules: [
    "any", "array", "ascii", "borrow", "boxed", "cell", "char", "clone", "cmp", "collections", "convert", "default",
    "f32", "f64", "fmt", "hash", "hint", "i8", "i16", "i32", "i64", "i128", "io", "isize", "iter", "marker", "mem",
    "num", "ops", "option", "pin", "prelude", "process", "ptr", "rc", "result", "slice", "str", "string", "u8", "u16",
    "u32", "u64", "u128", "usize", "vec",
  ],
  collections: ["BTreeMap", "BTreeSet", "BinaryHeap", "LinkedList", "VecDeque", "binary_heap", "btree_map", "btree_set", "linked_list", "vec_deque"],
};

export const SUPPORTED_SUMMARY =
  "The emulator supports println!, print!, eprintln!, format!, vec!, String, Vec, Box, Rc, " +
  "std::collections::{BTreeMap, BTreeSet, BinaryHeap, VecDeque, LinkedList}, std::io (stdin, stdout, stderr), " +
  "std::process::exit, and std::fmt, cmp, mem, iter, ops, option, result, str, char and the number types. " +
  "Not available: HashMap and HashSet, threads, files, networking, time, environment variables.";

// The errors rustc gives for a path that does not resolve.
const PATH_ERRORS = ["E0432", "E0433", "E0425", "E0412", "E0405", "E0423", "E0574"];

/** The first `std::` path that is not supported, cut after its first missing segment; undefined if there is none. */
function missingItem(path: string): string | undefined {
  const segments = path.split("::").filter((s) => s !== "");
  if (segments[0] !== "std" || segments.length < 2) return undefined;
  if (!SUPPORTED.modules.includes(segments[1]) && !/^[{]/.test(segments[1])) return `std::${segments[1]}`;
  if (segments[1] === "collections" && segments.length > 2 && !SUPPORTED.collections.includes(segments[2])) {
    return `std::collections::${segments[2]}`;
  }
  return undefined;
}

/** Rewrite the diagnostics about unsupported std items; everything else is left as rustc wrote it. */
export function friendlyRustErrors(output: string): string {
  if (!output.includes("std")) return output;
  // Diagnostics are separated by blank lines; the header of each starts with "error".
  return output
    .split(/\n\n/)
    .map((block) => {
      const header = /^error\[(E\d+)\]: (.*)/.exec(block);
      if (!header || !PATH_ERRORS.includes(header[1])) return block;
      // The path comes from rustc's own wording when it quotes one, otherwise from the source line it shows.
      const quoted = [...header[2].matchAll(/`(std::[^`]*)`/g)].map((m) => m[1]);
      const shown = [...block.matchAll(/^\s*\d+ \|.*?\b(std(?:::[A-Za-z_][A-Za-z0-9_]*)+)/gm)].map((m) => m[1]);
      let item: string | undefined;
      for (const candidate of [...quoted, ...shown]) {
        item = missingItem(candidate);
        if (item) break;
      }
      // A quoted `std::...` path that rustc could not resolve is missing even if our table has its module.
      if (!item && quoted.length > 0 && header[1] === "E0432") item = quoted[0];
      if (!item) return block;
      const rest = block.slice(block.indexOf("\n"));
      return `error[${header[1]}]: This is not available in the emulator yet: ${item}${rest}\n   = note: ${SUPPORTED_SUMMARY}`;
    })
    .join("\n\n");
}
