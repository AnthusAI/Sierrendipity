import { Given, Then, setDefaultTimeout } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { SierrendipityStack } from "../../infra/lib/stack";

// Synthesizing bundles three Lambdas with esbuild and stages the runner image asset.
setDefaultTimeout(120_000);

type Res = { Type: string; Properties?: any };
let template: Template;
let cache: Template | undefined;
let app: App;
let currentApp: App;

const resources = (type: string): [string, Res][] =>
  Object.entries(template.findResources(type)) as [string, Res][];
const only = <T>(items: T[]): T => {
  assert.equal(items.length, 1);
  return items[0];
};

Given("the Sierrendipity stack is synthesized", () => {
  // No AWS access is needed: the default VPC lookup falls back to dummy values.
  if (!cache) {
    app = new App();
    cache = Template.fromStack(new SierrendipityStack(app, "Sierrendipity", { env: { account: "123456789012", region: "us-east-1" } }));
  }
  template = cache;
  currentApp = app;
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

// ---- Custom domain ----
Given("the Sierrendipity stack is synthesized without a custom domain", () => {
  currentApp = new App({ context: { siteDomain: "" } });
  template = Template.fromStack(
    new SierrendipityStack(currentApp, "Sierrendipity", { env: { account: "123456789012", region: "us-east-1" } }),
  );
});

const distributionConfig = () => only(resources("AWS::CloudFront::Distribution"))[1].Properties.DistributionConfig;
/** The deployed `config.json` lives in a staged asset directory of the synthesized cloud assembly. */
const configJson = (): { text: string; redirectUri: string } => {
  const dir = currentApp.synth().directory;
  const file = fs
    .readdirSync(dir)
    .map((d) => path.join(dir, d, "config.json"))
    .find((f) => fs.existsSync(f));
  assert.ok(file, "config.json is staged as an asset");
  const text = fs.readFileSync(file, "utf8");
  // Deploy-time tokens appear as <<marker>> placeholders, so the file is not always valid JSON.
  const redirectUri = /"redirectUri":\s*"?([^",}]*)/.exec(text)?.[1] ?? "";
  return { text, redirectUri };
};

Then("there is a DNS-validated certificate for {string} in hosted zone {string}", (domain: string, zone: string) => {
  const cert = only(resources("AWS::CertificateManager::Certificate"))[1].Properties;
  assert.equal(cert.DomainName, domain);
  assert.equal(cert.ValidationMethod, "DNS");
  assert.equal(cert.DomainValidationOptions[0].HostedZoneId, zone);
});

Then("CloudFront serves {string} with that certificate and a TLS 1.2 minimum", (domain: string) => {
  const c = distributionConfig();
  assert.deepEqual(c.Aliases, [domain]);
  const certId = only(resources("AWS::CertificateManager::Certificate"))[0];
  assert.equal(c.ViewerCertificate.AcmCertificateArn.Ref, certId);
  assert.equal(c.ViewerCertificate.SslSupportMethod, "sni-only");
  assert.equal(c.ViewerCertificate.MinimumProtocolVersion, "TLSv1.2_2021");
});

Then("Route 53 aliases {string} to CloudFront with A and AAAA records in that zone", (domain: string) => {
  const distId = only(resources("AWS::CloudFront::Distribution"))[0];
  const records = resources("AWS::Route53::RecordSet");
  assert.deepEqual(records.map(([, r]) => r.Properties.Type).sort(), ["A", "AAAA"]);
  for (const [, r] of records) {
    assert.equal(r.Properties.Name, `${domain}.`);
    assert.equal(r.Properties.HostedZoneId, "Z02552332GG6AM25SFP73");
    assert.equal(r.Properties.AliasTarget.DNSName["Fn::GetAtt"][0], distId);
  }
});

Then("the app client allows {string} with and without a trailing slash", (url: string) => {
  const p = only(resources("AWS::Cognito::UserPoolClient"))[1].Properties;
  for (const urls of [p.CallbackURLs, p.LogoutURLs]) {
    assert.ok(urls.includes(url), url);
    assert.ok(urls.includes(`${url}/`), `${url}/`);
  }
});

Then("the app client still allows the CloudFront site and localhost:5173", () => {
  const p = only(resources("AWS::Cognito::UserPoolClient"))[1].Properties;
  for (const urls of [p.CallbackURLs, p.LogoutURLs]) {
    assert.ok(urls.includes("http://localhost:5173/") && urls.includes("http://localhost:5173"));
    assert.ok(JSON.stringify(urls).includes("DomainName"), "references the distribution domain");
  }
});

Then("both function URLs allow the origin {string}", (origin: string) => {
  const urls = resources("AWS::Lambda::Url");
  assert.equal(urls.length, 2);
  for (const [, u] of urls) assert.ok(u.Properties.Cors.AllowOrigins.includes(origin), origin);
});

Then("the runtime config redirects to {string}", (uri: string) => {
  assert.equal(configJson().redirectUri, uri);
});

Then("the stack outputs the custom domain URL", () => {
  assert.equal(template.toJSON().Outputs.CustomDomainUrl.Value, "https://sierrendipity.anth.us");
});

Then("there is no certificate, DNS record or CloudFront alias", () => {
  template.resourceCountIs("AWS::CertificateManager::Certificate", 0);
  template.resourceCountIs("AWS::Route53::RecordSet", 0);
  const c = distributionConfig();
  assert.ok(!c.Aliases?.length);
  assert.ok(!c.ViewerCertificate?.AcmCertificateArn);
  assert.ok(!("CustomDomainUrl" in template.toJSON().Outputs));
});

Then("the runtime config redirects to the CloudFront site", () => {
  // The CloudFront domain is a deploy-time token, so the staged file holds a placeholder for it.
  const { text } = configJson();
  assert.match(text, /"redirectUri":\s*<<marker:[^>]*>>/);
  assert.ok(!text.includes("anth.us"));
});

Then("the app client allows only the CloudFront site and localhost:5173", () => {
  const p = only(resources("AWS::Cognito::UserPoolClient"))[1].Properties;
  for (const urls of [p.CallbackURLs, p.LogoutURLs]) {
    assert.equal(urls.length, 4);
    assert.ok(!JSON.stringify(urls).includes("anth.us"));
  }
});
