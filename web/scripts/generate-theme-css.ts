// Regenerates the generated theme files from the token table: `npm run theme:css -w web`.
// With --check (the build's prebuild step) it fails instead of writing when they are stale.
import { readFileSync, writeFileSync } from "node:fs";
import { themeStylesheet } from "../src/theme/palette";
import { withThemeInit } from "../src/theme/initScript";

const css = new URL("../src/theme/themes.generated.css", import.meta.url);
const html = new URL("../index.html", import.meta.url);
const outputs: [URL, string][] = [
  [css, themeStylesheet()],
  [html, withThemeInit(readFileSync(html, "utf8"))],
];

if (process.argv.includes("--check")) {
  const stale = outputs.filter(([file, text]) => readFileSync(file, "utf8") !== text);
  if (stale.length > 0) {
    console.error(`stale: ${stale.map(([file]) => file.pathname).join(", ")}\nrun: npm run theme:css -w web`);
    process.exit(1);
  }
} else {
  for (const [file, text] of outputs) writeFileSync(file, text);
  console.log("wrote the theme stylesheet and the index.html theme script");
}
