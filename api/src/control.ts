import { signSession } from "./token";

export const SESSION_TTL_S = 30 * 60;
export const MAX_TASKS = 3;

export type TaskInfo = { taskArn: string; sub: string; status: string; ip?: string };
export type Capacity = "SPOT" | "ON_DEMAND";

/** Thrown by `run` when the chosen capacity provider has no room. */
export class CapacityError extends Error {}

export interface TaskPort {
  /** All pending or running runner tasks. */
  list(): Promise<TaskInfo[]>;
  run(sub: string, capacity: Capacity): Promise<TaskInfo>;
  stop(taskArn: string): Promise<void>;
}

export type ControlEvent = {
  rawPath: string;
  headers: Record<string, string | undefined>;
  requestContext: { http: { method: string } };
};
export type HttpResult = { statusCode: number; headers: Record<string, string>; body: string };

export type ControlDeps = {
  tasks: TaskPort;
  verifyToken: (token: string) => Promise<{ sub: string }>;
  signingKey: string;
  now: () => number; // ms
};

const json = (statusCode: number, body: unknown): HttpResult => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export function createControlHandler(deps: ControlDeps) {
  const { tasks } = deps;

  const view = (t: TaskInfo): HttpResult => {
    if (t.status !== "RUNNING" || !t.ip) return json(200, { state: "starting" });
    const exp = Math.floor(deps.now() / 1000) + SESSION_TTL_S;
    return json(200, { state: "ready", sessionToken: signSession({ sub: t.sub, taskIp: t.ip, exp }, deps.signingKey) });
  };

  const start = async (sub: string, all: TaskInfo[]): Promise<HttpResult> => {
    if (all.length >= MAX_TASKS) return json(429, { error: "All runners are busy, try again soon." });
    try {
      return view(await tasks.run(sub, "SPOT"));
    } catch (e) {
      if (!(e instanceof CapacityError)) throw e;
      return view(await tasks.run(sub, "ON_DEMAND"));
    }
  };

  return async (event: ControlEvent): Promise<HttpResult> => {
    const token = /^Bearer (.+)$/i.exec(event.headers.authorization ?? "")?.[1];
    let sub: string;
    try {
      if (!token) throw new Error("missing token");
      sub = (await deps.verifyToken(token)).sub;
    } catch {
      return json(401, { error: "Invalid or missing token." });
    }
    if (event.rawPath !== "/session") return json(404, { error: "Not found." });

    const all = await tasks.list();
    const mine = all.find((t) => t.sub === sub);
    switch (event.requestContext.http.method) {
      case "POST":
        return mine ? view(mine) : start(sub, all);
      case "GET":
        return mine ? view(mine) : json(200, { state: "none" });
      case "DELETE":
        if (mine) await tasks.stop(mine.taskArn);
        return json(200, { state: "stopped" });
      default:
        return json(405, { error: "Method not allowed." });
    }
  };
}
