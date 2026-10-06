import { isAllowed } from "./pre-sign-up";
import { signSession } from "./token";

export const SESSION_TTL_S = 15 * 60;
export const MAX_TASKS = 3;

export const ALLOWLIST_CACHE_MS = 60_000;

/** `status` is the ECS last status, or STOPPING when ECS wants the task stopped but it still runs. */
export type TaskInfo = { taskArn: string; sub: string; status: string; ip?: string; secret?: string; createdAt: number };
export type Capacity = "SPOT" | "ON_DEMAND";

/** Thrown by `run` when the chosen capacity provider has no room. */
export class CapacityError extends Error {}

/** Thrown by the task port when ECS throttles the request. */
export class ThrottledError extends Error {}

export interface TaskPort {
  /** All runner tasks that have not fully stopped, including ones that are stopping. */
  list(): Promise<TaskInfo[]>;
  /** `secret` is passed to the task as RUNNER_SECRET. */
  run(sub: string, capacity: Capacity, secret: string): Promise<TaskInfo>;
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
  verifyToken: (token: string) => Promise<{ sub: string; email?: string }>;
  /** Raw comma-separated allowlist, or undefined when not configured. */
  getAllowlist: () => Promise<string | undefined>;
  newSecret: () => string;
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

  let cached: { raw: string; at: number } | undefined;
  const allowlist = async () => {
    if (cached && deps.now() - cached.at < ALLOWLIST_CACHE_MS) return cached.raw;
    const raw = await deps.getAllowlist().catch(() => undefined);
    cached = raw === undefined ? undefined : { raw, at: deps.now() };
    return raw;
  };

  const view = (t: TaskInfo): HttpResult => {
    if (t.status !== "RUNNING" || !t.ip || !t.secret) return json(200, { state: "starting" });
    const exp = Math.floor(deps.now() / 1000) + SESSION_TTL_S;
    const claims = { sub: t.sub, taskIp: t.ip, secret: t.secret, exp };
    return json(200, { state: "ready", sessionToken: signSession(claims, deps.signingKey) });
  };

  const usable = (all: TaskInfo[], sub: string) => all.filter((t) => t.sub === sub && t.status !== "STOPPING");

  const runOnce = async (sub: string): Promise<TaskInfo> => {
    const secret = deps.newSecret();
    try {
      return await tasks.run(sub, "SPOT", secret);
    } catch (e) {
      if (!(e instanceof CapacityError)) throw e;
      return tasks.run(sub, "ON_DEMAND", secret);
    }
  };

  const start = async (sub: string, all: TaskInfo[]): Promise<HttpResult> => {
    if (all.length >= MAX_TASKS) return json(429, { error: "All runners are busy, try again soon." });
    const created = await runOnce(sub);
    // Concurrent requests can both pass the check above: keep the user's oldest task, stop the rest.
    const mine = usable(await tasks.list(), sub);
    if (!mine.some((t) => t.taskArn === created.taskArn)) mine.push(created);
    mine.sort((a, b) => a.createdAt - b.createdAt);
    for (const extra of mine.slice(1)) await tasks.stop(extra.taskArn);
    return view(mine[0]);
  };

  const handle = async (event: ControlEvent): Promise<HttpResult> => {
    const token = /^Bearer (.+)$/i.exec(event.headers.authorization ?? "")?.[1];
    let who: { sub: string; email?: string };
    try {
      if (!token) throw new Error("missing token");
      who = await deps.verifyToken(token);
    } catch {
      return json(401, { error: "Invalid or missing token." });
    }
    if (event.rawPath !== "/session") return json(404, { error: "Not found." });

    const method = event.requestContext.http.method;
    // The pre-sign-up trigger only runs for new users, so the allowlist is enforced here too.
    // DELETE stays open so a removed user can still stop their own task.
    if ((method === "POST" || method === "GET") && !isAllowed(await allowlist(), who.email)) {
      return json(403, { error: "This account is not allowed to use Sierrendipity." });
    }

    const all = await tasks.list();
    const mine = usable(all, who.sub)[0];
    switch (method) {
      case "POST":
        return mine ? view(mine) : start(who.sub, all);
      case "GET":
        return mine ? view(mine) : json(200, { state: "none" });
      case "DELETE":
        if (mine) await tasks.stop(mine.taskArn);
        return json(200, { state: "stopped" });
      default:
        return json(405, { error: "Method not allowed." });
    }
  };

  return async (event: ControlEvent): Promise<HttpResult> => {
    try {
      return await handle(event);
    } catch (e) {
      if (e instanceof ThrottledError || e instanceof CapacityError) {
        return json(503, { error: "The service is busy, try again in a moment." });
      }
      console.error(e);
      return json(502, { error: "Could not reach the runner service." });
    }
  };
}
