@web @coach @stage
Feature: Draft lessons stay out of the shipping course
  A lesson marked `draft: true` is built so it can be played, but it is not in the catalog, not on the Learn path
  and not in a production bundle. It plays only at /learn/<id>?draft=1, and only in a dev or test build.

  Background:
    Given a mock backend that needs 0 ms to start

  Scenario: The catalog lists the shipping lessons and no draft
    When I read the catalog of the real course
    Then the catalog lists "c1/05-add"
    And the catalog does not list "c1/06-flip-the-card"
    And the catalog does not list "c1/07-counting-with-lamps"
    And the catalog does not list "c1/08-inside-the-number"
    And the catalog does not list "x1/01-diagrams"

  Scenario: The Learn path shows no draft lesson
    When I open the real course at "/learn"
    Then I see the heading "Course 1"
    And I see "Press the Button"
    And I do not see "Flip the Card"
    And I do not see "Counting with Lamps"
    And I do not see "Stage fixture"

  Scenario Outline: A draft cannot be opened without ?draft=1
    When I open the real course at "<path>"
    Then I see "We could not find that lesson."

    Examples:
      | path                              |
      | /learn/c1/06-flip-the-card        |
      | /learn/c1/07-counting-with-lamps  |
      | /learn/x1/02-lamps                |
      | /learn/c1/06-flip-the-card?draft=0 |

  Scenario: With ?draft=1 a draft plays in the real course on the real stage
    When I open the real course at "/learn/c1/06-flip-the-card?draft=1"
    Then I see the heading "Flip the Card"
    And the stage is the real machine view
    When I press Continue
    Then the coach says "Flip the card"
    And the stage shows "flip"

  Scenario: A lesson that is not a draft is not opened by the flag
    When I open the real course at "/learn/c1/05-add?draft=1"
    Then I see "Not open yet"

  Scenario: A lesson that does not exist is not found even with the flag
    When I open the real course at "/learn/c1/99-nothing?draft=1"
    Then I see "We could not find that lesson."

  Scenario: A production build leaves the drafts out of the bundle
    When I build the web app for production into a scratch folder
    Then no file of that build holds "Flip the Card"
    And no file of that build holds "Stage fixture"
    And no file of that build holds "Counting with Lamps"
    And a file of that build holds "Press the Button"
