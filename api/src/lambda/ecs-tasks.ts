import {
  DescribeTasksCommand,
  ECSClient,
  ListTasksCommand,
  RunTaskCommand,
  StopTaskCommand,
  type Task,
} from "@aws-sdk/client-ecs";
import { CapacityError, ThrottledError, type Capacity, type TaskInfo, type TaskPort } from "../control";

const { CLUSTER, TASK_DEFINITION, SUBNET_IDS, SECURITY_GROUP_ID } = process.env as Record<string, string>;

function toInfo(t: Task): TaskInfo {
  const ip = t.attachments?.flatMap((a) => a.details ?? []).find((d) => d.name === "privateIPv4Address")?.value;
  const env = t.overrides?.containerOverrides?.flatMap((c) => c.environment ?? []);
  return {
    taskArn: t.taskArn!,
    // The task is tagged with the Cognito sub, never an email.
    sub: t.tags?.find((x) => x.key === "sub")?.value ?? "",
    // Desired STOPPED but still alive: it counts toward the cap but must never be handed out.
    status: t.desiredStatus === "STOPPED" ? "STOPPING" : (t.lastStatus ?? ""),
    ip,
    secret: env?.find((e) => e.name === "RUNNER_SECRET")?.value,
    createdAt: t.createdAt?.getTime() ?? 0,
  };
}

const isThrottle = (e: unknown) =>
  /Throttl|RequestLimitExceeded|TooManyRequests/i.test((e as { name?: string })?.name ?? "");

export class EcsTasks implements TaskPort {
  private ecs = new ECSClient({});

  private async guard<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (e) {
      if (isThrottle(e)) throw new ThrottledError((e as Error).message);
      throw e;
    }
  }

  async list(): Promise<TaskInfo[]> {
    // RUNNING also lists tasks still running that ECS has been asked to stop; STOPPED lists tasks
    // with desired status STOPPED, some of which have not finished stopping yet.
    const arns = new Set<string>();
    for (const desiredStatus of ["RUNNING", "STOPPED"] as const) {
      const out = await this.guard(() => this.ecs.send(new ListTasksCommand({ cluster: CLUSTER, desiredStatus })));
      out.taskArns?.forEach((a) => arns.add(a));
    }
    if (!arns.size) return [];
    const { tasks } = await this.guard(() =>
      this.ecs.send(new DescribeTasksCommand({ cluster: CLUSTER, tasks: [...arns], include: ["TAGS"] })),
    );
    return (tasks ?? []).filter((t) => t.lastStatus !== "STOPPED").map(toInfo);
  }

  async run(sub: string, capacity: Capacity, secret: string): Promise<TaskInfo> {
    const { tasks, failures } = await this.guard(() =>
      this.ecs.send(
        new RunTaskCommand({
          cluster: CLUSTER,
          taskDefinition: TASK_DEFINITION,
          count: 1,
          capacityProviderStrategy: [{ capacityProvider: capacity === "SPOT" ? "FARGATE_SPOT" : "FARGATE", weight: 1 }],
          networkConfiguration: {
            awsvpcConfiguration: { subnets: SUBNET_IDS.split(","), securityGroups: [SECURITY_GROUP_ID], assignPublicIp: "ENABLED" },
          },
          overrides: { containerOverrides: [{ name: "runner", environment: [{ name: "RUNNER_SECRET", value: secret }] }] },
          tags: [{ key: "sub", value: sub }],
        }),
      ),
    );
    if (!tasks?.length) {
      const reason = failures?.[0]?.reason ?? "unknown";
      if (/capacity/i.test(reason)) throw new CapacityError(reason);
      throw new Error(`RunTask failed: ${reason}`);
    }
    return toInfo(tasks[0]);
  }

  async stop(taskArn: string): Promise<void> {
    await this.guard(() => this.ecs.send(new StopTaskCommand({ cluster: CLUSTER, task: taskArn, reason: "stopped by user" })));
  }
}
