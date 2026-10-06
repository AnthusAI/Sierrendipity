import { After, AfterAll, Before, setWorldConstructor, World } from "@cucumber/cucumber";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { startMockBackend, type MockBackend } from "./mock-backend.ts";

const root = path.resolve(__dirname, "../..");
const dist = path.join(root, "web/dist");
const types: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".ttf": "font/ttf",
  ".json": "application/json",
};

let shared: Promise<{ browser: Browser; app: Server; appUrl: string }> | undefined;

// Build the web app and launch Chromium once per run, only when a @web scenario needs them.
function sharedWeb() {
  shared ??= (async () => {
    await new Promise<void>((resolve, reject) =>
      execFile("npm", ["run", "build", "-w", "web"], { cwd: root }, (error, _out, err) =>
        error ? reject(new Error(`web build failed:\n${err}`)) : resolve(),
      ),
    );
    const app = createServer(async (request, response) => {
      const pathname = new URL(request.url!, "http://app").pathname;
      const file = path.join(dist, path.normalize(pathname));
      const body = await readFile(file).catch(() => null);
      // Single-page app: unknown paths (e.g. /callback) serve index.html.
      const served = body ?? (await readFile(path.join(dist, "index.html")));
      response.writeHead(200, { "content-type": types[path.extname(body ? file : "x.html")] ?? "application/octet-stream" });
      response.end(served);
    });
    await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
    const address = app.address();
    if (typeof address !== "object" || address === null) throw new Error("no address");
    const browser = await chromium.launch({ headless: true });
    return { browser, app, appUrl: `http://127.0.0.1:${address.port}` };
  })();
  return shared;
}

export class WebWorld extends World {
  context!: BrowserContext;
  page!: Page;
  appUrl!: string;
  mock!: MockBackend;
  cognitoDomain?: string;
  authorizeUrl?: URL;
  tokenBody?: URLSearchParams;
  idToken?: string;

  async open(config: Record<string, unknown>) {
    await this.page.route("**/config.json", (route) => route.fulfill({ json: config }));
    await this.page.goto(this.appUrl);
  }
}

setWorldConstructor(WebWorld);

Before({ tags: "@web", timeout: 180_000 }, async function (this: WebWorld) {
  const { browser, appUrl } = await sharedWeb();
  this.appUrl = appUrl;
  this.context = await browser.newContext();
  this.page = await this.context.newPage();
  this.page.setDefaultTimeout(15_000);
});

After({ tags: "@web" }, async function (this: WebWorld) {
  await this.context?.close();
  await this.mock?.close();
});

AfterAll({ timeout: 30_000 }, async () => {
  if (!shared) return;
  const { browser, app } = await shared;
  await browser.close();
  await new Promise((resolve) => app.close(resolve));
});
