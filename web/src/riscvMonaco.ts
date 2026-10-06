import type { AsmError } from "@sierrendipity/explorer";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { INSTRUCTIONS, instructionDoc, registerDoc } from "./riscvDocs";

export const ASM = "riscv-asm";
export const MACHINE = "riscv-machine";

const mnemonics = Object.keys(INSTRUCTIONS);
const registers = [
  ...Array.from({ length: 32 }, (_, i) => `x${i}`),
  ..."zero ra sp gp tp fp t0 t1 t2 t3 t4 t5 t6 s0 s1 s2 s3 s4 s5 s6 s7 s8 s9 s10 s11 a0 a1 a2 a3 a4 a5 a6 a7".split(" "),
];

/** Register the two RISC-V languages with Monaco: tokenizers, comment syntax and hover documentation. */
export function registerRiscvLanguages() {
  monaco.languages.register({ id: ASM, extensions: [".s", ".S", ".asm"], aliases: ["RISC-V assembly"] });
  monaco.languages.register({ id: MACHINE, extensions: [".hex"], aliases: ["Machine code"] });
  for (const id of [ASM, MACHINE]) monaco.languages.setLanguageConfiguration(id, { comments: { lineComment: "#" } });

  monaco.languages.setMonarchTokensProvider(ASM, {
    ignoreCase: true,
    mnemonics,
    registers,
    tokenizer: {
      root: [
        [/#.*$/, "comment"],
        [/^\s*[A-Za-z_.][\w.]*(?=\s*:)/, "type.identifier"], // labels
        [/\.[A-Za-z_]\w*/, "keyword.directive"],
        [/"([^"\\]|\\.)*"/, "string"],
        [/-?0x[0-9a-f]+|-?0b[01]+|-?\d+/, "number"],
        [/[A-Za-z_][\w.]*/, { cases: { "@mnemonics": "keyword", "@registers": "variable.predefined", "@default": "identifier" } }],
        [/[,():]/, "delimiter"],
      ],
    },
  } as monaco.languages.IMonarchLanguage);

  monaco.languages.setMonarchTokensProvider(MACHINE, {
    ignoreCase: true,
    tokenizer: {
      root: [
        [/#.*$/, "comment"],
        [/0x[0-9a-f_]+/, "number.hex"],
        [/0b[01_]+/, "number.binary"],
        [/\S+/, "invalid"],
      ],
    },
  } as monaco.languages.IMonarchLanguage);

  monaco.languages.registerHoverProvider(ASM, {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const doc = registerDoc(word.word.toLowerCase()) ?? instructionDoc(word.word);
      return doc ? { range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn), contents: [{ value: doc }] } : null;
    },
  });
}

/** Editor decorations for the current instruction, breakpoints and the linked source line. */
export function decorate(
  collection: monaco.editor.IEditorDecorationsCollection,
  { pcLine, breakpointLines, focusLine }: { pcLine: number; breakpointLines: number[]; focusLine: number },
) {
  const at = (line: number, options: monaco.editor.IModelDecorationOptions) => ({ range: new monaco.Range(line, 1, line, 1), options });
  collection.set([
    ...(focusLine ? [at(focusLine, { isWholeLine: true, className: `src-linked src-linked-${focusLine}` })] : []),
    ...(pcLine ? [at(pcLine, { isWholeLine: true, className: "src-pc", glyphMarginClassName: "pc-glyph", glyphMarginHoverMessage: { value: "Current instruction (PC)" } })] : []),
    ...breakpointLines.map((line) => at(line, { glyphMarginClassName: "bp-glyph", glyphMarginHoverMessage: { value: "Breakpoint" } })),
  ]);
}

/** Show assembler / parser errors as red squiggles in `model`. */
export function setProblemMarkers(model: monaco.editor.ITextModel, errors: AsmError[]) {
  monaco.editor.setModelMarkers(
    model,
    "riscv",
    errors.map((e) => {
      const column = Math.max(1, e.column);
      const end = model.getLineMaxColumn(Math.min(e.line, model.getLineCount()));
      return {
        severity: monaco.MarkerSeverity.Error,
        message: e.message,
        startLineNumber: e.line,
        endLineNumber: e.line,
        startColumn: column,
        endColumn: Math.max(end, column + 1),
      };
    }),
  );
}
