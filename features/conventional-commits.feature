Feature: Conventional commit messages
  As a maintainer
  I want commit messages checked against the Conventional Commits format
  so that Semantic Release can compute versions and changelogs automatically

  Scenario: A conventional commit message is accepted
    Given the commit message "feat: add the code editor"
    When the commit message is linted
    Then the commit message is accepted

  Scenario: A free-form commit message is rejected
    Given the commit message "added some stuff"
    When the commit message is linted
    Then the commit message is rejected
