import { CfnOutput, Fn, Stack, type StackProps } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";

const GITHUB_OIDC_PROVIDER = "token.actions.githubusercontent.com";
const GITHUB_MAIN_SUBJECT = "repo:AnthusAI/Sierrendipity:ref:refs/heads/main";
const ROLE_NAME = "SierrendipityGitHubProductionDeploy";

export class SierrendipityGitHubDeployStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const provider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      "GitHubOidcProvider",
      `arn:${this.partition}:iam::${this.account}:oidc-provider/${GITHUB_OIDC_PROVIDER}`,
    );
    const siteBucketName = Fn.importValue("SierrendipitySiteBucketName");
    const distributionId = Fn.importValue("SierrendipitySiteDistributionId");
    const siteBucketArn = Fn.join("", [`arn:${this.partition}:s3:::`, siteBucketName]);
    const siteObjectArn = Fn.join("", [siteBucketArn, "/*"]);
    const distributionArn = Fn.join("", [`arn:${this.partition}:cloudfront::${this.account}:distribution/`, distributionId]);
    const deployRole = new iam.Role(this, "GitHubProductionDeploy", {
      roleName: ROLE_NAME,
      description: "GitHub Actions OIDC deployment for the Sierrendipity main branch.",
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": GITHUB_MAIN_SUBJECT,
        },
      }),
    });
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "ListSierrendipitySiteAssets",
        actions: ["s3:GetBucketLocation", "s3:ListBucket"],
        resources: [siteBucketArn],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "PublishSierrendipitySiteAssets",
        actions: ["s3:AbortMultipartUpload", "s3:DeleteObject", "s3:GetObject", "s3:PutObject"],
        resources: [siteObjectArn],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "InvalidateSierrendipitySiteCache",
        actions: ["cloudfront:CreateInvalidation"],
        resources: [distributionArn],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "ReadSierrendipityStackStatus",
        actions: ["cloudformation:DescribeStacks", "cloudformation:DescribeStackEvents"],
        resources: [`arn:${this.partition}:cloudformation:${this.region}:${this.account}:stack/Sierrendipity/*`],
      }),
    );

    new CfnOutput(this, "GitHubProductionDeployRoleArn", { value: deployRole.roleArn });
  }
}

export { GITHUB_MAIN_SUBJECT, ROLE_NAME };
