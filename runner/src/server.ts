import http from "node:http";
import { RequestError, runProject } from "./run-project.ts";

const MAX_BODY_BYTES = 5_000_000;

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new RequestError("request too large"));
        req.destroy();
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
          if (error instanceof RequestError) throw error;
          throw new RequestError("invalid JSON");
        }
        return send(res, 200, await runProject(request));
      }
      send(res, 404, { error: "not found" });
    } catch (error) {
      if (error instanceof RequestError) return send(res, 400, { error: error.message });
      console.error(error);
      send(res, 500, { status: "internal_error" });
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
