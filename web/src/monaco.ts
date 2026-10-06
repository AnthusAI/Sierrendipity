// Bundle Monaco locally (no CDN at runtime): core editor plus only the languages we teach.
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/editor/edcore.main";
import "monaco-editor/esm/vs/basic-languages/python/python.contribution";
import "monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution";
import "monaco-editor/esm/vs/basic-languages/rust/rust.contribution";
import { registerRiscvLanguages } from "./riscvMonaco";
import { defineMonacoThemes } from "./theme/editorThemes";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });

registerRiscvLanguages();
defineMonacoThemes();
