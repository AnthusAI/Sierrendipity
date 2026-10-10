import { App } from "aws-cdk-lib";
import { SierrendipityGitHubDeployStack } from "../lib/github-deploy-stack";
import { SierrendipityStack } from "../lib/stack";

const app = new App();
const env = { account: process.env.CDK_DEFAULT_ACCOUNT ?? "335163751677", region: "us-east-1" };
new SierrendipityStack(app, "Sierrendipity", { env });
new SierrendipityGitHubDeployStack(app, "SierrendipityGitHubDeploy", { env });
