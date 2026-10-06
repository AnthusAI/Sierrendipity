import type { AsmError } from "./asm.ts";

/**
 * Parse machine code typed by a learner: 32-bit words as hex (0x... or bare 8 digits) or binary
 * (0b..., with underscores or spaces between groups). Words are separated by whitespace.
 */
export function parseMachineCode(text: string): { words: number[]; errors: AsmError[] } {
  const words: number[] = [];
  const errors: AsmError[] = [];

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const comment = raw.search(/#|\/\//);
    const code = comment >= 0 ? raw.slice(0, comment) : raw;
    const fail = (column: number, message: string) => errors.push({ line, column, message });

    let pos = 0;
    while (pos < code.length) {
      if (/\s/.test(code[pos]!)) {
        pos++;
        continue;
      }
      const column = pos + 1;
      if (/^0[bB]/.test(code.slice(pos, pos + 2))) {
        let count = 0;
        let value = 0;
        let end = pos + 2;
        while (end < code.length && count < 32) {
          const c = code[end]!;
          if (c === "0" || c === "1") {
            value = value * 2 + Number(c);
            count++;
          } else if (c !== "_" && !/\s/.test(c)) {
            break;
          }
          end++;
        }
        if (count === 32) words.push(value >>> 0);
        else fail(column, `binary word has ${count} bits but needs 32`);
        pos = end;
        continue;
      }
      const token = /^\S+/.exec(code.slice(pos))![0];
      pos += token.length;
      if (/^0[xX]/.test(token)) {
        const digits = token.slice(2).replace(/_/g, "");
        if (!/^[0-9a-fA-F]+$/.test(digits)) fail(column, `'${token}' is not a valid hex word`);
        else if (digits.length > 8) fail(column, `'${token}' has more than 32 bits`);
        else words.push(parseInt(digits, 16) >>> 0);
      } else if (/^[0-9a-fA-F]{8}$/.test(token)) {
        words.push(parseInt(token, 16) >>> 0);
      } else {
        fail(column, `'${token}' is not a hex or binary word`);
      }
    }
  });

  return { words, errors };
}
