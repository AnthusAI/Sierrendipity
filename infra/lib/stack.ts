import * as fs from "node:fs";
import * as path from "node:path";
import { CfnOutput, Duration, Fn, RemovalPolicy, SecretValue, Stack, type StackProps } from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import type { Construct } from "constructs";

const ROOT = path.resolve(__dirname, "../..");
const GOOGLE_SECRET_ID = "sierrendipity/google-oauth";
const ALLOWLIST_PARAMETER = "/sierrendipity/allowed-emails";
const COGNITO_DOMAIN_PREFIX = "sierrendipity";
const LOCAL_ORIGIN = "http://localhost:5173";
const RUNNER_PORT = 8080;
const DEFAULT_SITE_DOMAIN = "sierrendipity.anth.us";
const DEFAULT_HOSTED_ZONE_ID = "Z02552332GG6AM25SFP73";
const DEFAULT_HOSTED_ZONE_NAME = "anth.us";

/** `https://abc.lambda-url.<region>.on.aws/` -> `https://abc.lambda-url.<region>.on.aws` */
const origin = (functionUrl: string) => Fn.join("", ["https://", Fn.select(2, Fn.split("/", functionUrl))]);

export class SierrendipityStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    // Custom domain: `-c siteDomain=<host>` overrides it, and an empty string disables it (offline specs, forks).
    // The hosted zone is imported by attributes so synth needs no AWS lookups.
    const context = (key: string, fallback: string) => String(this.node.tryGetContext(key) ?? fallback);
    const siteDomain = context("siteDomain", DEFAULT_SITE_DOMAIN);
    const zone = siteDomain
      ? route53.HostedZone.fromHostedZoneAttributes(this, "Zone", {
          hostedZoneId: context("hostedZoneId", DEFAULT_HOSTED_ZONE_ID),
          zoneName: context("hostedZoneName", DEFAULT_HOSTED_ZONE_NAME),
        })
      : undefined;
    // CloudFront only accepts certificates from us-east-1, which is this stack's region.
    const certificate = zone
      ? new acm.Certificate(this, "SiteCertificate", {
          domainName: siteDomain,
          validation: acm.CertificateValidation.fromDns(zone),
        })
      : undefined;

    // ---- Hosting: created first so Cognito and CORS can reference the CloudFront domain. ----
    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    const distribution = new cloudfront.Distribution(this, "Site", {
      defaultRootObject: "index.html",
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      ...(certificate && {
        domainNames: [siteDomain],
        certificate,
        minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      }),
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      // Single page app: unknown paths fall back to index.html.
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: "/index.html",
        ttl: Duration.seconds(0),
      })),
    });
    const siteOrigin = `https://${distribution.distributionDomainName}`;
    // A plain string, so referencing it from Cognito and CORS adds no dependency cycle.
    const customOrigin = siteDomain ? `https://${siteDomain}` : undefined;
    if (zone) {
      const target = route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(distribution));
      new route53.ARecord(this, "SiteAliasA", { zone, recordName: siteDomain, target });
      new route53.AaaaRecord(this, "SiteAliasAaaa", { zone, recordName: siteDomain, target });
    }

    // ---- Auth ----
    const allowlist = new NodejsFunction(this, "PreSignUp", lambdaProps(this, "PreSignUp", "pre-sign-up", { timeout: Duration.seconds(5) }));
    const allowlistRead = new iam.PolicyStatement({
      actions: ["ssm:GetParameter"],
      resources: [this.formatArn({ service: "ssm", resource: "parameter", resourceName: ALLOWLIST_PARAMETER.slice(1) })],
    });
    allowlist.addToRolePolicy(allowlistRead);

    const userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: "sierrendipity",
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      lambdaTriggers: { preSignUp: allowlist },
    });

    // The credentials are resolved by CloudFormation at deploy time ({{resolve:secretsmanager:...}}), so
    // they never appear in the template or the repo. unsafeUnwrap() is only needed for clientId because
    // the construct takes it as a plain string; the secret itself is passed as a SecretValue.
    const google = new cognito.UserPoolIdentityProviderGoogle(this, "Google", {
      userPool,
      clientId: SecretValue.secretsManager(GOOGLE_SECRET_ID, { jsonField: "clientId" }).unsafeUnwrap(),
      clientSecretValue: SecretValue.secretsManager(GOOGLE_SECRET_ID, { jsonField: "clientSecret" }),
      scopes: ["openid", "email", "profile"],
      attributeMapping: { email: cognito.ProviderAttribute.GOOGLE_EMAIL },
    });

    // Cognito matches redirect URIs exactly, so allow the origin with and without a trailing slash.
    const redirects = [
      ...(customOrigin ? [`${customOrigin}/`, customOrigin] : []),
      `${siteOrigin}/`,
      siteOrigin,
      `${LOCAL_ORIGIN}/`,
      LOCAL_ORIGIN,
    ];
    const client = userPool.addClient("Web", {
      generateSecret: false,
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.GOOGLE],
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: redirects,
        logoutUrls: redirects,
      },
    });
    client.node.addDependency(google);
    userPool.addDomain("Domain", { cognitoDomain: { domainPrefix: COGNITO_DOMAIN_PREFIX } });
    const cognitoDomain = `${COGNITO_DOMAIN_PREFIX}.auth.${this.region}.amazoncognito.com`;

    // ---- Runner on Fargate ----
    const vpc = ec2.Vpc.fromLookup(this, "DefaultVpc", { isDefault: true });
    const publicSubnets = vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC });

    const proxySg = new ec2.SecurityGroup(this, "ProxySg", {
      vpc,
      description: "Proxy Lambda",
      allowAllOutbound: false,
    });
    // Egress is limited to 443 (image pull, logs). The seccomp filter in the runner, which denies network
    // sockets to student code, is the primary egress control; this is defence in depth.
    const taskSg = new ec2.SecurityGroup(this, "TaskSg", { vpc, description: "Runner task", allowAllOutbound: false });
    taskSg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "Image pull and logs");
    // Adds the only ingress rule on the task (8080 from the proxy) and the matching proxy egress rule.
    proxySg.connections.allowTo(taskSg, ec2.Port.tcp(RUNNER_PORT), "Proxy to runner");

    const cluster = new ecs.Cluster(this, "Cluster", { vpc, enableFargateCapacityProviders: true });
    const taskDefinition = new ecs.FargateTaskDefinition(this, "RunnerTask", {
      cpu: 512,
      memoryLimitMiB: 1024,
      runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.ARM64, operatingSystemFamily: ecs.OperatingSystemFamily.LINUX },
    });
    taskDefinition.addContainer("runner", {
      // Built from the repo root so the Dockerfile can see the workspace manifests. Only built on deploy.
      image: ecs.ContainerImage.fromAsset(ROOT, {
        file: "runner/Dockerfile",
        target: "runtime",
        platform: ecrAssets.Platform.LINUX_ARM64,
        exclude: ["**/node_modules", "**/dist", "**/cdk.out", ".git", "project", ".claude"],
      }),
      portMappings: [{ containerPort: RUNNER_PORT }],
      environment: { IDLE_TIMEOUT_S: "1200", PORT: String(RUNNER_PORT) },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "runner",
        logGroup: new logs.LogGroup(this, "RunnerLogs", {
          retention: logs.RetentionDays.ONE_WEEK,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
      }),
    });

    // ---- Control and proxy Lambdas ----
    const sessionKey = new secretsmanager.Secret(this, "SessionKey", {
      description: "HMAC key for session tokens (shared by control and proxy)",
      generateSecretString: { passwordLength: 48, excludePunctuation: true },
    });
    // Resolved by CloudFormation at deploy time, so the proxy needs no Secrets Manager call at runtime.
    const sessionKeyRef = sessionKey.secretValue.unsafeUnwrap();
    const corsOrigins = [...(customOrigin ? [customOrigin] : []), siteOrigin, LOCAL_ORIGIN];
    const cors: lambda.FunctionUrlCorsOptions = {
      allowedOrigins: corsOrigins,
      allowedMethods: [lambda.HttpMethod.ALL],
      allowedHeaders: ["authorization", "content-type", "last-event-id"],
      maxAge: Duration.hours(1),
    };

    const control = new NodejsFunction(
      this,
      "Control",
      lambdaProps(this, "Control", "control", {
        timeout: Duration.seconds(30),
        environment: {
          REGION: this.region,
          USER_POOL_ID: userPool.userPoolId,
          CLIENT_ID: client.userPoolClientId,
          SESSION_KEY: sessionKeyRef,
          CLUSTER: cluster.clusterName,
          TASK_DEFINITION: taskDefinition.family,
          SUBNET_IDS: publicSubnets.subnetIds.join(","),
          SECURITY_GROUP_ID: taskSg.securityGroupId,
        },
      }),
    );
    const taskArns = this.formatArn({ service: "ecs", resource: "task", resourceName: `${cluster.clusterName}/*` });
    control.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ecs:RunTask"],
        resources: [this.formatArn({ service: "ecs", resource: "task-definition", resourceName: `${taskDefinition.family}:*` })],
        conditions: { ArnEquals: { "ecs:cluster": cluster.clusterArn } },
      }),
    );
    control.addToRolePolicy(
      new iam.PolicyStatement({ actions: ["ecs:StopTask", "ecs:DescribeTasks", "ecs:TagResource"], resources: [taskArns] }),
    );
    control.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ecs:ListTasks"],
        resources: ["*"],
        conditions: { ArnEquals: { "ecs:cluster": cluster.clusterArn } },
      }),
    );
    control.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["iam:PassRole"],
        resources: [taskDefinition.taskRole.roleArn, taskDefinition.obtainExecutionRole().roleArn],
        conditions: { StringEquals: { "iam:PassedToService": "ecs-tasks.amazonaws.com" } },
      }),
    );
    // The pre-sign-up trigger only sees new users, so the control Lambda re-checks the allowlist.
    control.addToRolePolicy(allowlistRead);
    const controlUrl = control.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE, cors });

    const proxy = new NodejsFunction(
      this,
      "Proxy",
      lambdaProps(this, "Proxy", "proxy", {
        timeout: Duration.minutes(15),
        vpc,
        vpcSubnets: publicSubnets,
        // The proxy only talks to task private IPs, so it needs neither NAT nor a public address.
        allowPublicSubnet: true,
        securityGroups: [proxySg],
        environment: { SESSION_KEY: sessionKeyRef },
      }),
    );
    const proxyUrl = proxy.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
      cors,
    });

    // ---- Site content and runtime config ----
    // Deploys web/dist when the web workspace has been built, otherwise a placeholder page.
    const webDist = path.join(ROOT, "web/dist");
    const siteDir = fs.existsSync(webDist) ? webDist : path.join(__dirname, "../placeholder-site");
    new s3deploy.BucketDeployment(this, "SiteContent", {
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ["/*"],
      sources: [
        s3deploy.Source.asset(siteDir),
        s3deploy.Source.jsonData("config.json", {
          region: this.region,
          cognitoDomain,
          clientId: client.userPoolClientId,
          controlUrl: origin(controlUrl.url),
          proxyUrl: origin(proxyUrl.url),
          redirectUri: `${customOrigin ?? siteOrigin}/`,
        }),
      ],
    });

    // ---- Cost guard ----
    const alerts = new sns.Topic(this, "BudgetAlerts");
    alerts.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [new iam.ServicePrincipal("budgets.amazonaws.com")],
        actions: ["sns:Publish"],
        resources: [alerts.topicArn],
        conditions: { StringEquals: { "aws:SourceAccount": this.account } },
      }),
    );
    // Optional subscriber (an email address or similar) comes from `cdk deploy -c budgetAlertEmail=...`.
    const alertEmail = this.node.tryGetContext("budgetAlertEmail");
    if (alertEmail) alerts.addSubscription(new subscriptions.EmailSubscription(String(alertEmail)));
    const alarm = (notificationType: "ACTUAL" | "FORECASTED", threshold: number) => ({
      notification: {
        notificationType,
        comparisonOperator: "GREATER_THAN",
        threshold,
        thresholdType: "PERCENTAGE",
      },
      subscribers: [{ subscriptionType: "SNS", address: alerts.topicArn }],
    });
    new budgets.CfnBudget(this, "MonthlyBudget", {
      budget: {
        budgetName: "sierrendipity-monthly",
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: 20, unit: "USD" },
      },
      notificationsWithSubscribers: [alarm("ACTUAL", 80), alarm("FORECASTED", 100)],
    });

    // ---- Outputs ----
    new CfnOutput(this, "SiteUrl", { value: siteOrigin });
    new CfnOutput(this, "SiteBucketName", { value: siteBucket.bucketName, exportName: "SierrendipitySiteBucketName" });
    new CfnOutput(this, "SiteDistributionId", { value: distribution.distributionId, exportName: "SierrendipitySiteDistributionId" });
    if (customOrigin) new CfnOutput(this, "CustomDomainUrl", { value: customOrigin });
    new CfnOutput(this, "ControlUrl", { value: controlUrl.url });
    new CfnOutput(this, "ProxyUrl", { value: proxyUrl.url });
    new CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new CfnOutput(this, "ClientId", { value: client.userPoolClientId });
    new CfnOutput(this, "CognitoDomain", { value: cognitoDomain });
  }
}

/** Shared NodejsFunction settings: Node 22, ARM64, bundled by esbuild (the AWS SDK comes from the runtime). */
function lambdaProps(scope: Construct, id: string, entry: string, extra: Record<string, unknown>) {
  return {
    entry: path.join(ROOT, `api/src/lambda/${entry}.ts`),
    projectRoot: ROOT,
    depsLockFilePath: path.join(ROOT, "package-lock.json"),
    runtime: lambda.Runtime.NODEJS_22_X,
    architecture: lambda.Architecture.ARM_64,
    memorySize: 256,
    logGroup: new logs.LogGroup(scope, `${id}Logs`, { retention: logs.RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.DESTROY }),
    bundling: { minify: true, target: "node22", externalModules: ["@aws-sdk/*"] },
    ...extra,
  };
}
