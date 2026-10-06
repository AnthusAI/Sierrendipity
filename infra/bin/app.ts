import { App } from "aws-cdk-lib";
import { SierrendipityStack } from "../lib/stack";

const app = new App();
new SierrendipityStack(app, "Sierrendipity", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT ?? "335163751677", region: "us-east-1" },
});
