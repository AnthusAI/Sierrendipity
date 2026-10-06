import type { AddressInfo } from "node:net";
import { startServer } from "./server.ts";

const port = Number(process.env.PORT ?? 8080);
startServer(port, {
  maxConcurrentRuns: Number(process.env.MAX_CONCURRENT_RUNS ?? 4),
  idleTimeoutS: Number(process.env.IDLE_TIMEOUT_S ?? 1200),
  secret: process.env.RUNNER_SECRET || undefined,
  onIdle: () => {
    console.log("idle, exiting");
    process.exit(0);
  },
}).then(
  (server) => console.log(`runner listening on ${(server.address() as AddressInfo).port}`),
  (error) => {
    console.error(`runner failed to start on port ${port}:`, error.message);
    process.exit(1);
  },
);
