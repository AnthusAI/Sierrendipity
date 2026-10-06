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
      execFile("npm", ["run", "build", "-w", "web"], { cwd: root, env: { ...process.env, VITE_DEV_TOOLS: "1" } }, (error, _out, err) =>
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
  bareCognitoDomain = false;
  authorizeUrl?: URL;
  tokenBody?: URLSearchParams;
  idToken?: string;
  /** Computed colors noted earlier in a scenario, to compare against later. */
  noted: Record<string, string> = {};
  pageErrors: string[] = [];

  /**
   * Click something that opens one of the app's dialogs (they replaced window.prompt/confirm), type
   * `answer` into its text box when given, and press its confirm button (Create, Rename or Delete).
   */
  async answeringDialog(answer: string | null, click: () => Promise<unknown>) {
    await click();
    const dialog = this.page.getByRole("dialog");
    await dialog.waitFor();
    if (answer !== null) await dialog.getByRole("textbox").fill(answer);
    await dialog.getByRole("button", { name: /^(Create|Rename|Delete)$/ }).click();
    await dialog.waitFor({ state: "detached" });
  }

  /** Open the app; `path` defaults to the Workspace, where the IDE specs live (the landing page is Learn). */
  async open(config: Record<string, unknown>, path = "/workspace") {
    await this.page.route("**/config.json", (route) => route.fulfill({ json: config }));
    await this.page.goto(`${this.appUrl}${path}`);
  }

  /** After sign-in a student lands on Learn: step into the Workspace, where the IDE specs continue. */
  async toWorkspace() {
    const nav = this.page.getByRole("navigation", { name: "Areas" });
    const signIn = this.page.getByRole("heading", { name: "Sign in to Sierrendipity" });
    await nav.or(signIn).waitFor();
    const run = this.page.getByRole("button", { name: "Run", exact: true });
    if ((await nav.isVisible()) && !(await run.isVisible())) await nav.getByRole("link", { name: "Workspace", exact: true }).click();
  }

  async openLab() {
    await this.page.goto(`${this.appUrl}/lab`);
  }
}

setWorldConstructor(WebWorld);

Before({ tags: "@web", timeout: 180_000 }, async function (this: WebWorld) {
  const { browser, appUrl } = await sharedWeb();
  this.appUrl = appUrl;
  this.context = await browser.newContext();
  this.page = await this.context.newPage();
  this.page.setDefaultTimeout(15_000);
  this.page.on("pageerror", (error) => this.pageErrors.push(error.message));
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
