// Regenerates src/theme/themes.generated.css from the token table: `npm run theme:css -w web`.
import { writeFileSync } from "node:fs";
import { themeStylesheet } from "../src/theme/palette";

const file = new URL("../src/theme/themes.generated.css", import.meta.url);
writeFileSync(file, themeStylesheet());
console.log(`wrote ${file.pathname}`);
