Feature: Warm-ups and the course path
  Each session opens with one predict-the-result warm-up from the weakest older concept. The path
  shows one primary Continue, the next lesson dim, later lessons in fog and side rooms as doors.
  Stars never gate the path: passing opens the next lesson, bonuses only open side rooms.

  Background:
    Given the authored lessons c1/01-wake and c1/02-change-one-number
    And the clock is at day 1
    And a new in-memory progress store

  Scenario: A concept introduced less than a day ago gets no warm-up yet
    Given "ana" passed "c1/01-wake" teaching "add, boxes" on day 1
    And the clock is at day 1.5
    Then there is no warm-up for "ana"

  Scenario: The first warm-up is for the weakest concept introduced at least a day ago
    Given "ana" passed "c1/01-wake" teaching "add, boxes" on day 1
    And "ana" does the following about "add": a correct warm-up
    And the clock is at day 3
    Then the warm-up for "ana" is for the concept "boxes"
    And the warm-up question mentions "Card one puts 9"
    And the warm-up expects 10

  Scenario: Ties go to the concept seen longest ago
    Given "ana" passed "c1/01-wake" teaching "boxes" on day 1
    And "ana" passed "c1/01-wake" teaching "add" on day 2
    And the clock is at day 4
    Then the warm-up for "ana" is for the concept "boxes"

  Scenario: A missed concept comes back first
    Given "ana" passed "c1/01-wake" teaching "add, boxes" on day 1
    And "ana" does the following about "boxes": 2 correct warm-ups
    And "ana" does the following about "add": a correct warm-up
    And the clock is at day 3
    Then the warm-up for "ana" is for the concept "add"
    When "ana" does the following about "add": 2 missed warm-ups
    And "ana" does the following about "boxes": 3 missed warm-ups
    Then the warm-up for "ana" is for the concept "add"

  Scenario: Concepts without a warm-up are skipped
    Given "ana" passed "c1/01-wake" teaching "stop" on day 1
    And the clock is at day 3
    Then there is no warm-up for "ana"

  Scenario: Warm-ups for one concept rotate as they are answered
    Given a three-lesson course
    And "ana" passed "x/01" teaching "m" on day 1
    And the clock is at day 3
    Then the warm-up for "ana" has the id "w1"
    When "ana" answers the warm-up with 1
    Then the warm-up for "ana" has the id "w2"
    When "ana" answers the warm-up with 2
    Then the warm-up for "ana" has the id "w1"

  Scenario: Answering a warm-up moves mastery
    Given "ana" passed "c1/01-wake" teaching "add" on day 1
    And the clock is at day 3
    When "ana" answers the warm-up with 7
    Then the mastery of "add" for "ana" is box 2, last seen on day 3
    When "ana" answers the warm-up with 8
    Then the mastery of "add" for "ana" is box 1, last seen on day 3

  Scenario: A new student starts at lesson 1 with exactly one Continue
    Then the path for "ana" shows "c1/01-wake" as current
    And the path for "ana" shows "c1/02-change-one-number" as next
    And the continue target for "ana" is the lesson "c1/01-wake"

  Scenario: Passing a lesson moves the path on, whatever the stars
    When "ana" attempts "c1/01-wake" and passes with stars "pass" using 4 cards and 4 steps
    Then the path for "ana" shows "c1/01-wake" as done
    And the path for "ana" shows "c1/02-change-one-number" as current
    And the continue target for "ana" is the lesson "c1/02-change-one-number"
    And "ana" has exactly one continue target

  Scenario: Finishing every lesson ends the path
    When "ana" attempts "c1/01-wake" and passes with stars "pass, called-it" using 4 cards and 4 steps
    And "ana" attempts "c1/02-change-one-number" and passes with stars "pass" using 4 cards and 4 steps
    Then the continue target for "ana" is the end of the course
    And the path for "ana" shows no current lesson

  Scenario: Lessons further along are in fog with their titles only
    Given a three-lesson course
    Then the path for "ana" shows "x/01" as current
    And the path for "ana" shows "x/02" as next
    And the path for "ana" shows "x/03" as fog with only its title

  Scenario: Side rooms open only with their bonus star
    Given a three-lesson course
    Then the side room "hex-secrets" is closed for "ana"
    When "ana" attempts "x/01" and passes with stars "pass" using 4 cards and 4 steps
    Then the side room "hex-secrets" is closed for "ana"
    And the path for "ana" shows "x/02" as current
    When "ana" attempts "x/01" and passes with stars "pass, another-way" using 4 cards and 4 steps
    Then the side room "hex-secrets" is open for "ana"
    And the path for "ana" shows "x/02" as current

  Scenario: Passing a later lesson first does not skip an unpassed one
    Given a three-lesson course
    When "ana" attempts "x/02" and passes with stars "pass" using 4 cards and 4 steps
    Then the path for "ana" shows "x/01" as current
    And the path for "ana" shows "x/02" as done
