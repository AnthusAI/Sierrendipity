Feature: Release automation
  As a maintainer
  I want merged feature commits to produce a release
  so that versions and the changelog follow from Conventional Commits

  Scenario: Semantic Release publishes a changelog, a commit and a GitHub release
    Given the semantic-release configuration
    Then it releases from the "main" branch
    And it uses the plugins "changelog", "git" and "github"
    And it does not publish to npm
    And the git plugin commits "CHANGELOG.md", "package.json" and "package-lock.json" with "[skip ci]"

  Scenario: CI runs the specs, commit lint, Linux runner specs and type checks
    Given the CI workflow
    Then it defines the jobs "specs", "commitlint", "runner-linux" and "typecheck"
    And it runs on pull requests and on pushes to "develop" and "main"

  Scenario: The release workflow follows a green CI run on main
    Given the semantic-release workflow
    Then it is triggered by the completion of the "CI" workflow
    And it defines the jobs "release" and "guard-pre-1-0"

  Scenario: CI deploys only a validated main revision through GitHub OIDC
    Given the CI workflow
    Then the production deployment job uses GitHub OIDC only for validated main pushes
