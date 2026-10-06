import { AfterAll, BeforeAll, setDefaultTimeout } from "@cucumber/cucumber";
import type { Server } from "node:http";
import { startServer } from "../../runner/src/server.ts";

let server: Server;

BeforeAll(async () => {
  server = await startServer(0);
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("no address");
  process.env.RUNNER_URL = `http://127.0.0.1:${address.port}`;
});

AfterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

// Compiling and running real programs takes longer than Cucumber's 5 s default.
setDefaultTimeout(60_000);
