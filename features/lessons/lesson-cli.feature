Feature: The lesson authoring CLI and the CI gate
  `npm run lesson -- check <dir | --all>` validates lessons and runs every reference solution.
  A broken lesson must fail `npm test`.

  Scenario: Every authored lesson passes the checker
    When I run the lesson CLI with "check --all"
    Then the CLI exits with 0
    And the CLI output mentions "ok   c1/01-press-the-button"
    And the CLI output mentions "ok   c1/02-change-the-number"
    And the CLI output mentions "c1/05-add"
    And the CLI output mentions "good.hex"
    And the CLI output mentions "(step cap)"

  Scenario: A single lesson can be checked by its path
    When I run the lesson CLI with "check lessons/c1/01-press-the-button"
    Then the CLI exits with 0
    And the CLI output mentions "stars: pass"

  Scenario: A broken lesson fails the CLI with a clear reason
    Given a scratch lessons folder holding the valid test lesson as "c1/99-test"
    And in the scratch lesson "solutions/wrong.s" is replaced "addi a0, zero, 6" with "addi a0, zero, 5"
    When I run the lesson CLI on the scratch folder with "check c1/99-test"
    Then the CLI exits with 1
    And the CLI output mentions "FAIL c1/99-test"
    And the CLI output mentions "a wrong solution passes"

  Scenario: Usage errors exit with 2
    When I run the lesson CLI with "check"
    Then the CLI exits with 2
    And the CLI output mentions "usage:"

  Scenario: The build step writes JSON that the browser can load without parsing Gherkin
    Given a scratch lessons folder holding the valid test lesson as "c1/99-test"
    When I build the scratch lessons
    Then the file "dist/c1-99-test.json" exists in the scratch folder
    And that file is a published lesson whose checks are data

  Scenario: Gherkin the checker cannot parse is reported
    Given a scratch lessons folder holding the valid test lesson as "c1/99-test"
    And in the scratch lesson "checks.feature" is replaced "Scenario: Called it" with "Scenario Outline: Called it"
    When I run the lesson CLI on the scratch folder with "check c1/99-test"
    Then the CLI exits with 1
    And the CLI output mentions "not supported in lesson checks"

  Scenario: A draft lesson is built for the player but left out of the shipping catalog
    Given a scratch lessons folder holding the valid test lesson as "c1/99-test"
    And in the scratch lesson "lesson.yaml" is replaced "minutes: 5" with "minutes: 5\ndraft: true"
    When I build the scratch lessons
    Then the file "dist/drafts/c1-99-test.json" exists in the scratch folder
    And the file "dist/c1-99-test.json" does not exist in the scratch folder
    And that draft file is a published lesson that is a draft
    When I build the catalog of the scratch lessons
    Then the catalog lists no lessons
    And the catalog build reports no errors

  Scenario: A finished lesson is listed in the catalog
    Given a scratch lessons folder holding the valid test lesson as "c1/99-test"
    When I build the catalog of the scratch lessons
    Then the catalog lists the lesson "c1/99-test"

  Scenario: The authored draft lessons are checked and kept out of the catalog
    When I run the lesson CLI with "check --all"
    Then the CLI exits with 0
    And the CLI output mentions "ok   c1/07-flip-the-card"
    And the CLI output mentions "ok   c1/06-counting-with-lamps"
    And the CLI output mentions "ok   c1/08-inside-the-number"
    When I build the catalog of the real lessons
    Then the catalog lists the lesson "c1/05-add"
    And the catalog does not list the lesson "c1/07-flip-the-card"

  Scenario: Building a lesson that does not exist fails cleanly
    Given a scratch lessons folder holding the valid test lesson as "c1/99-test"
    When I run the lesson CLI on the scratch folder with "build c1/98-missing"
    Then the CLI exits with 1
    And the CLI output mentions "cannot read lesson"
