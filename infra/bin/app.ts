import { App } from "aws-cdk-lib";
import { SierrendipityGitHubDeployStack } from "../lib/github-deploy-stack";
import { SierrendipityStack } from "../lib/stack";

const app = new App();
const env = { account: process.env.CDK_DEFAULT_ACCOUNT ?? "335163751677", region: "us-east-1" };
const applicationStack = new SierrendipityStack(app, "Sierrendipity", { env });
const githubDeployStack = new SierrendipityGitHubDeployStack(app, "SierrendipityGitHubDeploy", { env });

// The role stack imports values exported by the application stack.
githubDeployStack.addDependency(applicationStack);
