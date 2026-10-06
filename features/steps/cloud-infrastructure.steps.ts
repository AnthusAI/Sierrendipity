import { Given, Then, setDefaultTimeout } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { SierrendipityStack } from "../../infra/lib/stack";

// Synthesizing bundles three Lambdas with esbuild and stages the runner image asset.
setDefaultTimeout(120_000);

type Res = { Type: string; Properties?: any };
let template: Template;
let cache: Template | undefined;

const resources = (type: string): [string, Res][] =>
  Object.entries(template.findResources(type)) as [string, Res][];
const only = <T>(items: T[]): T => {
  assert.equal(items.length, 1);
  return items[0];
};

Given("the Sierrendipity stack is synthesized", () => {
  // No AWS access is needed: the default VPC lookup falls back to dummy values.
  cache ??= Template.fromStack(
    new SierrendipityStack(new App(), "Sierrendipity", { env: { account: "123456789012", region: "us-east-1" } }),
  );
  template = cache;
});

const taskSg = () => only(resources("AWS::EC2::SecurityGroup").filter(([, r]) => /runner task/i.test(r.Properties.GroupDescription)));
const proxySg = () => only(resources("AWS::EC2::SecurityGroup").filter(([, r]) => /proxy/i.test(r.Properties.GroupDescription)));
const taskDefinition = () => only(resources("AWS::ECS::TaskDefinition"))[1].Properties;

Then("the stack has no load balancer", () => template.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 0));
Then("the stack has no NAT gateway", () => template.resourceCountIs("AWS::EC2::NatGateway", 0));

Then("the task security group admits only the proxy security group on port 8080", () => {
  const [taskId, task] = taskSg();
  const [proxyId] = proxySg();
  assert.ok(!task.Properties.SecurityGroupIngress, "no inline ingress rules");
  const ingress = resources("AWS::EC2::SecurityGroupIngress").filter(([, r]) => r.Properties.GroupId?.["Fn::GetAtt"]?.[0] === taskId);
  const p = only(ingress)[1].Properties;
  assert.equal(p.FromPort, 8080);
  assert.equal(p.ToPort, 8080);
  assert.equal(p.IpProtocol, "tcp");
  assert.equal(p.SourceSecurityGroupId["Fn::GetAtt"][0], proxyId);
  assert.ok(!p.CidrIp);
});

Then("the task role has no policies", () => {
  const roleArn = taskDefinition().TaskRoleArn["Fn::GetAtt"][0];
  const role = template.toJSON().Resources[roleArn];
  assert.ok(!role.Properties.Policies?.length);
  assert.ok(!role.Properties.ManagedPolicyArns?.length);
  const attached = resources("AWS::IAM::Policy").filter(([, r]) => JSON.stringify(r.Properties.Roles).includes(`"${roleArn}"`));
  assert.deepEqual(attached, []);
});

Then("the task definition is ARM64 Fargate with {int} CPU units and {int} MiB", (cpu: number, mem: number) => {
  const t = taskDefinition();
  assert.equal(t.Cpu, String(cpu));
  assert.equal(t.Memory, String(mem));
  assert.deepEqual(t.RequiresCompatibilities, ["FARGATE"]);
  assert.deepEqual(t.RuntimePlatform, { CpuArchitecture: "ARM64", OperatingSystemFamily: "LINUX" });
});

Then("the runner container has IDLE_TIMEOUT_S {int}", (seconds: number) => {
  const env = only(taskDefinition().ContainerDefinitions).Environment;
  assert.deepEqual(env.find((e: any) => e.Name === "IDLE_TIMEOUT_S"), { Name: "IDLE_TIMEOUT_S", Value: String(seconds) });
});

Then("the runner logs are kept {int} days", (days: number) => {
  template.hasResourceProperties("AWS::Logs::LogGroup", { RetentionInDays: days });
});

Then("the user pool has a Google identity provider", () => {
  const p = only(resources("AWS::Cognito::UserPoolIdentityProvider"))[1].Properties;
  assert.equal(p.ProviderType, "Google");
  assert.equal(p.ProviderDetails.authorize_scopes, "openid email profile");
});

Then("the Cognito domain prefix is {string}", (prefix: string) => {
  template.hasResourceProperties("AWS::Cognito::UserPoolDomain", { Domain: prefix });
});

Then("the app client uses PKCE-capable code grant without a secret", () => {
  const p = only(resources("AWS::Cognito::UserPoolClient"))[1].Properties;
  assert.equal(p.GenerateSecret, false);
  assert.deepEqual(p.AllowedOAuthFlows, ["code"]);
  assert.deepEqual(p.SupportedIdentityProviders, ["Google"]);
  assert.deepEqual(p.AllowedOAuthScopes.sort(), ["email", "openid", "profile"]);
});

Then("the app client allows the CloudFront site and localhost:5173 as callbacks", () => {
  const p = only(resources("AWS::Cognito::UserPoolClient"))[1].Properties;
  for (const urls of [p.CallbackURLs, p.LogoutURLs]) {
    assert.ok(urls.includes("http://localhost:5173/"));
    assert.ok(JSON.stringify(urls).includes("DomainName"), "references the distribution domain");
  }
});

Then("the Google client secret is not written into the template", () => {
  const d = only(resources("AWS::Cognito::UserPoolIdentityProvider"))[1].Properties.ProviderDetails;
  for (const key of ["client_id", "client_secret"]) {
    assert.match(JSON.stringify(d[key]), /resolve:secretsmanager:.*sierrendipity\/google-oauth/);
  }
});

Then("the user pool rejects self sign-up and has a pre sign-up trigger", () => {
  const p = only(resources("AWS::Cognito::UserPool"))[1].Properties;
  assert.equal(p.AdminCreateUserConfig.AllowAdminCreateUserOnly, true);
  assert.ok(p.LambdaConfig.PreSignUp);
});

Then("the proxy function URL streams responses", () => {
  const urls = resources("AWS::Lambda::Url").filter(([, r]) => r.Properties.InvokeMode === "RESPONSE_STREAM");
  assert.equal(urls.length, 1);
  assert.equal(urls[0][1].Properties.AuthType, "NONE");
});

Then("the control function runs outside the VPC and the proxy function runs inside it", () => {
  const fns = resources("AWS::Lambda::Function");
  const inVpc = fns.filter(([, r]) => r.Properties.VpcConfig);
  const proxy = only(inVpc);
  const streaming = only(resources("AWS::Lambda::Url").filter(([, r]) => r.Properties.InvokeMode === "RESPONSE_STREAM"))[1];
  assert.equal(streaming.Properties.TargetFunctionArn["Fn::GetAtt"][0], proxy[0]);
  const control = only(fns.filter(([, r]) => r.Properties.Environment?.Variables?.CLUSTER));
  assert.ok(!control[1].Properties.VpcConfig);
  assert.deepEqual(proxy[1].Properties.Architectures, ["arm64"]);
});

Then("the site bucket blocks public access", () => {
  template.hasResourceProperties("AWS::S3::Bucket", {
    PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
  });
  template.resourceCountIs("AWS::CloudFront::OriginAccessControl", 1);
});

Then("CloudFront falls back to index.html for the single page app", () => {
  const c = only(resources("AWS::CloudFront::Distribution"))[1].Properties.DistributionConfig;
  assert.equal(c.DefaultRootObject, "index.html");
  const codes = c.CustomErrorResponses.map((e: any) => [e.ErrorCode, e.ResponseCode, e.ResponsePagePath]);
  assert.deepEqual(codes.sort(), [[403, 200, "/index.html"], [404, 200, "/index.html"]]);
});

Then("there is a {int} USD monthly budget alerting an SNS topic", (amount: number) => {
  const b = only(resources("AWS::Budgets::Budget"))[1].Properties;
  assert.equal(b.Budget.BudgetLimit.Amount, amount);
  assert.equal(b.Budget.BudgetLimit.Unit, "USD");
  assert.equal(b.Budget.TimeUnit, "MONTHLY");
  const subs = b.NotificationsWithSubscribers.flatMap((n: any) => n.Subscribers);
  assert.ok(subs.length > 0 && subs.every((s: any) => s.SubscriptionType === "SNS"));
});

Then("the stack outputs the site, control and proxy URLs and the Cognito ids", () => {
  const outputs = Object.keys(template.toJSON().Outputs);
  for (const name of ["SiteUrl", "ControlUrl", "ProxyUrl", "UserPoolId", "ClientId", "CognitoDomain"]) {
    assert.ok(outputs.includes(name), name);
  }
});

Then("the task security group allows outbound traffic only to port 443", () => {
  // The runner's seccomp filter is the primary egress control; this is defence in depth.
  const egress = taskSg()[1].Properties.SecurityGroupEgress;
  assert.equal(egress.length, 1);
  assert.deepEqual({ ...egress[0], Description: undefined }, { CidrIp: "0.0.0.0/0", IpProtocol: "tcp", FromPort: 443, ToPort: 443, Description: undefined });
});

Then("the control role may read only the allowlist parameter and pass roles only to ECS tasks", () => {
  const statements = resources("AWS::IAM::Policy").flatMap(([, r]) => r.Properties.PolicyDocument.Statement);
  const withAction = (a: string) => statements.filter((s: any) => ([] as string[]).concat(s.Action).includes(a));
  // Pre-sign-up and control, each scoped to the one parameter.
  const ssm = withAction("ssm:GetParameter");
  assert.equal(ssm.length, 2);
  for (const s of ssm) assert.ok(JSON.stringify(s.Resource).includes("sierrendipity/allowed-emails"));
  const pass = only(withAction("iam:PassRole"));
  assert.deepEqual(pass.Condition, { StringEquals: { "iam:PassedToService": "ecs-tasks.amazonaws.com" } });
});

Then("the budget topic accepts publishes only from this account", () => {
  const policy = only(resources("AWS::SNS::TopicPolicy"))[1].Properties.PolicyDocument.Statement;
  const budget = policy.find((s: any) => s.Principal?.Service === "budgets.amazonaws.com");
  assert.ok(budget.Condition.StringEquals["aws:SourceAccount"]);
});
