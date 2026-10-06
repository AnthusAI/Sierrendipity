import http from "node:http";
import { RequestError, runProject } from "./run-project.ts";

const MAX_BODY_BYTES = 5_000_000;

class TooLargeError extends Error {}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    if (Number(req.headers["content-length"]) > MAX_BODY_BYTES) {
      req.resume();
      return reject(new TooLargeError());
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        // Stop buffering but keep draining, so the client finishes its upload and can read the 413.
        req.removeAllListeners("data");
        req.resume();
        reject(new TooLargeError());
      } else chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: http.ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export function startServer(port: number): Promise<http.Server> {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/healthz") return send(res, 200, { ok: true });
      if (req.method === "POST" && req.url === "/run") {
        let request;
        try {
          request = JSON.parse(await readBody(req));
        } catch (error) {
          if (error instanceof TooLargeError) throw error;
          throw new RequestError("invalid JSON");
        }
        return send(res, 200, await runProject(request));
      }
      send(res, 404, { error: "not found" });
    } catch (error) {
      if (error instanceof TooLargeError) {
        return send(res, 413, { error: "request too large" });
      }
      if (error instanceof RequestError) return send(res, 400, { error: error.message });
      console.error(error);
      send(res, 500, { status: "internal_error" });
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => resolve(server));
  });
}
