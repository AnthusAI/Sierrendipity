Feature: Progress, mastery and persistence
  Progress lives behind a ProgressStore interface. A pure in-memory store and a localStorage-backed
  store (with the storage injected, so these specs use a fake) share the same behaviour.

  Background:
    Given the clock is at day 1
    And a new in-memory progress store

  Scenario: A new student has an empty record
    Then lesson "c1/01-press-the-button" for "ana" is not passed with 0 attempts
    And "ana" has no concept mastery

  Scenario: Attempts accumulate and the best counts only improve
    When "ana" attempts "c1/01-press-the-button" and fails
    And "ana" attempts "c1/01-press-the-button" and passes with stars "pass" using 6 cards and 9 steps
    And "ana" attempts "c1/01-press-the-button" and passes with stars "pass, called-it" using 4 cards and 4 steps
    And "ana" attempts "c1/01-press-the-button" and passes with stars "pass" using 5 cards and 7 steps
    Then lesson "c1/01-press-the-button" for "ana" is passed with 4 attempts
    And lesson "c1/01-press-the-button" for "ana" has bonuses "called-it"
    And lesson "c1/01-press-the-button" for "ana" has best 4 cards and 4 steps
    And lesson "c1/01-press-the-button" for "ana" first passed on day 1

  Scenario: A failed attempt records nothing as best
    When "ana" attempts "c1/01-press-the-button" and fails
    Then lesson "c1/01-press-the-button" for "ana" is not passed with 1 attempts
    And lesson "c1/01-press-the-button" for "ana" has no best counts

  Scenario: Students are kept apart
    When "ana" attempts "c1/01-press-the-button" and passes with stars "pass" using 4 cards and 4 steps
    Then lesson "c1/01-press-the-button" for "ben" is not passed with 0 attempts

  Scenario: Hints per rung, Show me and prediction accuracy are recorded
    When "ana" uses hint rung 1 on "c1/01-press-the-button"
    And "ana" uses hint rung 1 on "c1/01-press-the-button"
    And "ana" uses hint rung 3 on "c1/01-press-the-button"
    And "ana" uses Show me on "c1/01-press-the-button" teaching ""
    And "ana" predicts correctly on "c1/01-press-the-button" teaching ""
    And "ana" predicts wrongly on "c1/01-press-the-button" teaching ""
    And "ana" predicts correctly on "c1/01-press-the-button" teaching ""
    Then lesson "c1/01-press-the-button" for "ana" used hints "2, 0, 1"
    And lesson "c1/01-press-the-button" for "ana" used Show me 1 times
    And lesson "c1/01-press-the-button" for "ana" predicted 2 of 3 correctly

  Scenario: Passing a lesson introduces its concepts at Leitner box 1
    Given the clock is at day 2
    When "ana" passes "c1/01-press-the-button" teaching "add, boxes" using 4 cards and 4 steps
    Then the mastery of "add" for "ana" is box 1, last seen on day 2
    And the mastery of "boxes" for "ana" is box 1, last seen on day 2

  Scenario Outline: Mastery moves one box at a time and stays between 0 and 3
    Given "ana" passed "c1/01-press-the-button" teaching "add" on day 1
    When "ana" does the following about "add": <actions>
    Then the mastery of "add" for "ana" is box <box>

    Examples:
      | actions                                      | box |
      | a correct warm-up                            | 2   |
      | a correct warm-up, a correct warm-up         | 3   |
      | 3 correct warm-ups, a correct warm-up        | 3   |
      | a correct prediction                         | 2   |
      | a missed warm-up                             | 0   |
      | a missed warm-up, a missed warm-up           | 0   |
      | a missed prediction                          | 0   |
      | Show me                                      | 0   |
      | a correct warm-up, Show me                   | 1   |
      | 2 correct warm-ups, a missed warm-up         | 2   |
      | a correct warm-up, a missed prediction, a correct warm-up | 2 |

  Scenario: Last-seen moves with every change
    Given "ana" passed "c1/01-press-the-button" teaching "add" on day 1
    And the clock is at day 5
    When "ana" does the following about "add": a correct warm-up
    Then the mastery of "add" for "ana" is box 2, last seen on day 5

  Scenario: The event log is bounded and keeps the newest events
    Given a new in-memory progress store keeping at most 5 events
    When "ana" uses hint rung 1 on "c1/01-press-the-button" 12 times
    Then "ana" has 5 stored events
    And lesson "c1/01-press-the-button" for "ana" used hints "12, 0, 0"

  Scenario: Subscribers hear about changes until they unsubscribe
    Given a subscriber is listening
    When "ana" attempts "c1/01-press-the-button" and fails
    And "ana" uses hint rung 2 on "c1/01-press-the-button"
    Then the subscriber heard 2 changes for "ana"
    When the subscriber stops listening
    And "ana" attempts "c1/01-press-the-button" and fails
    Then the subscriber heard 2 changes for "ana"

  Scenario: Export is a versioned copy that cannot change the store
    When "ana" attempts "c1/01-press-the-button" and passes with stars "pass" using 4 cards and 4 steps
    And I export the progress of "ana" and change the copy
    Then lesson "c1/01-press-the-button" for "ana" is passed with 1 attempts
    And the export is version 1 for "ana" and survives a JSON round trip

  Scenario Outline: Bad input is refused
    When I record <what> for "ana"
    Then recording is refused with "<message>"

    Examples:
      | what                       | message                  |
      | a hint of rung 4           | rung                     |
      | an attempt with -3 cards   | cards                    |
      | an attempt for ""          | lesson id                |

  # ---- localStorage

  Scenario: Progress persists under a versioned key and reloads in a new store
    Given a localStorage progress store over an empty storage
    When "ana" passes "c1/01-press-the-button" teaching "add" using 4 cards and 4 steps
    And "ana" uses hint rung 2 on "c1/01-press-the-button"
    Then the storage holds the key "sierrendipity:progress:ana" with version 1
    When a new localStorage progress store opens the same storage
    Then lesson "c1/01-press-the-button" for "ana" is passed with 1 attempts
    And lesson "c1/01-press-the-button" for "ana" used hints "0, 1, 0"
    And the mastery of "add" for "ana" is box 1, last seen on day 1

  Scenario: Different students use different keys
    Given a localStorage progress store over an empty storage
    When "ana" attempts "c1/01-press-the-button" and fails
    And "ben" attempts "c1/01-press-the-button" and fails
    Then the storage holds the key "sierrendipity:progress:ana" with version 1
    And the storage holds the key "sierrendipity:progress:ben" with version 1

  Scenario: Version 0 data (a list of passed lessons) is migrated
    Given a localStorage progress store over a storage where "sierrendipity:progress:ana" holds '{"passed":["c1/01-press-the-button","c1/02-change-the-number"]}'
    Then lesson "c1/01-press-the-button" for "ana" is passed with 0 attempts
    And lesson "c1/02-change-the-number" for "ana" is passed with 0 attempts
    And the storage holds the key "sierrendipity:progress:ana" with version 1

  Scenario Outline: Corrupt data falls back to an empty record and keeps a backup
    Given a localStorage progress store over a storage where "sierrendipity:progress:ana" holds '<raw>'
    Then lesson "c1/01-press-the-button" for "ana" is not passed with 0 attempts
    And the load status for "ana" is "<status>"
    And the storage keeps a backup of "<raw>" for "ana"

    Examples:
      | raw                                 | status  |
      | {not json                           | corrupt |
      | [1,2,3]                             | corrupt |
      | {"version":1,"lessons":"nope"}      | corrupt |
      | {"version":99,"lessons":{}}         | too-new |

  Scenario: Bad fields inside valid data are dropped or repaired, not trusted
    Given a localStorage progress store over a storage where "sierrendipity:progress:ana" holds '{"version":1,"userId":"ana","lessons":{"c1/01-press-the-button":{"passed":true,"bonuses":["called-it",7],"bestCards":-4,"bestSteps":"x","hintsUsed":[1,"a",2],"showMeUsed":-1,"attempts":2.5},"bad":5},"mastery":{"add":{"box":9,"lastSeen":1,"introducedAt":1},"junk":"x"},"events":[{"type":"hint","at":1,"lessonId":"c1/01-press-the-button","rung":1},{"type":"nope"}]}'
    Then lesson "c1/01-press-the-button" for "ana" is passed with 0 attempts
    And lesson "c1/01-press-the-button" for "ana" has bonuses "called-it"
    And lesson "c1/01-press-the-button" for "ana" has no best counts
    And lesson "c1/01-press-the-button" for "ana" used hints "1, 0, 2"
    And lesson "c1/01-press-the-button" for "ana" used Show me 0 times
    And the mastery of "add" for "ana" is box 3, last seen on day 0
    And "ana" has no concept mastery for "junk"
    And "ana" has 1 stored events

  Scenario: A full storage does not lose progress in memory
    Given a localStorage progress store over a storage that refuses writes
    When "ana" attempts "c1/01-press-the-button" and passes with stars "pass" using 4 cards and 4 steps
    Then lesson "c1/01-press-the-button" for "ana" is passed with 1 attempts
    And the last save failed

  Scenario: A storage that refuses reads is survivable
    Given a localStorage progress store over a storage that refuses reads
    Then lesson "c1/01-press-the-button" for "ana" is not passed with 0 attempts
    And the load status for "ana" is "unavailable"

  # ---- review fixes

  Scenario Outline: Ids cannot reach the prototype or collide with storage keys
    When I record <what> for "ana"
    Then recording is refused with "<message>"

    Examples:
      | what                              | message   |
      | an attempt for "__proto__"        | lesson id |
      | an attempt for "Constructor"      | lesson id |
      | a warm-up for the concept "__proto__" | concept id |
      | an attempt for "a:b"              | lesson id |

  Scenario: A lesson named constructor is just a lesson
    Then lesson "constructor" for "ana" is not passed with 0 attempts
    When "ana" attempts "constructor" and passes with stars "pass" using 1 cards and 1 steps
    Then lesson "constructor" for "ana" is passed with 1 attempts
    And Object.prototype is clean

  Scenario: A student id cannot contain a colon
    Then the store refuses the student id "a:backup"
    And the store refuses the student id "__proto__"

  Scenario: Loading stored data with a prototype key does not pollute anything
    Given a localStorage progress store over a storage where "sierrendipity:progress:ana" holds '{"version":1,"userId":"ana","lessons":{"__proto__":{"passed":true},"c1/01-press-the-button":{"passed":true}},"mastery":{"__proto__":{"box":3,"lastSeen":1,"introducedAt":1}},"events":[]}'
    Then lesson "c1/01-press-the-button" for "ana" is passed with 0 attempts
    And Object.prototype is clean
    And "ana" has no concept mastery

  Scenario: The backup key cannot be another student's progress key
    Given a localStorage progress store over a storage where "sierrendipity:progress:ana" holds '{not json'
    Then lesson "c1/01-press-the-button" for "ana" is not passed with 0 attempts
    And the backup of "ana" is not under any progress key

  Scenario: A throwing subscriber does not break saving or the other subscribers
    Given a localStorage progress store over an empty storage
    And a subscriber that throws is listening
    And a subscriber is listening
    When "ana" attempts "c1/01-press-the-button" and fails
    Then the subscriber heard 1 changes for "ana"
    And the storage holds the key "sierrendipity:progress:ana" with version 1

  Scenario: Passing raises a concept to at least box 1 even after Show me
    When "ana" uses Show me on "c1/01-press-the-button" teaching "cards"
    Then the mastery of "cards" for "ana" is box 0
    When "ana" passes "c1/01-press-the-button" teaching "cards" using 1 cards and 2 steps
    Then the mastery of "cards" for "ana" is box 1

  Scenario: A clock that returns nonsense is refused
    Given a store whose clock returns NaN
    Then recording an attempt is refused with "clock"

  Scenario: Runtime caps match the caps applied on load
    When "ana" attempts 500 different lessons
    Then recording an attempt for a 501st lesson is refused with "500 lessons"
    And "ana" can still record another attempt for an existing lesson

  Scenario: The warm-up rotation counter survives a truncated event log
    Given a new in-memory progress store keeping at most 3 events
    When "ana" answers 5 warm-ups for the concept "m"
    Then the warm-up counter for "m" of "ana" is 5
