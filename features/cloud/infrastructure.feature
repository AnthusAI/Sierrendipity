@cloud @infra
Feature: Cloud infrastructure
  The CDK stack describes a scale-to-zero deployment with no always-on compute.

  Background:
    Given the Sierrendipity stack is synthesized

  Scenario: No always-on networking
    Then the stack has no load balancer
    And the stack has no NAT gateway

  Scenario: Only the proxy may reach the runner task
    Then the task security group admits only the proxy security group on port 8080

  Scenario: The runner task may only reach out on 443
    Then the task security group allows outbound traffic only to port 443

  Scenario: IAM hardening
    Then the control role may read only the allowlist parameter and pass roles only to ECS tasks
    And the budget topic accepts publishes only from this account

  Scenario: The runner task holds no permissions
    Then the task role has no policies

  Scenario: Runner task shape
    Then the task definition is ARM64 Fargate with 512 CPU units and 1024 MiB
    And the runner container has IDLE_TIMEOUT_S 1200
    And the runner logs are kept 7 days

  Scenario: Cognito signs people in through Google
    Then the user pool has a Google identity provider
    And the Cognito domain prefix is "sierrendipity"
    And the app client uses PKCE-capable code grant without a secret
    And the app client allows the CloudFront site and localhost:5173 as callbacks
    And the Google client secret is not written into the template
    And the user pool rejects self sign-up and has a pre sign-up trigger

  Scenario: Function URLs
    Then the proxy function URL streams responses
    And the control function runs outside the VPC and the proxy function runs inside it

  Scenario: The site is served privately from CloudFront
    Then the site bucket blocks public access
    And CloudFront falls back to index.html for the single page app

  Scenario: The monthly budget guards cost
    Then there is a 20 USD monthly budget alerting an SNS topic

  Scenario: Deployment outputs
    Then the stack outputs the site, control and proxy URLs and the Cognito ids

  Scenario: The site is served from a custom domain
    Then there is a DNS-validated certificate for "sierrendipity.anth.us" in hosted zone "Z02552332GG6AM25SFP73"
    And CloudFront serves "sierrendipity.anth.us" with that certificate and a TLS 1.2 minimum
    And Route 53 aliases "sierrendipity.anth.us" to CloudFront with A and AAAA records in that zone
    And the app client allows "https://sierrendipity.anth.us" with and without a trailing slash
    And the app client still allows the CloudFront site and localhost:5173
    And both function URLs allow the origin "https://sierrendipity.anth.us"
    And the runtime config redirects to "https://sierrendipity.anth.us/"
    And the stack outputs the custom domain URL

  Scenario: The custom domain can be disabled
    Given the Sierrendipity stack is synthesized without a custom domain
    Then there is no certificate, DNS record or CloudFront alias
    And the runtime config redirects to the CloudFront site
    And the app client allows only the CloudFront site and localhost:5173

  Scenario: GitHub production delivery has a repository-scoped role
    Given the Sierrendipity GitHub deploy stack is synthesized
    Then the GitHub deploy role trusts only the Sierrendipity main branch
    And the GitHub deploy role may publish only site assets, invalidate the site cache and read stack status
    And the Sierrendipity stack exports the site deployment targets
