import {
  DescribeTasksCommand,
  ECSClient,
  ListTasksCommand,
  RunTaskCommand,
  StopTaskCommand,
  type Task,
} from "@aws-sdk/client-ecs";
import { CapacityError, type Capacity, type TaskInfo, type TaskPort } from "../control";

const { CLUSTER, TASK_DEFINITION, SUBNET_IDS, SECURITY_GROUP_ID } = process.env as Record<string, string>;

function toInfo(t: Task): TaskInfo {
  const ip = t.attachments?.flatMap((a) => a.details ?? []).find((d) => d.name === "privateIPv4Address")?.value;
  return {
    taskArn: t.taskArn!,
    // The task is tagged with the Cognito sub, never an email.
    sub: t.tags?.find((x) => x.key === "sub")?.value ?? "",
    status: t.lastStatus ?? "",
    ip,
  };
}

export class EcsTasks implements TaskPort {
  private ecs = new ECSClient({});

  async list(): Promise<TaskInfo[]> {
    const { taskArns } = await this.ecs.send(new ListTasksCommand({ cluster: CLUSTER, desiredStatus: "RUNNING" }));
    if (!taskArns?.length) return [];
    const { tasks } = await this.ecs.send(new DescribeTasksCommand({ cluster: CLUSTER, tasks: taskArns, include: ["TAGS"] }));
    return (tasks ?? []).map(toInfo);
  }

  async run(sub: string, capacity: Capacity): Promise<TaskInfo> {
    const { tasks, failures } = await this.ecs.send(
      new RunTaskCommand({
        cluster: CLUSTER,
        taskDefinition: TASK_DEFINITION,
        count: 1,
        capacityProviderStrategy: [{ capacityProvider: capacity === "SPOT" ? "FARGATE_SPOT" : "FARGATE", weight: 1 }],
        networkConfiguration: {
          awsvpcConfiguration: { subnets: SUBNET_IDS.split(","), securityGroups: [SECURITY_GROUP_ID], assignPublicIp: "ENABLED" },
        },
        tags: [{ key: "sub", value: sub }],
      }),
    );
    if (!tasks?.length) {
      const reason = failures?.[0]?.reason ?? "unknown";
      if (/capacity/i.test(reason)) throw new CapacityError(reason);
      throw new Error(`RunTask failed: ${reason}`);
    }
    return toInfo(tasks[0]);
  }

  async stop(taskArn: string): Promise<void> {
    await this.ecs.send(new StopTaskCommand({ cluster: CLUSTER, task: taskArn, reason: "stopped by user" }));
  }
}
